import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTemporaryDatabase, type TemporaryDatabase } from "../../test/migrations";

const LAST_MIGRATION_BEFORE_FREQUENCY = "0000_init";
const LAST_MIGRATION_BEFORE_GROUPS = "0001_contact_frequency";

describe("migrations", () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createTemporaryDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it("Группы после обновления", async () => {
    await database.migrate();

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
    const before = await snapshot(database);

    await database.migrate();

    expect(await snapshot(database)).toEqual(before);
    const { rows: links } = await database.pool.query("select * from contact_groups");
    expect(links).toEqual([]);
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
    const before = await snapshot(database);

    await database.migrate({ upTo: LAST_MIGRATION_BEFORE_GROUPS });

    // Everything as it was, and every contact has «Не задано».
    expect(await snapshot(database)).toEqual({
      contacts: before.contacts.map((contact) => ({
        ...contact,
        contact_frequency: null,
        contact_frequency_set_at: null,
      })),
      notes: before.notes,
    });
  });

  it("Удалённая готовая группа не возвращается", async () => {
    await database.migrate();
    await database.pool.query("delete from groups where name = 'Коллеги'");
    await database.pool.query("update groups set name = 'Родные' where name = 'Семья'");

    // The next version of the app brings one more migration.
    await database.migrate({
      next: [
        { tag: "0004_next_version", sql: 'create table "next_version_marker" ("id" integer);' },
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
});

async function snapshot(database: TemporaryDatabase) {
  const contacts = await database.pool.query("select * from contacts order by name");
  const notes = await database.pool.query("select * from notes order by created_at");
  return { contacts: contacts.rows, notes: notes.rows };
}
