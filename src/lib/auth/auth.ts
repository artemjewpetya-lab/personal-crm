import "server-only";

import { createHash } from "node:crypto";

import { and, eq, like, ne, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db/client";
import { accounts, groups, sessions, users, verifications } from "@/db/schema";
import { PRESET_GROUP_NAMES } from "@/lib/groups/presets";
import { sendSignInEmail } from "@/lib/mail/send";

import {
  INVALID_EMAIL,
  MAIL_NOT_SENT,
  SIGN_IN_ERROR_CODES,
  TOO_MANY_ADDRESSES,
  TOO_MANY_EMAILS,
} from "./messages";
import {
  deviceOf,
  releaseSignInEmail,
  reserveSignInEmail,
  SignInLimitError,
} from "./sign-in-limits";
import { signInEmailSchema } from "./validation";

const SIGN_IN_PATH = "/sign-in/magic-link";
/** A sign-in link works for 15 minutes. */
const LINK_LIFETIME_SECONDS = 15 * 60;
/** Signed in for 30 days after the last visit ... */
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
/** ... and the end date moves forward at most once an hour. */
const SESSION_REFRESH_SECONDS = 60 * 60;

/**
 * Better Auth keeps only a fingerprint of the link's code in the database, so a stolen copy of
 * the database does not let anyone in. We use our own function (not the built-in "hashed"
 * mode) to know which database row belongs to the link we have just made.
 */
function fingerprintOf(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/** How Better Auth names the database row of a link: "magic-link:" and the fingerprint. */
const linkRowOf = (token: string) => `magic-link:${fingerprintOf(token)}`;

/**
 * Before the sign-in request reaches Better Auth: checks the address and both limits. It runs
 * for requests from the form and for any other request to this address, so the form is not
 * the only guard.
 */
const beforeSignInRequest = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== SIGN_IN_PATH) return;

  const parsed = signInEmailSchema.safeParse((ctx.body as { email?: unknown } | undefined)?.email);
  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", {
      message: INVALID_EMAIL,
      code: SIGN_IN_ERROR_CODES.INVALID_EMAIL,
    });
  }
  const email = parsed.data;

  let sentEmailId: string;
  try {
    sentEmailId = await reserveSignInEmail(email, deviceOf(ctx.headers ?? ctx.request?.headers));
  } catch (error) {
    if (error instanceof SignInLimitError) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: error.kind === "device" ? TOO_MANY_ADDRESSES : TOO_MANY_EMAILS,
        code:
          error.kind === "device"
            ? SIGN_IN_ERROR_CODES.TOO_MANY_ADDRESSES
            : SIGN_IN_ERROR_CODES.TOO_MANY_EMAILS,
      });
    }
    throw error;
  }

  // The cleaned address goes on to Better Auth. The id of the written row travels in
  // `metadata`, which Better Auth hands to sendMagicLink; whatever the request had there is
  // replaced.
  return {
    context: { body: { ...(ctx.body as object), email, metadata: { sentEmailId } } },
  };
});

export const auth = betterAuth({
  // BETTER_AUTH_SECRET signs the sign-in cookie, BETTER_AUTH_URL is the address of the app
  // (the link in the email is built from it). Both come from .env.
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
    // Our tables are plural (users, sessions, ...), like contacts and groups.
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),

  advanced: {
    database: { generateId: "uuid" },
    // Same order as in deviceOf: what nginx wrote first.
    ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
  },

  session: { expiresIn: SESSION_LIFETIME_SECONDS, updateAge: SESSION_REFRESH_SECONDS },

  hooks: { before: beforeSignInRequest },

  databaseHooks: {
    user: {
      create: {
        // Runs once for each new user (the first sign-in by link): their own ready-made groups.
        // A group deleted later does not come back, because this does not run again.
        after: async (user) => {
          await db
            .insert(groups)
            .values(PRESET_GROUP_NAMES.map((name) => ({ userId: user.id, name })));
        },
      },
    },
  },

  plugins: [
    magicLink({
      expiresIn: LINK_LIFETIME_SECONDS,
      storeToken: { type: "custom-hasher", hash: async (token) => fingerprintOf(token) },
      sendMagicLink: async ({ email, url, token, metadata }) => {
        const sentEmailId = typeof metadata?.sentEmailId === "string" ? metadata.sentEmailId : null;
        try {
          await sendSignInEmail(email, url);
        } catch (error) {
          console.error("Failed to send the sign-in email", error);
          // Not sent: the new link and the counted email are taken back, the earlier links stay.
          await db.delete(verifications).where(eq(verifications.identifier, linkRowOf(token)));
          if (sentEmailId) await releaseSignInEmail(sentEmailId);
          throw new APIError("SERVICE_UNAVAILABLE", {
            message: MAIL_NOT_SENT,
            code: SIGN_IN_ERROR_CODES.MAIL_NOT_SENT,
          });
        }

        // A new link cancels the earlier ones for this address. Better Auth stores who the
        // link is for as JSON in the "value" column; the test "Запросил новую ссылку" notices
        // if a later version changes that.
        await db.delete(verifications).where(
          and(
            like(verifications.identifier, "magic-link:%"),
            ne(verifications.identifier, linkRowOf(token)),
            sql`case when ${verifications.identifier} like 'magic-link:%'
                  then ${verifications.value}::jsonb ->> 'email' end = ${email}`,
          ),
        );
      },
    }),
    // Must be the last plugin: lets server actions set and clear the sign-in cookie.
    nextCookies(),
  ],
});
