import { createServer } from "node:net";

import { and, eq, like, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { signInEmails, verifications } from "@/db/schema";
import { auth } from "@/lib/auth/auth";

import { messagesTo, signInLinkOf, waitForMessageTo } from "./mailpit";

// Helpers for tests of the sign-in request: the real Better Auth handler, the real tables.

export const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/** A request to the sign-in endpoint, as a script that skips the form would send it. */
export function postSignInLink(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

/** Asks for a link to `email` the way the form does and returns the link from the caught email. */
export async function requestLink(email: string, headers: Record<string, string> = {}) {
  const sentBefore = (await messagesTo(email)).length;
  const response = await postSignInLink(
    { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
    headers,
  );
  if (!response.ok) throw new Error(`The link for ${email} was not sent (${response.status})`);
  return signInLinkOf(await waitForMessageTo(email, sentBefore + 1));
}

/** Opens a link from an email, the way the browser does. */
export function openLink(link: string): Promise<Response> {
  return auth.handler(new Request(link));
}

/** Where the answer sends the browser, as a path with the query. */
export function redirectedTo(response: Response): string {
  const location = response.headers.get("location");
  if (!location) throw new Error(`No redirect (status ${response.status})`);
  const url = new URL(location, BASE_URL);
  return url.pathname + url.search;
}

/** The "Cookie" header a browser would send after getting these answers. */
export function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
}

/** Signs in with a fresh link, as a new browser. Returns its cookie. */
export async function signInAs(email: string): Promise<string> {
  const response = await openLink(await requestLink(email));
  const cookie = cookieOf(response);
  if (!cookie) throw new Error(`Opening the link for ${email} did not sign in`);
  return cookie;
}

/** Sign-in links that are waiting to be used (all of them, or the ones for one address). */
export async function pendingLinkIds(email?: string): Promise<string[]> {
  const rows = await db
    .select({ identifier: verifications.identifier })
    .from(verifications)
    .where(
      email
        ? and(
            like(verifications.identifier, "magic-link:%"),
            sql`${verifications.value}::jsonb ->> 'email' = ${email}`,
          )
        : like(verifications.identifier, "magic-link:%"),
    );
  return rows.map((row) => row.identifier).sort();
}

/** How many sign-in emails the limits have counted for the address. */
export async function loggedEmails(email: string): Promise<number> {
  const rows = await db.select().from(signInEmails).where(eq(signInEmails.email, email));
  return rows.length;
}

/**
 * Moves the oldest counted email of the address back in time, so we do not wait for real
 * minutes.
 */
export async function ageOldestLoggedEmail(email: string, minutes: number): Promise<void> {
  await db
    .update(signInEmails)
    .set({ createdAt: sql`${signInEmails.createdAt} - ${minutes} * interval '1 minute'` })
    .where(
      sql`${signInEmails.id} = (
        select id from sign_in_emails where email = ${email} order by created_at limit 1
      )`,
    );
}

/** A port on this computer where nothing listens: a mail server that is down. */
export function closedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}
