import { expect, test, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

// Requirements: openspec/changes/keep-in-touch/specs/keep-in-touch/spec.md
// - a contact has a frequency, set in the contact form and shown in the card
// - the due date counts from the last note, or from when the frequency was set
// - "Пора связаться" on the home page lists overdue contacts, most overdue first
// - "Связались" saves a note "Связались", which starts the period again

const runId = Date.now();
// Every contact the tests create carries this marker, so the cleanup finds them all.
const marker = `Пораавтотест ${runId}`;

const pool = new Pool({ connectionString: getDatabaseUrl() });

// Remove what each test created (notes go with their contacts): contacts left
// from one test would push another test's contacts down the block.
test.afterEach(async () => {
  await pool.query("delete from contacts where name like $1", [`%${marker}`]);
});

test.afterAll(async () => {
  await pool.end();
});

type Frequency = "week" | "month" | "quarter" | "year";

/**
 * A moment for test data: an exact timestamp ("1995-09-15T12:00:00Z")
 * or a Postgres interval back from the database's now() ("8 days 1 hour").
 */
type Moment = { at: string } | { ago: string };

function momentParams(moment: Moment | undefined): [string | null, string | null] {
  if (!moment) return [null, null];
  return "at" in moment ? [moment.at, null] : [null, moment.ago];
}

const MOMENT_SQL = (at: number, ago: number) =>
  `coalesce($${at}::timestamptz, now() - $${ago}::interval)`;

async function createContact({
  name,
  frequency = null,
  frequencySetAt,
  notes = [],
}: {
  name: string;
  frequency?: Frequency | null;
  frequencySetAt?: Moment;
  notes?: { body: string; createdAt: Moment }[];
}): Promise<string> {
  const [setAt, setAgo] = momentParams(frequency ? (frequencySetAt ?? { ago: "0" }) : undefined);
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (name, contact_frequency, contact_frequency_set_at)
     values ($1, $2, case when $2::contact_frequency is null then null else ${MOMENT_SQL(3, 4)} end)
     returning id`,
    [name, frequency, setAt, setAgo],
  );
  const id = rows[0].id;
  for (const note of notes) {
    const [at, ago] = momentParams(note.createdAt);
    await pool.query(
      `insert into notes (contact_id, body, created_at) values ($1, $2, ${MOMENT_SQL(3, 4)})`,
      [id, note.body, at, ago],
    );
  }
  return id;
}

async function readContact(id: string) {
  const { rows } = await pool.query<{
    contact_frequency: Frequency | null;
    contact_frequency_set_at: Date | null;
    phone: string | null;
  }>("select contact_frequency, contact_frequency_set_at, phone from contacts where id = $1", [id]);
  return rows[0];
}

async function contactIdByName(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("select id from contacts where name = $1", [
    name,
  ]);
  expect(rows).toHaveLength(1);
  return rows[0].id;
}

async function chooseFrequency(page: Page, label: string) {
  await page.getByRole("dialog").getByRole("combobox", { name: "Как часто общаться" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function expectFrequencyField(dialog: Locator, label: string) {
  // Only the value: the arrow icon next to it carries a hidden "▼" text.
  await expect(
    dialog
      .getByRole("combobox", { name: "Как часто общаться" })
      .locator("[data-slot=select-value]"),
  ).toHaveText(label);
}

async function openEditForm(page: Page) {
  await page.getByRole("button", { name: "Изменить" }).click();
  return page.getByRole("dialog", { name: "Изменить контакт" });
}

test.describe("frequency in the contact form", () => {
  test("a new contact has no frequency unless one is chosen", async ({ page }) => {
    const name = `Нина ${marker}`;
    await page.goto("/");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Имя").fill(name);
    await expectFrequencyField(dialog, "Не задано");
    await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText("Контакт добавлен")).toBeVisible();

    const contact = await readContact(await contactIdByName(name));
    expect(contact.contact_frequency).toBeNull();
    expect(contact.contact_frequency_set_at).toBeNull();
  });

  test("the frequency chosen when adding is saved and shown in the card", async ({ page }) => {
    const name = `Мария ${marker}`;
    await page.goto("/");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Имя").fill(name);
    await chooseFrequency(page, "Раз в месяц");
    await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText("Контакт добавлен")).toBeVisible();

    const id = await contactIdByName(name);
    const contact = await readContact(id);
    expect(contact.contact_frequency).toBe("month");
    expect(contact.contact_frequency_set_at).not.toBeNull();

    await page.goto(`/contacts/${id}`);
    await expect(page.getByText("Общаемся раз в месяц")).toBeVisible();
  });

  test("changing the frequency saves it and starts the period anew", async ({ page }) => {
    const id = await createContact({
      name: `Олег ${marker}`,
      frequency: "year",
      frequencySetAt: { at: "2001-01-01T12:00:00Z" },
    });
    await page.goto(`/contacts/${id}`);
    await expect(page.getByText("Общаемся раз в год")).toBeVisible();

    const dialog = await openEditForm(page);
    await expectFrequencyField(dialog, "Раз в год");
    await chooseFrequency(page, "Раз в неделю");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();
    await expect(page.getByText("Общаемся раз в неделю")).toBeVisible();

    const contact = await readContact(id);
    expect(contact.contact_frequency).toBe("week");
    // Moved to the moment of the change (today), away from 2001.
    expect(contact.contact_frequency_set_at!.getFullYear()).toBeGreaterThan(2001);
  });

  test("saving the form without changing the frequency keeps where the period starts", async ({
    page,
  }) => {
    const setAt = "2001-01-01T12:00:00.000Z";
    const id = await createContact({
      name: `Пётр ${marker}`,
      frequency: "week",
      frequencySetAt: { at: setAt },
    });
    await page.goto(`/contacts/${id}`);

    const dialog = await openEditForm(page);
    await dialog.getByLabel("Телефон").fill("+7 900 111-22-33");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();

    const contact = await readContact(id);
    expect(contact.phone).toBe("+7 900 111-22-33");
    expect(contact.contact_frequency).toBe("week");
    expect(contact.contact_frequency_set_at!.toISOString()).toBe(setAt);
  });

  test("«Не задано» removes the frequency from the card", async ({ page }) => {
    const id = await createContact({ name: `Римма ${marker}`, frequency: "month" });
    await page.goto(`/contacts/${id}`);
    await expect(page.getByText("Общаемся раз в месяц")).toBeVisible();

    const dialog = await openEditForm(page);
    await chooseFrequency(page, "Не задано");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();
    await expect(page.getByText(/^Общаемся/)).toHaveCount(0);

    const contact = await readContact(id);
    expect(contact.contact_frequency).toBeNull();
    expect(contact.contact_frequency_set_at).toBeNull();
  });
});

function dueBlock(page: Page) {
  return page.getByRole("region", { name: "Пора связаться" });
}

function dueRow(page: Page, name: string) {
  return dueBlock(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

/**
 * The page arrives as ready HTML, and React attaches click handlers a moment
 * later (on a busy dev server, seconds later). A click before that is lost, so
 * wait until React has taken over the button: it then keeps its props on the element.
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

/** Contacts due long ago are on top; recent ones may sit below the first five. */
async function showWholeBlock(page: Page) {
  const block = dueBlock(page);
  await expect(block).toBeVisible();
  const more = block.getByRole("button", { name: /^Показать всех/ });
  if (await more.count()) {
    await waitUntilInteractive(more);
    await more.click();
    await expect(more).toHaveCount(0);
  }
}

/** Full days since the moment, by the database clock (the app counts the same way). */
async function fullDaysSince(moment: string): Promise<number> {
  const { rows } = await pool.query<{ days: number }>(
    "select floor(extract(epoch from now() - $1::timestamptz) / 86400)::int as days",
    [moment],
  );
  return rows[0].days;
}

/** "Просрочено на 11 234 дня (…)" -> 11234 */
function overdueDaysIn(text: string): number {
  return Number(text.match(/^Просрочено на ([\d\s]+) /)![1].replace(/\D/g, ""));
}

test.describe("the «Пора связаться» block", () => {
  // Test contacts are due in the 1990s, so they are the most overdue in any database.

  test("the most overdue contact is on top, and both stay in the contact list", async ({
    page,
  }) => {
    const anya = `Аня ${marker}`;
    const boris = `Борис ${marker}`;
    // Аня: once a week, the period ran out on 8 Jan 1990.
    await createContact({
      name: anya,
      frequency: "week",
      notes: [{ body: "Созвонились", createdAt: { at: "1990-01-01T12:00:00Z" } }],
    });
    // Борис: once a year, the period ran out 10 days earlier, on 29 Dec 1989.
    await createContact({
      name: boris,
      frequency: "year",
      notes: [{ body: "Встретились", createdAt: { at: "1988-12-29T12:00:00Z" } }],
    });

    await page.goto("/");
    const names = await dueBlock(page).getByRole("link").allTextContents();
    expect(names.slice(0, 2)).toEqual([boris, anya]);

    const list = page.getByRole("region", { name: "Список контактов" });
    await expect(list.getByRole("link", { name: anya, exact: true })).toBeVisible();
    await expect(list.getByRole("link", { name: boris, exact: true })).toBeVisible();
  });

  test("a row shows how overdue, the last note date and its first line", async ({ page }) => {
    const anya = `Аня ${marker}`;
    const boris = `Борис ${marker}`;
    // Once a month from 15 Jan: due on 15 Feb by the calendar (31 days), not after 30 days.
    await createContact({
      name: anya,
      frequency: "month",
      notes: [
        { body: "Старая заметка", createdAt: { at: "1994-06-01T12:00:00Z" } },
        {
          body: "Обсудили переезд в Казань\nИщет квартиру рядом с работой",
          createdAt: { at: "1995-01-15T12:00:00Z" },
        },
      ],
    });
    await createContact({
      name: boris,
      frequency: "week",
      frequencySetAt: { at: "1995-10-01T10:00:00Z" },
    });

    await page.goto("/");
    const anyaRow = dueRow(page, anya);
    const anyaMeta = anyaRow.getByText(
      /^Просрочено на .+ \(последняя заметка 15 января 1995 г\.\)$/,
    );
    await expect(anyaMeta).toBeVisible();
    expect(overdueDaysIn((await anyaMeta.textContent())!)).toBe(
      await fullDaysSince("1995-02-15T12:00:00Z"),
    );
    await expect(anyaRow.getByText("Обсудили переезд в Казань", { exact: true })).toBeVisible();
    await expect(anyaRow).not.toContainText("Ищет квартиру");

    const borisRow = dueRow(page, boris);
    const borisMeta = borisRow.getByText(/^Просрочено на .+ \(заметок нет\)$/);
    await expect(borisMeta).toBeVisible();
    expect(overdueDaysIn((await borisMeta.textContent())!)).toBe(
      await fullDaysSince("1995-10-08T10:00:00Z"),
    );
    // No note bubble: only the overdue line.
    await expect(borisRow.locator("p")).toHaveCount(1);
  });

  test("overdue days are full days, with the right word ending", async ({ page }) => {
    const cases = [
      { name: `Один ${marker}`, noteAgo: "8 days 1 hour", text: "Просрочено на 1 день" },
      { name: `Два ${marker}`, noteAgo: "9 days 1 hour", text: "Просрочено на 2 дня" },
      { name: `Пять ${marker}`, noteAgo: "12 days 1 hour", text: "Просрочено на 5 дней" },
      { name: `Двадцать один ${marker}`, noteAgo: "28 days 1 hour", text: "Просрочено на 21 день" },
      // The period ran out 2 hours ago: less than a full day.
      { name: `Сегодня ${marker}`, noteAgo: "7 days 2 hours", text: "Пора сегодня" },
    ];
    for (const { name, noteAgo } of cases) {
      await createContact({
        name,
        frequency: "week",
        notes: [{ body: "Поговорили", createdAt: { ago: noteAgo } }],
      });
    }

    await page.goto("/");
    await showWholeBlock(page);
    for (const { name, text } of cases) {
      await expect(dueRow(page, name).getByText(/\(последняя заметка .+\)$/)).toHaveText(
        new RegExp(`^${text} \\(последняя заметка \\d{1,2} [а-я]+ \\d{4} г\\.\\)$`),
      );
    }
  });

  test("pressing a row opens the contact card", async ({ page }) => {
    const name = `Вера ${marker}`;
    const id = await createContact({
      name,
      frequency: "quarter",
      frequencySetAt: { at: "1990-01-01T12:00:00Z" },
    });

    await page.goto("/");
    // A corner of the row, away from the name: the whole row is the link.
    await dueRow(page, name).click({ position: { x: 4, y: 4 } });
    await expect(page).toHaveURL(`/contacts/${id}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });

  test("first five, then «Показать всех (N)» reveals the rest", async ({ page }) => {
    const names = Array.from({ length: 6 }, (_, index) => `Шестеро ${index + 1} ${marker}`);
    for (const [index, name] of names.entries()) {
      await createContact({
        name,
        frequency: "week",
        frequencySetAt: { at: `1990-01-0${index + 1}T12:00:00Z` },
      });
    }

    await page.goto("/");
    const block = dueBlock(page);
    await expect(block.getByRole("listitem")).toHaveCount(5);
    expect(await block.getByRole("link").allTextContents()).toEqual(names.slice(0, 5));

    const more = block.getByRole("button", { name: /^Показать всех \(\d/ });
    const total = Number((await more.textContent())!.replace(/\D/g, ""));
    expect(total).toBeGreaterThanOrEqual(6);

    await waitUntilInteractive(more);
    await more.click();
    await expect(more).toHaveCount(0);
    await expect(block.getByRole("listitem")).toHaveCount(total);
    expect((await block.getByRole("link").allTextContents()).slice(0, 6)).toEqual(names);
  });

  test("the block hides while searching and comes back when the search is cleared", async ({
    page,
  }) => {
    const name = `Галина ${marker}`;
    await createContact({
      name,
      frequency: "month",
      frequencySetAt: { at: "1990-01-01T12:00:00Z" },
    });

    await page.goto("/");
    await expect(dueRow(page, name)).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Поиск контактов" });
    await search.fill(name);
    await expect(page.getByText("Найдено: 1 контакт")).toBeVisible();
    await expect(dueBlock(page)).toHaveCount(0);

    await search.fill("");
    await expect(page.getByText(/^Всего \d/)).toBeVisible();
    await expect(dueRow(page, name)).toBeVisible();
  });

  test("without notes the period counts from when the frequency was set", async ({ page }) => {
    const setLongAgo = `Задана давно ${marker}`;
    const setToday = `Задана сегодня ${marker}`;
    const notSet = `Не задана ${marker}`;
    await createContact({ name: setLongAgo, frequency: "week", frequencySetAt: { ago: "8 days" } });
    await createContact({ name: setToday, frequency: "week", frequencySetAt: { ago: "0" } });
    await createContact({
      name: notSet,
      notes: [{ body: "Давняя заметка", createdAt: { at: "1990-01-01T12:00:00Z" } }],
    });

    await page.goto("/");
    await showWholeBlock(page);
    await expect(dueRow(page, setLongAgo)).toContainText("Просрочено на 1 день (заметок нет)");
    await expect(dueBlock(page).getByRole("link", { name: setToday })).toHaveCount(0);
    await expect(dueBlock(page).getByRole("link", { name: notSet })).toHaveCount(0);
  });
});

