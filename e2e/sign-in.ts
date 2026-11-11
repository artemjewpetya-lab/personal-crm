import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";
import { deleteMessagesTo, signInLinkOf, waitForMessageTo } from "../test/mailpit";

import { expect } from "./fixtures";

/** Asks for a link on the sign-in page and returns it from the caught email (the page stays open). */
export async function requestLink(page: Page, email: string): Promise<string> {
  await deleteMessagesTo(email);
  await page.goto("/login");
  await page.getByLabel("Почта").fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByText(`Ссылка для входа отправлена на ${email}`)).toBeVisible();
  return signInLinkOf(await waitForMessageTo(email));
}

/**
 * Signs in the way a person does: the sign-in page, the email in the mail catcher, the link.
 * The page ends up inside the app.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const link = await requestLink(page, email);
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
}

/** Removes the users that tests made (their emails start with `prefix`), with everything they own. */
export async function deleteTestUsers(prefix: string): Promise<void> {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  try {
    const owners = "select id from users where email like $1";
    const pattern = `${prefix}%`;
    await pool.query(`delete from contacts where user_id in (${owners})`, [pattern]);
    await pool.query(`delete from groups where user_id in (${owners})`, [pattern]);
    await pool.query("delete from users where email like $1", [pattern]);
  } finally {
    await pool.end();
  }
}
