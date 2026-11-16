const pluralRules = new Intl.PluralRules("ru-RU");
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** pluralize(5, ["контакт", "контакта", "контактов"]) -> "5 контактов" */
export function pluralize(
  value: number,
  [one, few, many]: [one: string, few: string, many: string],
): string {
  const rule = pluralRules.select(value);
  const word = rule === "one" ? one : rule === "few" ? few : many;
  return `${numberFormat.format(value)} ${word}`;
}

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

/** 15 Sep 2026 -> "15 сентября 2026 г." */
export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

/** 24 -> "Просрочено на 24 дня"; less than a full day -> "Пора сегодня" */
export function formatOverdue(days: number): string {
  return days < 1 ? "Пора сегодня" : `Просрочено на ${pluralize(days, ["день", "дня", "дней"])}`;
}

/** 14 Oct 2026 -> { day: "14", rest: "октября 2026 г." }: the day is shown large, like on the landing */
export function formatDateParts(date: Date): { day: string; rest: string } {
  const parts = dateFormat.formatToParts(date);
  return {
    day: parts.find((part) => part.type === "day")?.value ?? "",
    rest: parts
      .filter((part) => part.type !== "day")
      .map((part) => part.value)
      .join("")
      .trim(),
  };
}

/** "+7 900 123-45-67" -> "tel:+79001234567" */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// Birth dates are plain calendar dates, not moments: they are built with Date.UTC and
// formatted in UTC, so the time zone of the server cannot move them to another day.
const dayMonthFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const fullDateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const utcDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day));

/**
 * The line of a contact in "Скоро день рождения", in three parts so the middle one can be
 * highlighted: "20 ноября, " + "через 4 дня" + " · исполнится 36".
 */
export function formatBirthdayRow({
  date,
  daysUntil,
  age,
}: {
  date: { year: number; month: number; day: number };
  daysUntil: number;
  age: number | null;
}): { before: string; when: string; after: string } {
  const when =
    daysUntil === 0
      ? "сегодня"
      : daysUntil === 1
        ? "завтра"
        : `через ${pluralize(daysUntil, ["день", "дня", "дней"])}`;
  const verb = daysUntil === 0 ? "исполняется" : "исполнится";
  return {
    before: `${dayMonthFormat.format(utcDate(date.year, date.month, date.day))}, `,
    when,
    after: age === null ? "" : ` · ${verb} ${age}`,
  };
}

/** "День рождения 20 ноября 1990 г. (35 лет)"; without a year "День рождения 20 ноября" */
export function formatBirthdayLine(
  birthday: { day: number; month: number; year: number | null },
  age: number | null,
): string {
  if (birthday.year === null) {
    return `День рождения ${dayMonthFormat.format(utcDate(2000, birthday.month, birthday.day))}`;
  }
  const date = fullDateFormat.format(utcDate(birthday.year, birthday.month, birthday.day));
  return `День рождения ${date}${age === null ? "" : ` (${pluralize(age, ["год", "года", "лет"])})`}`;
}
