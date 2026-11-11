import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTemporaryDatabase,
  TEST_OWNER_EMAIL,
  type TemporaryDatabase,
} from "../../test/migrations";

const LAST_MIGRATION_BEFORE_FREQUENCY = "0000_init";
const LAST_MIGRATION_BEFORE_GROUPS = "0001_contact_frequency";
const LAST_MIGRATION_BEFORE_LOGIN = "0003_preset_groups";

describe("migrations", () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createTemporaryDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it("Группы после обновления", async () => {
    await database.migrate({ ownerEmail: TEST_OWNER_EMAIL });

    const { rows } = await database.pool.query<{ name: string; contacts: number }>(
      `select g.name, count(cg.contact_id)::int as contacts
         from groups g left join contact_groups cg on cg.group_id = g.id
        group by g.name order by g.name`,
    );

    expect(rows).toEqual([
      { name: "Друзья", contacts: 0 },
      { name: "Коллеги", contacts: 0 },
      { name: "Семья", contacts: 0 },
    ]);
    // The ready-made groups belong to the owner (the only user).
    expect(await rowsOutsideOwnerOf(database, "groups", TEST_OWNER_EMAIL)).toBe(0);
  });

  it("Контакты, добавленные до этой функции", async () => {
    await database.migrate({ upTo: LAST_MIGRATION_BEFORE_GROUPS });
    const {
      rows: [anna],
    } = await database.pool.query<{ id: string }>(
      `insert into contacts (name, about, phone, email, contact_frequency, contact_frequency_set_at)
       values ('Анна', 'Коллега', '+7 900 123-45-67', 'anna@example.com', 'month', now())
       returning id`,
    );
    await database.pool.query("insert into contacts (name) values ('Борис')");
    await database.pool.query(
      "insert into notes (contact_id, body) values ($1, 'Договорились о встрече')",
      [anna.id],
    );
    const before = await snapshot(database, { withGroups: false });

    await database.migrate({ ownerEmail: TEST_OWNER_EMAIL });

    expect(await snapshot(database, { withGroups: false })).toEqual(before);
    const { rows: links } = await database.pool.query("select * from contact_groups");
    expect(links).toEqual([]);
    // They have no groups, and they belong to the owner.
    expect(await countRows(database, "contacts")).toBe(2);
    expect(await rowsOutsideOwnerOf(database, "contacts", TEST_OWNER_EMAIL)).toBe(0);
  });

  it("Контакты, добавленные до частоты общения", async () => {
    await database.migrate({ upTo: LAST_MIGRATION_BEFORE_FREQUENCY });
    const {
      rows: [anna],
    } = await database.pool.query<{ id: string }>(
      `insert into contacts (name, about, phone, email)
       values ('Анна', 'Коллега', '+7 900 123-45-67', 'anna@example.com')
       returning id`,
    );
    await database.pool.query("insert into contacts (name) values ('Борис')");
    await database.pool.query(
      "insert into notes (contact_id, body) values ($1, 'Договорились о встрече')",
      [anna.id],
    );
    const before = await snapshot(database, { withGroups: false });

    await database.migrate({ upTo: LAST_MIGRATION_BEFORE_GROUPS });

    // Everything as it was, and every contact has «Не задано».
    expect(await snapshot(database, { withGroups: false })).toEqual({
      contacts: before.contacts.map((contact) => ({
        ...contact,
        contact_frequency: null,
        contact_frequency_set_at: null,
      })),
      notes: before.notes,
    });
  });

  it("Удалённая готовая группа не возвращается", async () => {
    await database.migrate({ ownerEmail: TEST_OWNER_EMAIL });
    await database.pool.query("delete from groups where name = 'Коллеги'");
    await database.pool.query("update groups set name = 'Родные' where name = 'Семья'");

    // The next version of the app brings one more migration.
    await database.migrate({
      next: [
        { tag: "0099_next_version", sql: 'create table "next_version_marker" ("id" integer);' },
      ],
    });

    const { rows: marker } = await database.pool.query(
      "select to_regclass('next_version_marker') as name",
    );
    expect(marker[0].name).toBe("next_version_marker");
    const { rows } = await database.pool.query<{ name: string }>(
      "select name from groups order by name",
    );
    expect(rows.map((row) => row.name)).toEqual(["Друзья", "Родные"]);
  });

  it("После обновления", async () => {
    await database.migrate({ upTo: LAST_MIGRATION_BEFORE_LOGIN });
    const counts = await fillBeforeLogin(database);
    const before = await snapshot(database);
    expect(counts).toEqual({ contacts: 3, notes: 3, groups: 4, links: 3 });

    // Written the way the owner might type it into .env
    await database.migrate({ ownerEmail: "Owner@Example.com" });

    // Nothing was lost or changed ...
    expect(await snapshot(database)).toEqual(before);
    expect({
      contacts: await countRows(database, "contacts"),
      notes: await countRows(database, "notes"),
      groups: await countRows(database, "groups"),
      links: await countRows(database, "contact_groups"),
    }).toEqual(counts);
    // ... and everything belongs to the one user made from OWNER_EMAIL.
    const { rows: users } = await database.pool.query<{ email: string; email_verified: boolean }>(
      "select email, email_verified from users",
    );
    expect(users).toEqual([{ email: "owner@example.com", email_verified: true }]);
    expect(await rowsOutsideOwnerOf(database, "contacts", "owner@example.com")).toBe(0);
    expect(await rowsOutsideOwnerOf(database, "groups", "owner@example.com")).toBe(0);
  });

  it("Почта владельца не указана", async () => {
    await database.migrate({ upTo: LAST_MIGRATION_BEFORE_LOGIN });
    await fillBeforeLogin(database);
    const before = await snapshot(database);
    const appliedBefore = await appliedMigrations(database);

    // No setting at all, an empty one, spaces only, and something that is not an address
    for (const ownerEmail of [undefined, "", "   ", "not-an-email", "anna@"]) {
      const error = await database.migrate({ ownerEmail }).then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(error).not.toBeNull();
      expect(errorText(error)).toMatch(/OWNER_EMAIL/);

      // The database is exactly as it was: data, tables, columns and the list of applied migrations
      expect(await snapshot(database)).toEqual(before);
      expect(await appliedMigrations(database)).toBe(appliedBefore);
      const { rows: tables } = await database.pool.query<{ users: string | null }>(
        "select to_regclass('public.users')::text as users",
      );
      expect(tables[0].users).toBeNull();
      const { rows: columns } = await database.pool.query(
        `select 1 from information_schema.columns
          where table_name in ('contacts', 'groups') and column_name = 'user_id'`,
      );
      expect(columns).toEqual([]);
    }
  });
});

