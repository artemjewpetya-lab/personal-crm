import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

import { OWNER_EMAIL, ownerIdSql } from "./owner";

// Deleting a contact from its card: a confirmation first, then the contact
// and its notes are gone for good, and the list opens.

const runId = Date.now();
// Starts with "Я", so it lands at the very end of the alphabetical list.
const contactName = `Ярослав Удаляемый ${runId}`;
const noteText = `Заметка удаляемого контакта (${runId})`;

const pool = new Pool({ connectionString: getDatabaseUrl() });
let contactId: string;

test.beforeAll(async () => {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (user_id, name) values (${ownerIdSql(2)}, $1) returning id`,
    [contactName, OWNER_EMAIL],
  );
  contactId = rows[0].id;
  await pool.query("insert into notes (contact_id, body) values ($1, $2)", [contactId, noteText]);
});

test.afterAll(async () => {
  // The test deletes the contact itself; this only cleans up if it failed midway.
  try {
    await pool.query("delete from contacts where id = $1", [contactId]);
  } finally {
    await pool.end();
  }
});

test("a contact is deleted with its notes after confirmation", async ({ page }) => {
  await page.goto(`/contacts/${contactId}`);
  await expect(page.getByRole("heading", { level: 1, name: contactName })).toBeVisible();

  // 1. The confirmation names the contact and how many notes go with it.
  await page.getByRole("button", { name: "Удалить" }).click();
  const dialog = page.getByRole("dialog", { name: "Удалить контакт?" });
  await expect(dialog).toContainText(`Контакт «${contactName}» и 1 заметка удалятся насовсем.`);

  // 2. "Cancel" keeps everything as it was.
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(noteText)).toBeVisible();

  // 3. Confirm: a message right away, then the list opens without the contact.
  await page.getByRole("button", { name: "Удалить" }).click();
  await dialog.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Контакт удалён")).toBeVisible();
  await expect(page).toHaveURL("/");
  await expect(page.getByText(/^Всего \d/)).toBeVisible();
  await expect(page.getByRole("link", { name: contactName })).toHaveCount(0);

  // 4. Neither the contact nor its notes are left in the database.
  const { rows } = await pool.query<{ contacts: string; notes: string }>(
    `select
       (select count(*) from contacts where id = $1) as contacts,
       (select count(*) from notes where contact_id = $1) as notes`,
    [contactId],
  );
  expect(rows[0]).toEqual({ contacts: "0", notes: "0" });

  // 5. The old card address now says the contact does not exist.
  await page.goto(`/contacts/${contactId}`);
  await expect(page.getByText("Такого контакта нет")).toBeVisible();
});
