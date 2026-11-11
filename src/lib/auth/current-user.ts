import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "./auth";

export type CurrentUser = { id: string; email: string };

/**
 * Who is signed in on this request. Without a valid sign-in it sends the person to the sign-in
 * page. This is the real guard: every page and every server action asks it first, and
 * `proxy.ts` is only a convenience in front.
 *
 * The user id for the data queries comes only from here, never from what the browser sent.
 * Reads the request's headers, so it must be called inside `<Suspense>` on pages.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return { id: session.user.id, email: session.user.email };
});

/** Like getCurrentUser, but a person who is not signed in gets `null` instead of a redirect. */
export const findCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, email: session.user.email } : null;
});
