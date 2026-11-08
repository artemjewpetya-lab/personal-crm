import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

// Bug report: after adding a contact the list sometimes did not scroll to it.
// The updated list (every contact) can arrive long after the "added" message:
// on a slow connection or a busy server it took up to 46 seconds, while the
// list only looked for the new row for 3 seconds.

const runId = Date.now();
// Starts with "Я", so it lands at the very end of the alphabetical list.
const contactName = `Ярослав Медленныйсписок ${runId}`;

test.afterAll(async () => {
  // Remove what the test created, so the real contact list stays as it was.
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  try {
    await pool.query("delete from contacts where name = $1", [contactName]);
  } finally {
    await pool.end();
  }
});

test("the list scrolls to a new contact even when the list arrives slowly", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/^Всего \d/)).toBeVisible();

  // Slow connection: the updated list takes much longer than 3 seconds to arrive.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 100,
    downloadThroughput: 1024 * 1024,
    uploadThroughput: 1024 * 1024,
  });

  await page.getByRole("button", { name: "Добавить контакт" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Имя").fill(contactName);
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page.getByText("Контакт добавлен")).toBeVisible();

  await expect(page.getByRole("link", { name: contactName })).toBeInViewport({
    timeout: 90_000,
  });
});
