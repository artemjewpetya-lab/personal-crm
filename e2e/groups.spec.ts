import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

import { OWNER_EMAIL, ownerIdSql } from "./owner";

// Requirements: openspec/specs/contact-groups/spec.md
// - a group is created on the «Группы» page, with 0 contacts
// - a contact is added to a group from its card, the change is saved at once
// - the «Группы» page counts the contacts, a group name leads to the filtered list
// - the filter on the home page shows only the group's contacts and lives in the address

const runId = Date.now();
const groupName = `Автотест группа ${runId}`;
// Every contact the test creates carries this marker, so the cleanup finds them all.
const marker = `Группавтотест ${runId}`;
const inGroupName = `Анна ${marker}`;
const outOfGroupName = `Борис ${marker}`;

const pool = new Pool({ connectionString: getDatabaseUrl() });

test.afterAll(async () => {
  // Remove what the test created, so the real contacts and groups stay as they were.
  try {
    await pool.query("delete from contacts where name like $1", [`%${marker}`]);
    await pool.query("delete from groups where name = $1", [groupName]);
  } finally {
    await pool.end();
  }
});

async function createContact(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (user_id, name) values (${ownerIdSql(2)}, $1) returning id`,
    [name, OWNER_EMAIL],
  );
  return rows[0].id;
}

function groupFilter(page: Page) {
  return page.getByRole("combobox", { name: "Группа" });
}

async function expectChosenGroup(page: Page, label: string) {
  // Only the value: the arrow icon next to it carries a hidden "▼" text.
  await expect(groupFilter(page).locator("[data-slot=select-value]")).toHaveText(label);
}

async function readTotal(page: Page): Promise<number> {
  const summary = page.getByText(/^Всего \d/);
  await expect(summary).toBeVisible();
  return Number((await summary.textContent())!.replace(/\D/g, ""));
}

test("groups: create a group, add a contact from the card, filter the list", async ({ page }) => {
  const contactId = await createContact(inGroupName);
  await createContact(outOfGroupName);

  // 1. «Группы» on the home page → create a group: it is in the list with 0 contacts.
  await page.goto("/");
  const total = await readTotal(page);
  await page.getByRole("link", { name: "Группы", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Группы" })).toBeVisible();
  await page.getByRole("button", { name: "Создать группу" }).click();
  await page.getByLabel("Название новой группы").fill(groupName);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const groupRow = page.getByRole("listitem").filter({ hasText: groupName });
  await expect(groupRow).toContainText("0 контактов");

  // 2. The empty group in the filter: nobody yet.
  await groupRow.getByRole("link", { name: groupName }).click();
  await expectChosenGroup(page, groupName);
  await expect(page.getByText(`В группе «${groupName}» пока никого нет`)).toBeVisible();

  // 3. In the card: «Добавить в группу» → mark the group, it shows in the header at once.
  await page.goto(`/contacts/${contactId}`);
  await expect(page.getByRole("heading", { level: 1, name: inGroupName })).toBeVisible();
  await page.getByLabel("Добавить в группу", { exact: true }).click();
  await page.getByRole("option", { name: groupName }).click();
  await page.keyboard.press("Escape");
  const cardGroups = page.getByLabel("Группы контакта", { exact: true });
  await expect(cardGroups).toContainText(groupName);
  // It is saved: still there after a reload.
  await page.reload();
  await expect(cardGroups).toContainText(groupName);

  // 4. The «Группы» page counts the contact; the group name opens the filtered list.
  await page.goto("/groups");
  await expect(groupRow).toContainText("1 контакт");
  await groupRow.getByRole("link", { name: groupName }).click();
  await expectChosenGroup(page, groupName);
  await expect(
    page.getByText(`Найдено: 1 контакт из ${total.toLocaleString("ru-RU")}`),
  ).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole("link", { name: inGroupName })).toBeVisible();
  // The row shows the contact's groups.
  await expect(rows.getByRole("list", { name: "Группы" })).toContainText(groupName);
  await expect(page.getByRole("link", { name: outOfGroupName })).toHaveCount(0);

  // 5. The filter lives in the address: a reload keeps it.
  await page.reload();
  await expectChosenGroup(page, groupName);
  await expect(rows).toHaveCount(1);

  // 6. «Все группы» brings back the whole list.
  await groupFilter(page).click();
  await page.getByRole("option", { name: "Все группы" }).click();
  await expectChosenGroup(page, "Все группы");
  expect(await readTotal(page)).toBe(total);
  await expect(page.getByRole("link", { name: outOfGroupName })).toBeVisible();
});
