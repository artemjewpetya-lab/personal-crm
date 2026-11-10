import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { sessions } from "@/db/schema";

import { deleteMessagesTo } from "../test/mailpit";
import { signInAs } from "../test/sign-in";

import { proxy } from "./proxy";

// The first line of defence: no cookie, no page. And the place where signing in is renewed.

const SITE = "http://localhost:3000";

beforeEach(async () => {
  await deleteMessagesTo("anna@example.com");
});

/** Opening a page in the browser: a normal request for a document. */
function openPage(path: string, cookie?: string) {
  return new NextRequest(`${SITE}${path}`, {
    headers: { accept: "text/html", ...(cookie ? { cookie } : {}) },
  });
}

function passedThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

function redirectPath(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? new URL(location, SITE).pathname : null;
}

describe("proxy", () => {
  it("Открыл приложение без входа", async () => {
    const response = await proxy(openPage("/"));

    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe("/login");
  });

  it("Прямая ссылка без входа", async () => {
    for (const path of ["/contacts/7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10", "/groups", "/?q=Вера"]) {
      const response = await proxy(openPage(path));

      expect(redirectPath(response), path).toBe("/login");
    }
  });

  it("Проверка /health и страницы входа открыты без входа", async () => {
    for (const path of ["/health", "/login", "/login/expired", "/api/auth/magic-link/verify"]) {
      expect(passedThrough(await proxy(openPage(path))), path).toBe(true);
    }
  });

  it("Вошёл: страница открывается", async () => {
    const cookie = await signInAs("anna@example.com");

    const response = await proxy(openPage("/", cookie));

    expect(passedThrough(response)).toBe(true);
  });

  it("Заходит регулярно: открытие страницы продлевает вход", async () => {
    const cookie = await signInAs("anna@example.com");
    // Signed in 25 days ago: five days of the 30 are left
    await db.update(sessions).set({ expiresAt: sql`now() + interval '5 days'` });

    const response = await proxy(openPage("/", cookie));

    expect(passedThrough(response)).toBe(true);
    // The end of the sign-in moved to 30 days from now, and the browser gets the renewed cookie
    const [{ days }] = await db
      .select({ days: sql<number>`(extract(epoch from (expires_at - now())) / 86400)::float8` })
      .from(sessions);
    expect(days).toBeGreaterThan(29);
    expect(response.headers.getSetCookie().join("\n")).toMatch(/session_token=/);
  });

  it("a background request does not renew the sign-in", async () => {
    const cookie = await signInAs("anna@example.com");
    await db.update(sessions).set({ expiresAt: sql`now() + interval '5 days'` });

    // What the browser sends when a page loads data in the background (navigation inside the app)
    const background = new NextRequest(`${SITE}/groups`, {
      headers: { rsc: "1", cookie },
    });
    const response = await proxy(background);

    expect(passedThrough(response)).toBe(true);
    const [{ days }] = await db
      .select({ days: sql<number>`(extract(epoch from (expires_at - now())) / 86400)::float8` })
      .from(sessions);
    expect(days).toBeLessThan(6);
  });
});
