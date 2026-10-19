import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

// Bug report: on a slow connection, pressing Ctrl+Enter twice while the first
// save was still in progress saved the same note twice.

const runId = Date.now();
// Starts with "Я", so it lands at the very end of the alphabetical list.
const contactName = `Ярослав Двойнаязаметка ${runId}`;
const noteText = `Заметка, отправленная дважды (${runId})`;

const pool = new Pool({ connectionString: getDatabaseUrl() });
let contactId: string;

test.beforeAll(async () => {
  const { rows } = await pool.query<{ id: string }>(
    "insert into contacts (name) values ($1) returning id",
    [contactName],
  );
  contactId = rows[0].id;
});

test.afterAll(async () => {
  // Remove what the test created (its notes go with the contact).
  try {
    await pool.query("delete from contacts where id = $1", [contactId]);
  } finally {
    await pool.end();
  }
});

test("Ctrl+Enter pressed twice during a slow save adds the note once", async ({
  page,
}) => {
  await page.goto(`/contacts/${contactId}`);

  // Slow connection: every save takes 2 seconds to reach the server.
  await page.route(`**/contacts/${contactId}`, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    await route.continue();
  });

  const textarea = page.getByLabel("Новая заметка");
  await textarea.fill(noteText);
  await textarea.press("Control+Enter");
  await expect(page.getByRole("button", { name: "Сохраняю…" })).toBeDisabled();
  await textarea.press("Control+Enter");

  await expect(page.getByText("Заметка сохранена").first()).toBeVisible();
  // The button comes back only when every save started from the form is done.
  await expect(page.getByRole("button", { name: "Добавить заметку" })).toBeEnabled();

  await expect(page.getByText(noteText)).toHaveCount(1);
  const { rows } = await pool.query<{ count: string }>(
    "select count(*) from notes where contact_id = $1",
    [contactId],
  );
  expect(Number(rows[0].count)).toBe(1);
});