/** Contacts, notes, groups (three ready-made and one of their own) and links, as before the update. */
async function fillBeforeLogin(database: TemporaryDatabase) {
  const { rows: contacts } = await database.pool.query<{ id: string; name: string }>(
    `insert into contacts (name, about, phone, email, contact_frequency, contact_frequency_set_at)
     values ('Анна', 'Коллега', '+7 900 123-45-67', 'anna@example.com', 'month', now() - interval '40 days'),
            ('Борис', null, null, null, null, null),
            ('Вера', 'Соседка', null, 'vera@example.com', 'week', now() - interval '3 days')
     returning id, name`,
  );
  const idOf = (name: string) => contacts.find((contact) => contact.name === name)!.id;

  await database.pool.query(
    `insert into notes (contact_id, body) values
       ($1, 'Договорились о встрече'), ($1, 'Созвонились'), ($2, 'Передал книгу')`,
    [idOf("Анна"), idOf("Борис")],
  );

  await database.pool.query(`insert into groups (name) values ('Теннис')`);
  const { rows: groups } = await database.pool.query<{ id: string; name: string }>(
    "select id, name from groups",
  );
  const groupId = (name: string) => groups.find((group) => group.name === name)!.id;
  await database.pool.query(
    `insert into contact_groups (contact_id, group_id) values ($1, $2), ($1, $3), ($4, $5)`,
    [idOf("Анна"), groupId("Друзья"), groupId("Теннис"), idOf("Борис"), groupId("Коллеги")],
  );

  return { contacts: 3, notes: 3, groups: groups.length, links: 3 };
}

/** The message of an error and of everything that caused it (Drizzle wraps the database error). */
function errorText(error: unknown): string {
  const parts: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) {
    parts.push(current.message);
  }
  return parts.join(" | ");
}

/**
 * Every row of the data tables as it was, without the owner column that the update adds.
 * Before the groups update there are no group tables: pass `withGroups: false` then.
 */
async function snapshot(database: TemporaryDatabase, { withGroups = true } = {}) {
  const read = async (table: string, order: string) => {
    const { rows } = await database.pool.query(
      `select to_jsonb(t) - 'user_id' as row from ${table} t order by ${order}`,
    );
    return rows.map((row) => row.row);
  };
  return {
    contacts: await read("contacts", "id"),
    notes: await read("notes", "id"),
    ...(withGroups
      ? {
          groups: await read("groups", "id"),
          links: await read("contact_groups", "contact_id, group_id"),
        }
      : {}),
  };
}

async function countRows(database: TemporaryDatabase, table: string): Promise<number> {
  const { rows } = await database.pool.query<{ total: number }>(
    `select count(*)::int as total from ${table}`,
  );
  return rows[0].total;
}

/** How many rows of the table are not owned by the user with this email (none owner counts too). */
async function rowsOutsideOwnerOf(
  database: TemporaryDatabase,
  table: "contacts" | "groups",
  email: string,
): Promise<number> {
  const { rows } = await database.pool.query<{ total: number }>(
    `select count(*)::int as total from ${table} t
      where t.user_id is distinct from (select id from users where email = $1)`,
    [email],
  );
  return rows[0].total;
}

async function appliedMigrations(database: TemporaryDatabase): Promise<number> {
  const { rows } = await database.pool.query<{ total: number }>(
    "select count(*)::int as total from drizzle.__drizzle_migrations",
  );
  return rows[0].total;
}
