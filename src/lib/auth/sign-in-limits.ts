import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { signInEmails } from "@/db/schema";

// Two limits protect other people's mailboxes from being spammed through the sign-in form.
// Both count the rows of "sign_in_emails": one row for every email that was sent.

/** At most this many emails to one address in the window below. */
export const EMAILS_PER_ADDRESS = 3;
/** The window of the address limit, in minutes. */
export const ADDRESS_WINDOW_MINUTES = 10;
/** At most this many different addresses from one device in an hour. */
export const ADDRESSES_PER_DEVICE = 5;

export class SignInLimitError extends Error {
  readonly kind: "address" | "device";

  constructor(kind: "address" | "device") {
    super(`Sign-in limit reached (${kind})`);
    this.kind = kind;
  }
}

/**
 * The device is the address the web server saw. nginx writes it into X-Real-IP and replaces
 * whatever the browser sent, so it cannot be faked. Without nginx (on a developer's computer,
 * in tests) Next.js puts the address of the connection at the end of X-Forwarded-For.
 */
export function deviceOf(headers: Headers | undefined | null): string {
  const real = headers?.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers?.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || "unknown";
}

/**
 * Checks both limits for one more email to `email` from `device` and, when it is allowed,
 * writes it down. Returns the id of the written row, so a failed send can take it back.
 * Throws SignInLimitError when a limit is reached; nothing is written then.
 *
 * Everything happens in one transaction under two locks (device first, then address, always
 * in this order), so two requests that arrive together cannot both slip in under a limit.
 */
export async function reserveSignInEmail(email: string, device: string): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sign-in-device:${device}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sign-in-address:${email}`}))`);

    // Device addresses are not kept longer than the hour the limit looks at.
    await tx.delete(signInEmails).where(sql`${signInEmails.createdAt} < now() - interval '1 hour'`);

    const addressesOfDevice = await tx
      .selectDistinct({ email: signInEmails.email })
      .from(signInEmails)
      .where(eq(signInEmails.ipAddress, device));
    const knownAddress = addressesOfDevice.some((row) => row.email === email);
    if (!knownAddress && addressesOfDevice.length >= ADDRESSES_PER_DEVICE) {
      throw new SignInLimitError("device");
    }

    const [{ recent }] = await tx
      .select({ recent: sql<number>`count(*)::int` })
      .from(signInEmails)
      .where(
        and(
          eq(signInEmails.email, email),
          sql`${signInEmails.createdAt} > now() - ${ADDRESS_WINDOW_MINUTES} * interval '1 minute'`,
        ),
      );
    if (recent >= EMAILS_PER_ADDRESS) throw new SignInLimitError("address");

    const [row] = await tx
      .insert(signInEmails)
      .values({ email, ipAddress: device })
      .returning({ id: signInEmails.id });
    return row.id;
  });
}

/** Takes back a row written by reserveSignInEmail: the email was not sent, so it does not count. */
export async function releaseSignInEmail(id: string): Promise<void> {
  await db.delete(signInEmails).where(eq(signInEmails.id, id));
}
