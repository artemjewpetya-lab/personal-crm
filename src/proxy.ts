import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/auth";

// In front of every page. Two jobs:
//  1. No sign-in cookie - the sign-in page. This is a convenience, not the guard: the pages and
//     the server actions check the sign-in themselves (getCurrentUser).
//  2. When a page is opened in the browser, the sign-in is renewed, so it lasts 30 days after
//     the last visit. A page that is being rendered cannot write cookies, so it is done here.

/** Open without signing in: the sign-in page, the link from the email, the deploy check. */
const OPEN_PREFIXES = ["/login", "/api/auth", "/health"];

function isOpen(pathname: string): boolean {
  return OPEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** The page itself being opened, not data that a page loads in the background. */
function isPageOpening(request: NextRequest): boolean {
  return (
    request.method === "GET" &&
    !request.headers.has("rsc") &&
    !request.headers.has("next-router-prefetch") &&
    (request.headers.get("accept") ?? "").includes("text/html")
  );
}

// Next.js wants a full address here. It is the public address of the app (BETTER_AUTH_URL), not
// the one the request seems to come to: behind nginx that may be 127.0.0.1:3000.
function toSignIn(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/login", process.env.BETTER_AUTH_URL ?? request.url));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isOpen(request.nextUrl.pathname)) return NextResponse.next();

  if (!getSessionCookie(request)) return toSignIn(request);

  // Background loads only check that the cookie exists: no database trip for each of them.
  if (!isPageOpening(request)) return NextResponse.next();

  const { headers, response: session } = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });
  if (!session) return toSignIn(request);

  // Better Auth moves the end of the sign-in forward (at most once an hour) and answers with
  // the renewed cookie. Pass it on to the browser.
  const next = NextResponse.next();
  for (const cookie of headers.getSetCookie()) next.headers.append("set-cookie", cookie);
  return next;
}

export const config = {
  // Everything except Next.js internals and files with an extension (icons, images).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
