import type { Locator, Page } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

import { ageOn, MONTH_NAMES, moscowToday } from "../src/lib/contacts/birthdays";

import { expect, test } from "./fixtures";
import { OWNER_EMAIL, ownerIdSql } from "./owner";
import { signIn } from "./sign-in";

// Requirements: openspec/changes/birthdays/specs/birthdays/spec.md
// - the contact form has «Дата рождения»: day, month and year, checked on the server
// - the contact card shows the birthday line
// - the home page shows «Скоро день рождения»

const runId = Date.now();
// Every contact the tests create carries this marker, so the cleanup finds them all.
const marker = `Деньрождавтотест ${runId}`;

const pool = new Pool({ connectionString: getDatabaseUrl() });

test.afterEach(async () => {
  await pool.query("delete from contacts where name like $1", [`%${marker}`]);
  await pool.query("delete from groups where name like $1", [`%${marker}`]);
});

test.afterAll(async () => {
  await pool.end();
});

type Birthday = { day: number; month: number; year: number | null };

async function createContact(name: string, birthday?: Birthday): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (user_id, name, birth_day, birth_month, birth_year)
     values (${ownerIdSql(5)}, $1, $2, $3, $4) returning id`,
    [name, birthday?.day ?? null, birthday?.month ?? null, birthday?.year ?? null, OWNER_EMAIL],
  );
  return rows[0].id;
}

async function readBirthday(id: string): Promise<Birthday | null> {
  const { rows } = await pool.query<{
    birth_day: number | null;
    birth_month: number | null;
    birth_year: number | null;
  }>("select birth_day, birth_month, birth_year from contacts where id = $1", [id]);
  const row = rows[0];
  return row.birth_day === null
    ? null
    : { day: row.birth_day, month: row.birth_month!, year: row.birth_year };
}

async function openEditForm(page: Page) {
  await page.getByRole("button", { name: "Изменить" }).click();
  return page.getByRole("dialog", { name: "Изменить контакт" });
}

const dayInput = (dialog: Locator) => dialog.getByLabel("День рождения: число");
const yearInput = (dialog: Locator) => dialog.getByLabel("День рождения: год");
const monthSelect = (dialog: Locator) =>
  dialog.getByRole("combobox", { name: "День рождения: месяц" });

async function expectMonth(dialog: Locator, label: string) {
  // Only the value: the arrow icon next to it carries a hidden "▼" text.
  await expect(monthSelect(dialog).locator("[data-slot=select-value]")).toHaveText(label);
}

async function chooseMonth(page: Page, dialog: Locator, label: string) {
  await monthSelect(dialog).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

test.describe("«Дата рождения» in the contact form", () => {
  test("Текущая дата в форме «Изменить»", async ({ page }) => {
    const id = await createContact(`Аня ${marker}`, { day: 20, month: 11, year: 1990 });
    await page.goto(`/contacts/${id}`);

    const dialog = await openEditForm(page);

    await expect(dayInput(dialog)).toHaveValue("20");
    await expectMonth(dialog, "ноябрь");
    await expect(yearInput(dialog)).toHaveValue("1990");
  });

  test("Дата без года в форме «Изменить»", async ({ page }) => {
    const id = await createContact(`Борис ${marker}`, { day: 3, month: 3, year: null });
    await page.goto(`/contacts/${id}`);

    const dialog = await openEditForm(page);

    await expect(dayInput(dialog)).toHaveValue("3");
    await expectMonth(dialog, "март");
    await expect(yearInput(dialog)).toHaveValue("");
  });

  test("a contact without a date has «Не указан» in the form", async ({ page }) => {
    const id = await createContact(`Глеб ${marker}`);
    await page.goto(`/contacts/${id}`);

    const dialog = await openEditForm(page);

    await expect(dayInput(dialog)).toHaveValue("");
    await expectMonth(dialog, "Не указан");
    await expect(yearInput(dialog)).toHaveValue("");
  });

  test("Форму закрыли без сохранения", async ({ page }) => {
    const id = await createContact(`Аня ${marker}`, { day: 20, month: 11, year: 1990 });
    await page.goto(`/contacts/${id}`);

    const dialog = await openEditForm(page);
    await dayInput(dialog).fill("21");
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(dialog).toBeHidden();

    expect(await readBirthday(id)).toEqual({ day: 20, month: 11, year: 1990 });
  });

  test("a date entered in the form is saved, with the year and without it", async ({ page }) => {
    const id = await createContact(`Вера ${marker}`);
    await page.goto(`/contacts/${id}`);

    let dialog = await openEditForm(page);
    await dayInput(dialog).fill("20");
    await chooseMonth(page, dialog, "ноябрь");
    await yearInput(dialog).fill("1990");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();
    expect(await readBirthday(id)).toEqual({ day: 20, month: 11, year: 1990 });

    dialog = await openEditForm(page);
    await expect(dayInput(dialog)).toHaveValue("20");
    await yearInput(dialog).fill("");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    expect(await readBirthday(id)).toEqual({ day: 20, month: 11, year: null });
  });

  test("a new contact gets the date from the «Добавить контакт» form", async ({ page }) => {
    const name = `Дина ${marker}`;
    await page.goto("/");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Имя").fill(name);
    await dayInput(dialog).fill("3");
    await chooseMonth(page, dialog, "март");
    await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText("Контакт добавлен")).toBeVisible();

    const { rows } = await pool.query<{ id: string }>("select id from contacts where name = $1", [
      name,
    ]);
    expect(await readBirthday(rows[0].id)).toEqual({ day: 3, month: 3, year: null });
  });

  test("День без месяца", async ({ page }) => {
    const id = await createContact(`Аня ${marker}`);
    await page.goto(`/contacts/${id}`);

    const dialog = await openEditForm(page);
    await dayInput(dialog).fill("20");
    await dialog.getByRole("button", { name: "Сохранить" }).click();

    await expect(
      dialog.getByRole("group", { name: "Дата рождения" }).getByText("Выберите месяц"),
    ).toBeVisible();
    // The form stays open and nothing is saved
    await expect(dialog).toBeVisible();
    expect(await readBirthday(id)).toBeNull();
  });
});

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** The day that is `days` after today in Moscow, as the e2e data needs it (month 1-12). */
function moscowDayAfter(days: number) {
  const today = moscowToday();
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

test.describe("the birthday line in the contact card", () => {
  test("Дата с годом в карточке", async ({ page }) => {
    // The birthday is in 10 days, so the person has not had it yet this year (or in the year
    // that comes after New Year): the age is counted the same way the app counts it.
    const soon = moscowDayAfter(10);
    const birthday = { day: soon.day, month: soon.month, year: 1990 };
    const age = ageOn(birthday, moscowToday());
    const id = await createContact(`Аня ${marker}`, birthday);

    await page.goto(`/contacts/${id}`);

    await expect(
      page.getByText(
        new RegExp(
          `^День рождения ${birthday.day} ${MONTHS_GENITIVE[birthday.month - 1]} 1990 г\\. \\(${age} (год|года|лет)\\)$`,
        ),
      ),
    ).toBeVisible();
  });

  test("Дата без года в карточке", async ({ page }) => {
    const id = await createContact(`Борис ${marker}`, { day: 3, month: 3, year: null });

    await page.goto(`/contacts/${id}`);

    await expect(page.getByText("День рождения 3 марта", { exact: true })).toBeVisible();
  });

  test("Даты нет", async ({ page }) => {
    const id = await createContact(`Глеб ${marker}`);

    await page.goto(`/contacts/${id}`);

    await expect(page.getByRole("heading", { name: new RegExp(`^Глеб`) })).toBeVisible();
    await expect(page.getByText("День рождения")).toHaveCount(0);
  });

  test("a date saved in the form appears in the card and goes away when removed", async ({
    page,
  }) => {
    const id = await createContact(`Вера ${marker}`);
    await page.goto(`/contacts/${id}`);

    let dialog = await openEditForm(page);
    await dayInput(dialog).fill("3");
    await chooseMonth(page, dialog, "март");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("День рождения 3 марта", { exact: true })).toBeVisible();

    dialog = await openEditForm(page);
    await dayInput(dialog).fill("");
    await chooseMonth(page, dialog, "Не указан");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("День рождения")).toHaveCount(0);
  });
});

// The block on the home page. The demo data has birthdays too, so the tests look only at
// their own contacts (all of them carry the marker) and never at the whole block.
function birthdayBlock(page: Page) {
  return page.getByRole("region", { name: "Скоро день рождения" });
}

function birthdayRow(page: Page, name: string) {
  return birthdayBlock(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

/** A birthday `days` from today in Moscow; `year` is the year of birth (empty: not known). */
function birthdayIn(days: number, year: number | null = null): Birthday {
  const { month, day } = moscowDayAfter(days);
  return { day, month, year };
}

/** "20 ноября" */
function dayAndMonth(birthday: Birthday): string {
  return `${birthday.day} ${MONTHS_GENITIVE[birthday.month - 1]}`;
}

async function fillBirthday(page: Page, dialog: Locator, birthday: Birthday) {
  await dayInput(dialog).fill(String(birthday.day));
  await chooseMonth(page, dialog, MONTH_NAMES[birthday.month - 1]);
}

/**
 * The page arrives as ready HTML, and React attaches click handlers a moment later (on a busy
 * dev server, seconds later). A click before that is lost, so wait until React has taken over.
 */
async function waitUntilInteractive(button: Locator) {
  await expect
    .poll(() =>
      button.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}

test.describe("the «Скоро день рождения» block", () => {
  test("Над «Пора связаться»", async ({ page }) => {
    await createContact(`Аня ${marker}`, birthdayIn(3));
    await pool.query(
      `insert into contacts (user_id, name, contact_frequency, contact_frequency_set_at)
       values (${ownerIdSql(2)}, $1, 'week', now() - interval '8 days')`,
      [`Борис ${marker}`, OWNER_EMAIL],
    );

    await page.goto("/");

    const birthdays = birthdayBlock(page);
    const due = page.getByRole("region", { name: "Пора связаться" });
    const list = page.getByRole("region", { name: "Список контактов" });
    await expect(birthdays).toBeVisible();
    await expect(due).toBeVisible();
    await expect(list).toBeVisible();
    const top = async (block: Locator) => (await block.boundingBox())!.y;
    expect(await top(birthdays)).toBeLessThan(await top(due));
    expect(await top(due)).toBeLessThan(await top(list));
  });

  test("Поиск скрывает блок", async ({ page }) => {
    const name = `Галина ${marker}`;
    await createContact(name, birthdayIn(3));

    await page.goto("/");
    await expect(birthdayRow(page, name)).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Поиск контактов" });
    await search.fill(name);
    await expect(page.getByText("Найдено: 1 контакт")).toBeVisible();
    await expect(birthdayBlock(page)).toHaveCount(0);

    await search.fill("");
    await expect(page.getByText(/^Всего \d/)).toBeVisible();
    await expect(birthdayRow(page, name)).toBeVisible();
  });

  test("Фильтр по группе не меняет блок", async ({ page }) => {
    const anya = `Аня ${marker}`;
    const boris = `Борис ${marker}`;
    await createContact(anya, birthdayIn(3));
    const borisId = await createContact(boris);
    const {
      rows: [group],
    } = await pool.query<{ id: string }>(
      `insert into groups (user_id, name) values (${ownerIdSql(2)}, $1) returning id`,
      [`Семья ${marker}`, OWNER_EMAIL],
    );
    await pool.query("insert into contact_groups (contact_id, group_id) values ($1, $2)", [
      borisId,
      group.id,
    ]);

    await page.goto(`/?group=${group.id}`);

    // The block still shows Аня, who is not in the group; the list shows only the group
    await expect(birthdayRow(page, anya)).toBeVisible();
    const list = page.getByRole("region", { name: "Список контактов" });
    await expect(list.getByRole("link", { name: boris, exact: true })).toBeVisible();
    await expect(list.getByRole("link", { name: anya, exact: true })).toHaveCount(0);
  });

  test("Общий список не меняется", async ({ page }) => {
    const name = `Вера ${marker}`;
    await createContact(name, birthdayIn(3));

    await page.goto("/");

    await expect(birthdayRow(page, name)).toBeVisible();
    const list = page.getByRole("region", { name: "Список контактов" });
    await expect(list.getByRole("link", { name, exact: true })).toBeVisible();
  });

  test("Строка с годом", async ({ page }) => {
    const name = `Аня ${marker}`;
    const birthday = birthdayIn(4, 1990);
    // The birthday is in 4 days: the age on that day is the year of that day minus the birth year
    const turns = moscowDayAfter(4).year - 1990;
    await createContact(name, birthday);

    await page.goto("/");

    await expect(
      birthdayRow(page, name).getByText(
        `${dayAndMonth(birthday)}, через 4 дня · исполнится ${turns}`,
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("Строка без года", async ({ page }) => {
    const name = `Борис ${marker}`;
    const birthday = birthdayIn(2);
    await createContact(name, birthday);

    await page.goto("/");

    await expect(
      birthdayRow(page, name).getByText(`${dayAndMonth(birthday)}, через 2 дня`, { exact: true }),
    ).toBeVisible();
  });

  test("Строка в день рождения и накануне", async ({ page }) => {
    const today = `Вера ${marker}`;
    const tomorrow = `Глеб ${marker}`;
    const todayBirthday = birthdayIn(0, 2000);
    await createContact(today, todayBirthday);
    await createContact(tomorrow, birthdayIn(1));

    await page.goto("/");

    const turns = moscowToday().year - 2000;
    await expect(
      birthdayRow(page, today).getByText(
        `${dayAndMonth(todayBirthday)}, сегодня · исполняется ${turns}`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(birthdayRow(page, tomorrow).getByText(/, завтра$/)).toBeVisible();
  });

  test("Переход в карточку из блока", async ({ page }) => {
    const name = `Дина ${marker}`;
    const id = await createContact(name, birthdayIn(3));

    await page.goto("/");
    // A corner of the row, away from the name: the whole row is the link.
    await birthdayRow(page, name).click({ position: { x: 4, y: 4 } });

    await expect(page).toHaveURL(`/contacts/${id}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });

  test("Раскрыть все дни рождения", async ({ page }) => {
    const names = Array.from({ length: 8 }, (_, index) => `Именинник ${index + 1} ${marker}`);
    for (const name of names) await createContact(name, birthdayIn(5));

    await page.goto("/");

    const block = birthdayBlock(page);
    await expect(block.getByRole("listitem")).toHaveCount(5);
    const more = block.getByRole("button", { name: /^Показать всех \(\d+\)$/ });
    const total = Number((await more.textContent())!.replace(/\D/g, ""));
    expect(total).toBeGreaterThanOrEqual(8);

    await waitUntilInteractive(more);
    await more.click();

    await expect(more).toHaveCount(0);
    await expect(block.getByRole("listitem")).toHaveCount(total);
    for (const name of names) {
      await expect(block.getByRole("link", { name, exact: true })).toBeVisible();
    }
    // The button is gone, so the focus moves to the first contact that appeared
    await expect(block.getByRole("link").nth(5)).toBeFocused();
  });

  test("Добавил дату и вернулся", async ({ page }) => {
    const name = `Аня ${marker}`;
    const id = await createContact(name);
    const birthday = birthdayIn(2);
    await page.goto(`/contacts/${id}`);

    const dialog = await openEditForm(page);
    await fillBirthday(page, dialog, birthday);
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();
    await page.getByRole("link", { name: "Все контакты" }).click();

    await expect(
      birthdayRow(page, name).getByText(`${dayAndMonth(birthday)}, через 2 дня`),
    ).toBeVisible();
  });

  test("Убрал дату и вернулся", async ({ page }) => {
    const name = `Аня ${marker}`;
    const id = await createContact(name, birthdayIn(2));
    await page.goto("/");
    await expect(birthdayRow(page, name)).toBeVisible();

    await page.goto(`/contacts/${id}`);
    const dialog = await openEditForm(page);
    await dayInput(dialog).fill("");
    await chooseMonth(page, dialog, "Не указан");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();
    await page.getByRole("link", { name: "Все контакты" }).click();

    await expect(page.getByRole("region", { name: "Список контактов" })).toBeVisible();
    await expect(birthdayBlock(page).getByRole("link", { name, exact: true })).toHaveCount(0);
  });

  test("Новый контакт с днём рождения завтра", async ({ page }) => {
    const name = `Глеб ${marker}`;
    await page.goto("/");

    await page.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Имя").fill(name);
    await fillBirthday(page, dialog, birthdayIn(1));
    await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText("Контакт добавлен")).toBeVisible();

    await expect(birthdayRow(page, name).getByText(/, завтра$/)).toBeVisible();
  });

  test("Дата видна в другом браузере", async ({ page, browser, baseURL, locale }) => {
    const name = `Тимур ${marker}`;
    const birthday = birthdayIn(3, 1985);
    const id = await createContact(name, birthday);
    await page.goto("/");
    await expect(birthdayRow(page, name)).toBeVisible();

    // Another browser: nothing shared with the first one but the site, not even the sign-in.
    const other = await browser.newContext({
      baseURL,
      locale,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const otherPage = await other.newPage();
      await signIn(otherPage, OWNER_EMAIL);
      await otherPage.goto(`/contacts/${id}`);
      await expect(
        otherPage.getByText(new RegExp(`^День рождения ${dayAndMonth(birthday)} 1985 г\\.`)),
      ).toBeVisible();
      await otherPage.goto("/");
      await expect(birthdayRow(otherPage, name)).toBeVisible();
    } finally {
      await other.close();
    }
  });
});
