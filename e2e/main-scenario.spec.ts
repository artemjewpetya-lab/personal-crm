import { chromium, expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

// Success criteria from specs/01-продуктовая-идея.md:
// - open → the list shows all contacts
// - add a contact → find it by name → add a note → the change is saved in the card
// - open the same address in another browser → the same contacts

const runId = Date.now();
// Starts with "Я", so it lands at the very end of the alphabetical list.
const contactName = `Ярослав Автотестов ${runId}`;
const noteText = `Договорились созвониться в пятницу (${runId})`;

test.afterAll(async () => {
  // Remove what the test created, so the real contact list stays as it was.
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  try {
    await pool.query("delete from contacts where name = $1", [contactName]);
  } finally {
    await pool.end();
  }
});

async function readTotal(page: Page): Promise<number> {
  const summary = page.getByText(/^Всего \d/);
  await expect(summary).toBeVisible();
  return Number((await summary.textContent())!.replace(/\D/g, ""));
}

test("main scenario: list, add, find, note, another browser", async ({ page }) => {
  // 1. Open the app: every contact is in the list.
  await page.goto("/");
  const totalBefore = await readTotal(page);
  expect(totalBefore).toBeGreaterThan(0);
  await expect(page.locator("tbody tr")).toHaveCount(totalBefore);

  // 2. Add a contact: it appears in the list.
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Имя").fill(contactName);
  await dialog.getByLabel("Кто это").fill("Контакт из автотеста");
  await dialog.getByLabel("Откуда знакомы").fill("Создан автоматической проверкой");
  await dialog.getByLabel("Телефон").fill("+7 900 000-00-00");
  await dialog.getByLabel("Почта").fill("autotest@example.com");
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Контакт добавлен")).toBeVisible();
  // The list scrolls to the new contact, wherever it lands alphabetically.
  await expect(page.getByRole("link", { name: contactName })).toBeInViewport();
  expect(await readTotal(page)).toBe(totalBefore + 1);

  // 3. Find it by name and open the card.
  await page.getByRole("searchbox", { name: "Поиск контактов" }).fill(contactName);
  await expect(page.getByText("Найдено: 1 контакт")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: contactName }).click();
  await expect(page.getByRole("heading", { level: 1, name: contactName })).toBeVisible();

  // 4. Add a note after the conversation: it is saved in the card.
  await page.getByLabel("Новая заметка").fill(noteText);
  await page.getByRole("button", { name: "Добавить заметку" }).click();
  await expect(page.getByText(noteText)).toBeVisible();
  await page.reload();
  await expect(page.getByText(noteText)).toBeVisible();

  // 5. The same address in another browser (Chrome) shows the same data.
  const otherBrowser = await chromium.launch({ channel: "chrome" });
  try {
    const otherPage = await otherBrowser.newPage({ locale: "ru-RU" });
    await otherPage.goto(page.url());
    await expect(
      otherPage.getByRole("heading", { level: 1, name: contactName }),
    ).toBeVisible();
    await expect(otherPage.getByText(noteText)).toBeVisible();

    await otherPage.goto(new URL("/", page.url()).href);
    expect(await readTotal(otherPage)).toBe(totalBefore + 1);
    await expect(otherPage.getByRole("link", { name: contactName })).toBeVisible();
  } finally {
    await otherBrowser.close();
  }
});

test("a contact without a name is not saved", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Телефон").fill("+7 900 000-00-00");
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(dialog.getByText("Укажите имя")).toBeVisible();
  // The rest of the form keeps what was typed.
  await expect(dialog.getByLabel("Телефон")).toHaveValue("+7 900 000-00-00");
});
