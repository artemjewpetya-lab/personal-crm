// Calendar rules for birthdays. No database and no "server-only": the month names are also
// needed by the form in the browser. A date is a plain { year, month, day } without hours or a
// time zone, and days are counted with Date.UTC, so the server's time zone changes nothing.

export type CalendarDate = { year: number; month: number; day: number };

/** A birthday: day and month, the year when it is known. */
export type Birthday = { day: number; month: number; year: number | null };

/** A birthday that is soon, with when it is and how old the person becomes. */
export type UpcomingBirthday<T> = T & {
  /** The day the birthday falls on this time (29 February -> 28 February in a non-leap year) */
  date: CalendarDate;
  /** 0 - today */
  daysUntil: number;
  /** How old the person is on that day; empty when the year is not known */
  age: number | null;
};

/** How many days ahead a birthday counts as "soon" (today included). */
export const SOON_DAYS = 7;

export const MONTH_NAMES = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "en-CA" gives year, month and day as plain numbers; the order comes from the parts, not the text.
const moscowParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Moscow: a new day starts at midnight Moscow time. `now` is for tests. */
export function moscowToday(now: Date = new Date()): CalendarDate {
  const parts = moscowParts.formatToParts(now);
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in the month; 29 February exists without a year (we do not know the year). */
export function daysInMonth(month: number, year: number | null): number {
  if (month === 2) return year === null || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** The birthday in the given year; 29 February in a non-leap year is 28 February. */
export function birthdayIn(birthday: Birthday, year: number): CalendarDate {
  const day = birthday.month === 2 && birthday.day === 29 && !isLeapYear(year) ? 28 : birthday.day;
  return { year, month: birthday.month, day };
}

// 20261116: dates compare as numbers
const sortKey = (date: CalendarDate) => date.year * 10000 + date.month * 100 + date.day;

const daysBetween = (from: CalendarDate, to: CalendarDate) =>
  Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) /
      MS_PER_DAY,
  );

/**
 * The nearest birthday starting from today. With a known year a birthday only happens in the
 * years after it: a person born today has the first birthday in a year.
 */
export function nextBirthday(
  birthday: Birthday,
  today: CalendarDate,
): { date: CalendarDate; daysUntil: number } {
  let year = today.year;
  if (birthday.year !== null && year <= birthday.year) year = birthday.year + 1;
  let date = birthdayIn(birthday, year);
  if (sortKey(date) < sortKey(today)) date = birthdayIn(birthday, year + 1);
  return { date, daysUntil: daysBetween(today, date) };
}

/** Full years on the given date; empty when the year of birth is not known. */
export function ageOn(birthday: Birthday, today: CalendarDate): number | null {
  if (birthday.year === null) return null;
  const years = today.year - birthday.year;
  return sortKey(birthdayIn(birthday, today.year)) > sortKey(today) ? years - 1 : years;
}

type WithBirthday = { birthDay: number; birthMonth: number; birthYear: number | null };

/**
 * Contacts whose birthday is today or in the next 7 days, the nearest first.
 * The sort is stable: with equal days the contacts stay in the order they came (the database
 * gives them by name, so the order inside one day is the same as in the contact list).
 */
export function upcomingBirthdays<T extends WithBirthday>(
  contacts: T[],
  today: CalendarDate,
): UpcomingBirthday<T>[] {
  return contacts
    .map((contact) => {
      const birthday = {
        day: contact.birthDay,
        month: contact.birthMonth,
        year: contact.birthYear,
      };
      const { date, daysUntil } = nextBirthday(birthday, today);
      return { ...contact, date, daysUntil, age: ageOn(birthday, date) };
    })
    .filter((contact) => contact.daysUntil <= SOON_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
