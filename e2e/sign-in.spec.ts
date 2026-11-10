import { expect, test } from "./fixtures";
import { deleteTestUsers, requestLink, signIn } from "./sign-in";
import { deleteMessagesTo, messagesTo } from "../test/mailpit";

// Sign-in by a link from an email (openspec/changes/login). These tests start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

const runId = Date.now();
const EMAIL_PREFIX = `autotest-${runId}-`;
const emailA = `${EMAIL_PREFIX}a@example.com`;
const emailB = `${EMAIL_PREFIX}b@example.com`;
const contactName = `Вера Автотестова ${runId}`;

test.afterAll(async () => {
  // Remove the users that the tests made, so the real data stays as it was.
  await deleteTestUsers(EMAIL_PREFIX);
});

async function expectSignInPage(page: import("@playwright/test").Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Вход в Личную CRM" })).toBeVisible();
  await expect(page.getByLabel("Почта")).toBeVisible();
  await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeVisible();
}

test("Открыл приложение без входа", async ({ page }) => {
  await page.goto("/");

  await expectSignInPage(page);
});

test("Прямая ссылка без входа", async ({ page }) => {
  for (const path of ["/contacts/7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10", "/groups"]) {
    await page.goto(path);

    await expectSignInPage(page);
    // No contact or group data on the sign-in page
    await expect(page.getByText("Друзья")).toHaveCount(0);
    await expect(page.getByText("Такого контакта нет")).toHaveCount(0);
  }
});

test("Проверка /health", async ({ request }) => {
  const response = await request.get("/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("Ссылка отправлена", async ({ page }) => {
  await deleteMessagesTo(emailA);
  await page.goto("/login");

  await page.getByLabel("Почта").fill(` ${emailA.toUpperCase()} `);
  await page.getByRole("button", { name: "Получить ссылку" }).click();

  // The address is shown cleaned (no spaces, small letters), and the form stays for another try
  await expect(page.getByText(`Ссылка для входа отправлена на ${emailA}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeEnabled();
  expect(await messagesTo(emailA)).toHaveLength(1);
});

test("Письмо в автотестах: письмо в почтовой заглушке, настоящих писем нет", async ({ page }) => {
  const link = await requestLink(page, emailA);

  const [message] = await messagesTo(emailA);
  expect(message.subject).toBe("Вход в Личную CRM");
  expect(message.from.name).toBe("Личная CRM");
  expect(link).toContain("/api/auth/magic-link/verify");
});

test("Вошёл по ссылке", async ({ page }) => {
  await signIn(page, emailA);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(emailA).filter({ visible: true })).toBeVisible();
});

test("Ссылку открыли второй раз", async ({ page, browser }) => {
  const link = await requestLink(page, emailA);
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();

  // The same link in another browser (no cookies)
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto(link);

    await expect(otherPage.getByText("Ссылка устарела, запросите новую")).toBeVisible();
    await expect(otherPage.getByRole("link", { name: "Запросить новую ссылку" })).toBeVisible();
  } finally {
    await other.close();
  }
});

test("Кнопка на странице «Ссылка устарела»", async ({ page }) => {
  const link = await requestLink(page, emailA);
  await page.goto(link);
  await page.context().clearCookies();
  await page.goto(link); // used already

  await page.getByRole("link", { name: "Запросить новую ссылку" }).click();

  await expectSignInPage(page);
  await expect(page.getByLabel("Почта")).toHaveValue("");
});

test("Неверный адрес в форме", async ({ page }) => {
  await deleteMessagesTo("anna@");
  await page.goto("/login");

  await page.getByLabel("Почта").fill("anna@");
  await page.getByRole("button", { name: "Получить ссылку" }).click();

  await expect(page.getByText("Проверьте адрес почты")).toBeVisible();
  await expect(page.getByText(/Ссылка для входа отправлена/)).toHaveCount(0);

  // An empty field gives the same error
  await page.getByLabel("Почта").fill("");
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByText("Проверьте адрес почты")).toBeVisible();
});

test("Критерий успеха - два пользователя", async ({ browser }) => {
  // A signs in and adds a contact
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    await signIn(pageA, emailA);
    await pageA.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = pageA.getByRole("dialog");
    await dialog.getByLabel("Имя").fill(contactName);
    await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(dialog).toBeHidden();
    await pageA.getByRole("link", { name: contactName }).click();
    await expect(pageA.getByRole("heading", { level: 1, name: contactName })).toBeVisible();
    const contactAddress = pageA.url();

    // B signs in under another email
    const pageB = await contextB.newPage();
    await signIn(pageB, emailB);

    // The contact is not in B's list and is not found by search
    await expect(pageB.getByRole("link", { name: contactName })).toHaveCount(0);
    await pageB.getByRole("searchbox", { name: "Поиск контактов" }).fill(contactName);
    await expect(pageB.getByText(`Никого не нашлось по запросу «${contactName}»`)).toBeVisible();
    // ... and by the direct address it is as if there were no such contact
    await pageB.goto(contactAddress);
    await expect(pageB.getByText("Такого контакта нет")).toBeVisible();
    await expect(pageB.getByText(contactName)).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("Первый вход", async ({ page }) => {
  await signIn(page, `${EMAIL_PREFIX}new@example.com`);

  await expect(page.getByText("Всего 0 контактов")).toBeVisible();
  await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
  await expect(
    page.getByText("Нажмите «Добавить контакт», чтобы записать первого человека."),
  ).toBeVisible();

  // The ready-made groups are there, empty
  await page.goto("/groups");
  for (const name of ["Друзья", "Коллеги", "Семья"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
});

test("Два устройства", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const pageOne = await first.newPage();
    const pageTwo = await second.newPage();
    await signIn(pageOne, emailA);
    await signIn(pageTwo, emailA);

    // Both are inside and see the same contacts
    await expect(pageOne.getByText(emailA).filter({ visible: true })).toBeVisible();
    await expect(pageTwo.getByText(emailA).filter({ visible: true })).toBeVisible();
    await expect(pageOne.getByText(/^Всего \d/)).toHaveText(
      (await pageTwo.getByText(/^Всего \d/).textContent()) ?? "",
    );
  } finally {
    await first.close();
    await second.close();
  }
});

test("Шапка", async ({ page }) => {
  await signIn(page, emailA);

  const header = page.locator("header");
  await expect(header.getByText(emailA).filter({ visible: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "Выйти" })).toBeVisible();
});

test("Выйти", async ({ page }) => {
  await signIn(page, emailA);

  await page.locator("header").getByRole("button", { name: "Выйти" }).click();

  await expectSignInPage(page);
  // "Back" and a refresh show the sign-in page, not the contacts
  await page.goBack();
  await expectSignInPage(page);
  await page.reload();
  await expectSignInPage(page);
});

test("Шапка на странице входа", async ({ page }) => {
  await page.goto("/login");

  const header = page.locator("header");
  await expect(header.getByText("Личная CRM")).toBeVisible();
  await expect(header.getByRole("button", { name: "Выйти" })).toHaveCount(0);
  await expect(header.getByText("@")).toHaveCount(0);
});
