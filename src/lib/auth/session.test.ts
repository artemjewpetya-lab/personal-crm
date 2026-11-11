import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { signOut } from "@/app/login/actions";

import { deleteMessagesTo } from "../../../test/mailpit";
import { setRequestHeaders } from "../../../test/request-context";
import { signInAs } from "../../../test/sign-in";

import { getCurrentUser } from "./current-user";

// Who is signed in on this device: how long the sign-in lasts and how to sign out.

beforeEach(async () => {
  for (const address of ["anna@example.com", "boris@example.com"]) {
    await deleteMessagesTo(address);
  }
});

/** What a page or an action receives when a server component asks for the current user. */
async function currentUserWith(cookie: string | null) {
  setRequestHeaders(cookie ? { cookie } : {});
  return getCurrentUser().then(
    (user) => ({ user, redirectedTo: null }),
    (error: { digest?: string }) => {
      const match = /^NEXT_REDIRECT;[^;]*;([^;]*);/.exec(error.digest ?? "");
      if (!match) throw error;
      return { user: null, redirectedTo: match[1] };
    },
  );
}

describe("getCurrentUser", () => {
  it("Вошёл по ссылке: возвращает его почту", async () => {
    const cookie = await signInAs("anna@example.com");

    const { user } = await currentUserWith(cookie);

    expect(user).toMatchObject({ email: "anna@example.com" });
    expect(user?.id).toEqual(expect.any(String));
  });

  it("Без входа ведёт на страницу входа", async () => {
    expect(await currentUserWith(null)).toEqual({ user: null, redirectedTo: "/login" });
    expect(await currentUserWith("better-auth.session_token=made-up.value")).toEqual({
      user: null,
      redirectedTo: "/login",
    });
  });

  it("Не заходил 30 дней", async () => {
    const cookie = await signInAs("anna@example.com");
    // The sign-in ran out yesterday
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 day'` });

    expect(await currentUserWith(cookie)).toEqual({ user: null, redirectedTo: "/login" });
  });
});

describe("signOut", () => {
  it("Выход только на этом устройстве", async () => {
    const first = await signInAs("anna@example.com");
    const second = await signInAs("anna@example.com");
    expect(await db.select().from(sessions)).toHaveLength(2);

    // Signs out in the first browser
    setRequestHeaders({ cookie: first });
    const error = await signOut().catch((failure: { digest?: string }) => failure);
    expect(error.digest).toMatch(/^NEXT_REDIRECT;[^;]*;\/login;/);

    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await currentUserWith(first)).toEqual({ user: null, redirectedTo: "/login" });
    expect((await currentUserWith(second)).user).toMatchObject({ email: "anna@example.com" });
  });
});