const SAVE_FAILED =
  "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";

async function countContactedNotes(contactId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "select count(*) from notes where contact_id = $1 and body = 'Связались'",
    [contactId],
  );
  return Number(rows[0].count);
}

/** A contact due since 1990, so it is on top of the block. */
function createOverdueContact(name: string) {
  return createContact({
    name,
    frequency: "month",
    notes: [{ body: "Давняя заметка", createdAt: { at: "1990-01-01T12:00:00Z" } }],
  });
}

/** Waits for the home page list: the block is rendered together with it. */
async function waitForHomeList(page: Page) {
  await expect(page).toHaveURL("/");
  await expect(page.getByText(/^Всего \d/)).toBeVisible();
}

function notesList(page: Page) {
  return page.getByRole("region", { name: "Заметки" }).getByRole("listitem");
}

test.describe("the «Связались» button", () => {
  test("in the block: saves a note, the contact leaves the block, the page stays", async ({
    page,
  }) => {
    const name = `Аня ${marker}`;
    const id = await createOverdueContact(name);

    await page.goto("/");
    const button = dueRow(page, name).getByRole("button", { name: "Связались" });
    await waitUntilInteractive(button);
    await button.click();

    await expect(page.getByText("Заметка «Связались» сохранена")).toBeVisible();
    await expect(dueRow(page, name)).toHaveCount(0);
    await waitForHomeList(page);
    expect(await countContactedNotes(id)).toBe(1);

    // In the card the new note is on top, dated today.
    await page.goto(`/contacts/${id}`);
    const today = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
    await expect(notesList(page).first()).toContainText("Связались");
    await expect(notesList(page).first()).toContainText(today);
  });

  test("in the card: the note is on top, the count grows, the block no longer has the contact", async ({
    page,
  }) => {
    const name = `Борис ${marker}`;
    const id = await createOverdueContact(name);

    await page.goto(`/contacts/${id}`);
    await expect(page.getByText("1 заметка")).toBeVisible();
    const button = page.getByRole("button", { name: "Связались" });
    await waitUntilInteractive(button);
    await button.click();

    await expect(page.getByText("Заметка «Связались» сохранена")).toBeVisible();
    await expect(page.getByText("2 заметки")).toBeVisible();
    await expect(notesList(page).first()).toContainText("Связались");

    await page.getByRole("link", { name: "Все контакты" }).click();
    await waitForHomeList(page);
    await expect(dueBlock(page).getByRole("link", { name })).toHaveCount(0);
  });

  test("a contact without a frequency has no button in the card", async ({ page }) => {
    const name = `Вера ${marker}`;
    const id = await createContact({
      name,
      notes: [{ body: "Давняя заметка", createdAt: { at: "1990-01-01T12:00:00Z" } }],
    });

    await page.goto(`/contacts/${id}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("button", { name: "Добавить заметку" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Связались" })).toHaveCount(0);
  });

  test("a quick double press saves one note", async ({ page }) => {
    const id = await createOverdueContact(`Галина ${marker}`);
    await page.goto(`/contacts/${id}`);

    // Slow connection: every save takes 2 seconds to reach the server.
    await page.route(`**/contacts/${id}`, async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      await route.continue();
    });

    const button = page.getByRole("button", { name: "Связались" });
    await waitUntilInteractive(button);
    await button.dblclick();

    await expect(page.getByText("Заметка «Связались» сохранена").first()).toBeVisible();
    // The button comes back only when the save is done.
    await expect(button).toBeEnabled();
    await expect(page.getByText("2 заметки")).toBeVisible();
    expect(await countContactedNotes(id)).toBe(1);
  });

  test("when the save does not get through: an error message, the contact stays", async ({
    page,
  }) => {
    const name = `Дарья ${marker}`;
    const id = await createOverdueContact(name);
    await page.goto("/");

    // The request from the home page never reaches the server.
    await page.route(
      (url) => url.pathname === "/",
      (route) => (route.request().method() === "POST" ? route.abort() : route.continue()),
    );

    const button = dueRow(page, name).getByRole("button", { name: "Связались" });
    await waitUntilInteractive(button);
    await button.click();

    await expect(page.getByText(SAVE_FAILED)).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(dueRow(page, name)).toBeVisible();
    expect(await countContactedNotes(id)).toBe(0);
  });
});

test("a note written in the card takes the contact out of the block", async ({ page }) => {
  const name = `Евгения ${marker}`;
  await createOverdueContact(name);

  await page.goto("/");
  await dueBlock(page).getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page.getByLabel("Новая заметка").fill("Созвонились, всё хорошо");
  await page.getByRole("button", { name: "Добавить заметку" }).click();
  await expect(page.getByText("Заметка сохранена")).toBeVisible();

  // Back by the link, without reloading the page.
  await page.getByRole("link", { name: "Все контакты" }).click();
  await waitForHomeList(page);
  await expect(dueBlock(page).getByRole("link", { name })).toHaveCount(0);
});

const UNDO_FAILED =
  "Не удалось отменить: заметка «Связались» осталась. Проверьте, что база данных запущена.";

function undoButton(page: Page) {
  return page.getByRole("button", { name: "Отменить" });
}

/** Presses «Связались» in the card and waits for the message with «Отменить». */
async function markContactedInCard(page: Page) {
  const button = page.getByRole("button", { name: "Связались" });
  await waitUntilInteractive(button);
  await button.click();
  await expect(undoButton(page)).toBeVisible();
}

test.describe("«Отменить» after «Связались»", () => {
  test("in the block: the contact comes back to its place, the note is gone", async ({ page }) => {
    const anya = `Аня ${marker}`;
    const boris = `Борис ${marker}`;
    const id = await createOverdueContact(anya);
    await createContact({
      name: boris,
      frequency: "month",
      notes: [{ body: "Давняя заметка", createdAt: { at: "1990-02-01T12:00:00Z" } }],
    });

    await page.goto("/");
    expect((await dueBlock(page).getByRole("link").allTextContents()).slice(0, 2)).toEqual([
      anya,
      boris,
    ]);
    const rowBefore = await dueRow(page, anya).innerText();

    const button = dueRow(page, anya).getByRole("button", { name: "Связались" });
    await waitUntilInteractive(button);
    await button.click();
    await expect(dueRow(page, anya)).toHaveCount(0);

    await undoButton(page).click();
    await expect(dueRow(page, anya)).toBeVisible();
    expect((await dueBlock(page).getByRole("link").allTextContents()).slice(0, 2)).toEqual([
      anya,
      boris,
    ]);
    expect(await dueRow(page, anya).innerText()).toBe(rowBefore);
    expect(await countContactedNotes(id)).toBe(0);
  });

  test("in the card: the note disappears and the count goes back", async ({ page }) => {
    const id = await createOverdueContact(`Вера ${marker}`);
    await page.goto(`/contacts/${id}`);
    await expect(page.getByText("1 заметка")).toBeVisible();

    await markContactedInCard(page);
    await expect(page.getByText("2 заметки")).toBeVisible();

    await undoButton(page).click();
    await expect(page.getByText("1 заметка")).toBeVisible();
    await expect(notesList(page)).toHaveCount(1);
    await expect(notesList(page).first()).not.toContainText("Связались");
    expect(await countContactedNotes(id)).toBe(0);
  });

  test("after 10 seconds there is no «Отменить», the note stays", async ({ page }) => {
    const id = await createOverdueContact(`Галина ${marker}`);
    await page.goto(`/contacts/${id}`);
    await markContactedInCard(page);

    await page.waitForTimeout(11_000);
    await expect(undoButton(page)).toHaveCount(0);
    expect(await countContactedNotes(id)).toBe(1);
  });

  test("when the undo does not get through: an error message, the note stays", async ({ page }) => {
    const id = await createOverdueContact(`Дарья ${marker}`);
    await page.goto(`/contacts/${id}`);
    await markContactedInCard(page);

    // From now on requests from the card never reach the server.
    await page.route(`**/contacts/${id}`, (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await undoButton(page).click();

    await expect(page.getByText(UNDO_FAILED)).toBeVisible();
    expect(await countContactedNotes(id)).toBe(1);
  });
});

/** The frequency button in the card (outside the edit form). */
function frequencyPicker(page: Page) {
  return page.getByRole("combobox", { name: "Как часто общаться" });
}

async function pickFrequencyInCard(page: Page, label: string) {
  const picker = frequencyPicker(page);
  await waitUntilInteractive(picker);
  await picker.click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

test.describe("frequency from the contact card", () => {
  test("pressing the frequency changes it right away", async ({ page }) => {
    const id = await createContact({
      name: `Олег ${marker}`,
      frequency: "month",
      frequencySetAt: { at: "2001-01-01T12:00:00Z" },
    });
    await page.goto(`/contacts/${id}`);
    await expect(frequencyPicker(page)).toContainText("Общаемся раз в месяц");

    await pickFrequencyInCard(page, "Раз в неделю");
    await expect(frequencyPicker(page)).toContainText("Общаемся раз в неделю");
    await expect.poll(async () => (await readContact(id)).contact_frequency).toBe("week");
    // The frequency changed: the period starts from now, not from 2001.
    expect((await readContact(id)).contact_frequency_set_at!.getFullYear()).toBeGreaterThan(2001);

    await page.reload();
    await expect(frequencyPicker(page)).toContainText("Общаемся раз в неделю");
    await expectFrequencyField(await openEditForm(page), "Раз в неделю");
  });

  test("«Задать частоту» sets a frequency and brings «Связались»", async ({ page }) => {
    const id = await createContact({ name: `Пётр ${marker}` });
    await page.goto(`/contacts/${id}`);
    await expect(frequencyPicker(page)).toContainText("Задать частоту");
    await expect(page.getByRole("button", { name: "Связались" })).toHaveCount(0);

    await pickFrequencyInCard(page, "Раз в месяц");
    await expect(frequencyPicker(page)).toContainText("Общаемся раз в месяц");
    await expect(page.getByRole("button", { name: "Связались" })).toBeVisible();

    const contact = await readContact(id);
    expect(contact.contact_frequency).toBe("month");
    expect(contact.contact_frequency_set_at).not.toBeNull();
  });

  test("«Не задано» from the card: «Задать частоту», no «Связались», out of the block", async ({
    page,
  }) => {
    const name = `Римма ${marker}`;
    const id = await createOverdueContact(name);
    await page.goto(`/contacts/${id}`);

    await pickFrequencyInCard(page, "Не задано");
    await expect(frequencyPicker(page)).toContainText("Задать частоту");
    await expect(page.getByRole("button", { name: "Связались" })).toHaveCount(0);
    expect((await readContact(id)).contact_frequency).toBeNull();

    await page.getByRole("link", { name: "Все контакты" }).click();
    await waitForHomeList(page);
    await expect(dueBlock(page).getByRole("link", { name })).toHaveCount(0);
  });

  test("choosing the same frequency keeps where the period starts", async ({ page }) => {
    const setAt = "2001-01-01T12:00:00.000Z";
    const id = await createContact({
      name: `Семён ${marker}`,
      frequency: "week",
      frequencySetAt: { at: setAt },
    });
    await page.goto(`/contacts/${id}`);

    await pickFrequencyInCard(page, "Раз в неделю");
    await expect(frequencyPicker(page)).toContainText("Общаемся раз в неделю");
    // Give a possible save time to arrive before checking that nothing moved.
    await page.waitForTimeout(1_000);
    expect((await readContact(id)).contact_frequency_set_at!.toISOString()).toBe(setAt);
  });
});
