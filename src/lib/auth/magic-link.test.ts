import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { groups, sessions, users, verifications } from "@/db/schema";

import { givenContact, givenGroup, givenUser } from "../../../test/factories";
import { deleteMessagesTo, messagesTo } from "../../../test/mailpit";
import { TEST_OWNER_EMAIL } from "../../../test/migrations";
import { cookieOf, openLink, redirectedTo, requestLink } from "../../../test/sign-in";

// Opening the link from the email, the way the browser does it.

const EXPIRED_PAGE = "/login/expired";

beforeEach(async () => {
  for (const address of ["anna@example.com", "boris@example.com", TEST_OWNER_EMAIL]) {
    await deleteMessagesTo(address);
  }
});

async function groupNamesOf(email: string): Promise<string[]> {
  const rows = await db
    .select({ name: groups.name })
    .from(groups)
    .innerJoin(users, eq(groups.userId, users.id))
    .where(eq(users.email, email));
  return rows.map((row) => row.name).sort();
}

describe("Вход по ссылке из письма", () => {
  it("Первый вход - регистрация", async () => {
    const link = await requestLink("boris@example.com");

    const response = await openLink(link);

    // Straight into the app: to the main page, with the sign-in cookie
    expect(response.status).toBe(302);
    expect(redirectedTo(response)).toBe("/");
    expect(response.headers.get("set-cookie")).toMatch(/session_token=/);
    // A user was made without a name; the address is confirmed by the link itself
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "boris@example.com", name: "", emailVerified: true });
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("Одна почта - один пользователь", async () => {
    const firstCookie = cookieOf(await openLink(await requestLink("anna@example.com")));
    expect(firstCookie).not.toBe("");
    const [anna] = await db.select().from(users);
    await givenContact(anna.id, "Вера");

    // Signs in again, the address written another way
    const response = await openLink(await requestLink("ANNA@example.com"));

    expect(redirectedTo(response)).toBe("/");
    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(anna.id);
    // Two browsers, one user: both sessions belong to Anna
    const owners = await db.select({ userId: sessions.userId }).from(sessions);
    expect(owners).toEqual([{ userId: anna.id }, { userId: anna.id }]);
  });

  it("Готовые группы нового пользователя", async () => {
    // Somebody else has a group of their own
    const other = await givenUser("anna@example.com");
    await givenGroup(other, "Теннис");

    await openLink(await requestLink("boris@example.com"));

    expect(await groupNamesOf("boris@example.com")).toEqual(["Друзья", "Коллеги", "Семья"]);
    expect(await groupNamesOf("anna@example.com")).toEqual(["Теннис"]);
  });

  it("Удалённая готовая группа не возвращается при следующем входе", async () => {
    await openLink(await requestLink("boris@example.com"));
    await db.delete(groups).where(sql`${groups.name} = 'Коллеги'`);

    await openLink(await requestLink("boris@example.com"));

    expect(await groupNamesOf("boris@example.com")).toEqual(["Друзья", "Семья"]);
  });

  it("Владелец входит", async () => {
    // What the update left: the owner and their three groups (ready-made ones from before)
    const ownerId = await givenUser(TEST_OWNER_EMAIL);
    for (const name of ["Семья", "Друзья", "Коллеги"]) await givenGroup(ownerId, name);
    await givenContact(ownerId, "Старый контакт");

    const response = await openLink(await requestLink("OWNER@Example.COM"));

    expect(redirectedTo(response)).toBe("/");
    expect(await db.select().from(users)).toHaveLength(1);
    const [session] = await db.select().from(sessions);
    expect(session.userId).toBe(ownerId);
    // The ready-made groups were not added a second time
    expect(await groupNamesOf(TEST_OWNER_EMAIL)).toEqual(["Друзья", "Коллеги", "Семья"]);
  });

  describe("страница «Ссылка устарела»", () => {
    function expectNotSignedIn(response: Response) {
      expect(redirectedTo(response)).toMatch(new RegExp(`^${EXPIRED_PAGE}(\\?|$)`));
      expect(cookieOf(response)).toBe("");
    }

    it("Прошло больше 15 минут", async () => {
      const link = await requestLink("anna@example.com");
      // The email came more than 15 minutes ago
      await db.update(verifications).set({ expiresAt: sql`now() - interval '1 minute'` });

      const response = await openLink(link);

      expectNotSignedIn(response);
      expect(await db.select().from(sessions)).toEqual([]);
    });

    it("Запросил новую ссылку", async () => {
      const first = await requestLink("anna@example.com");
      const second = await requestLink("anna@example.com");
      expect(await messagesTo("anna@example.com")).toHaveLength(2);

      expectNotSignedIn(await openLink(first));
      const response = await openLink(second);

      expect(redirectedTo(response)).toBe("/");
      expect(cookieOf(response)).toMatch(/session_token=/);
    });

    it("Испорченная ссылка", async () => {
      const link = await requestLink("anna@example.com");

      // A cut-off code and a changed one
      for (const damaged of [
        link.replace(/token=[^&]*/, (code) => code.slice(0, -5)),
        link.replace(/token=[^&]*/, (code) => `${code}x`),
      ]) {
        expectNotSignedIn(await openLink(damaged));
      }
      expect(await db.select().from(sessions)).toEqual([]);
      // The link itself was not spent by the attempts
      expect(redirectedTo(await openLink(link))).toBe("/");
    });

    it("Ссылку открыли второй раз", async () => {
      const link = await requestLink("anna@example.com");
      expect(redirectedTo(await openLink(link))).toBe("/");

      // Again, from another browser (no cookie)
      expectNotSignedIn(await openLink(link));
      expect(await db.select().from(sessions)).toHaveLength(1);
    });
  });
});
