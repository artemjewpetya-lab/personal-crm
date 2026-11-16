import { drizzle } from "drizzle-orm/node-postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../scripts/seed-database";
import { daysInMonth } from "../lib/contacts/birthdays";
import {
  createTemporaryDatabase,
  TEST_OWNER_EMAIL,
  type TemporaryDatabase,
} from "../../test/migrations";

// `pnpm db:seed`: demo data for the owner of the app, on an empty database.

describe("seedDatabase", () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createTemporaryDatabase();
    // A real, freshly updated database: the update gave the owner (TEST_OWNER_EMAIL)
    // the three ready-made groups, and there are no contacts yet.
    await database.migrate({ ownerEmail: TEST_OWNER_EMAIL });
  });

  afterEach(async () => {
    await database.drop();
  });

  async function count(table: string, where = "true"): Promise<number> {
    const { rows } = await database.pool.query<{ total: number }>(
      `select count(*)::int as total from ${table} where ${where}`,
    );
    return rows[0].total;
  }

  const ownedBy = (email: string) => `user_id = (select id from users where email = '${email}')`;

  it("Заполнить пустую базу", async () => {
    // Another user exists too: they must stay empty
    await database.pool.query(
      "insert into users (name, email, email_verified) values ('', 'other@example.com', true)",
    );

    // The address is written the way it might stand in .env
    const summary = await seedDatabase(drizzle(database.pool), " Owner@Example.com ");

    expect(summary).toMatchObject({ skipped: false, contacts: 1000 });
    // Everything is the owner's: contacts, notes, and the links go into the owner's own groups
    expect(await count("users", `email = '${TEST_OWNER_EMAIL}'`)).toBe(1);
    expect(await count("contacts")).toBe(1000);
    expect(await count("contacts", ownedBy(TEST_OWNER_EMAIL))).toBe(1000);
    expect(await count("notes")).toBeGreaterThan(1000);
    expect(await count("groups")).toBe(3);
    expect(await count("contact_groups")).toBeGreaterThan(0);
    // The other user has nothing
    expect(await count("contacts", ownedBy("other@example.com"))).toBe(0);
    expect(await count("groups", ownedBy("other@example.com"))).toBe(0);
  });

  it("makes the owner and their ready-made groups when the owner is not there yet", async () => {
    await seedDatabase(drizzle(database.pool), "new-owner@example.com");

    expect(await count("contacts", ownedBy("new-owner@example.com"))).toBe(1000);
    const { rows: groups } = await database.pool.query<{ name: string }>(
      `select name from groups where ${ownedBy("new-owner@example.com")} order by name`,
    );
    expect(groups.map((group) => group.name)).toEqual(["Друзья", "Коллеги", "Семья"]);
    // The links go to the new owner's groups, not to the other user's
    expect(
      await count(
        "contact_groups",
        `group_id in (select id from groups where ${ownedBy(TEST_OWNER_EMAIL)})`,
      ),
    ).toBe(0);
    expect(await count("contact_groups")).toBeGreaterThan(0);
  });

  it("does nothing when the database already has contacts", async () => {
    await seedDatabase(drizzle(database.pool), TEST_OWNER_EMAIL);

    const second = await seedDatabase(drizzle(database.pool), TEST_OWNER_EMAIL);

    expect(second).toMatchObject({ skipped: true });
    expect(await count("contacts")).toBe(1000);
  });

  it("stops with a clear message when OWNER_EMAIL is missing or wrong", async () => {
    for (const ownerEmail of [undefined, "", "   ", "not-an-email"]) {
      await expect(seedDatabase(drizzle(database.pool), ownerEmail)).rejects.toThrow(/OWNER_EMAIL/);
    }
    expect(await count("contacts")).toBe(0);
    expect(await count("users")).toBe(1);
  });

  it("Прежние демо-данные не изменились", async () => {
    await seedDatabase(drizzle(database.pool), TEST_OWNER_EMAIL);

    // The same seed gives the same contacts, notes and groups as before birth dates existed:
    // the dates are drawn last, so nothing drawn earlier moves. If this fails, the draw order
    // of scripts/seed-database.ts changed.
    const { rows } = await database.pool.query<{ fingerprint: string }>(
      `select concat_ws(
                ' / ',
                (select md5(string_agg(line, E'\n' order by line)) from (
                   select concat_ws('|', name, coalesce(about, ''), coalesce(how_we_met, ''),
                                    coalesce(phone, ''), coalesce(email, ''),
                                    coalesce(contact_frequency::text, '')) as line
                     from contacts) as contact_lines),
                (select md5(string_agg(body, E'\n' order by body)) from notes),
                (select md5(string_agg(line, E'\n' order by line)) from (
                   select c.name || '|' || coalesce(c.email, '') || '|' || g.name as line
                     from contact_groups cg
                     join contacts c on c.id = cg.contact_id
                     join groups g on g.id = cg.group_id) as membership_lines)
              ) as fingerprint`,
    );

    expect(rows[0].fingerprint).toBe(
      "1fdcee85bdae1d77570d0cef0adbf088 / e69f022c6f2e579e8118ae741c231bf3 / fc5fdc44cad42eee69a7273ea1ee344c",
    );
  });

  it("Дни рождения у демо-контактов", async () => {
    await seedDatabase(drizzle(database.pool), TEST_OWNER_EMAIL);

    // About 60% have a date, a third of those without a year; years 1950-2005
    const withDate = await count("contacts", "birth_day is not null");
    expect(withDate).toBeGreaterThan(520);
    expect(withDate).toBeLessThan(680);
    const withoutYear = await count("contacts", "birth_day is not null and birth_year is null");
    expect(withoutYear / withDate).toBeGreaterThan(0.25);
    expect(withoutYear / withDate).toBeLessThan(0.42);
    expect(
      await count("contacts", "birth_year is not null and birth_year not between 1950 and 2005"),
    ).toBe(0);

    // Every date exists: no 31 April, no 29 February in a year that is not a leap year
    const { rows } = await database.pool.query<{ day: number; month: number; year: number | null }>(
      "select birth_day as day, birth_month as month, birth_year as year from contacts where birth_day is not null",
    );
    for (const { day, month, year } of rows) {
      expect(day).toBeLessThanOrEqual(daysInMonth(month, year));
    }
  });
});
