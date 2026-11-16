import { describe, expect, it } from "vitest";

import { ageOn, moscowToday, nextBirthday, upcomingBirthdays, type Birthday } from "./birthdays";

const date = (year: number, month: number, day: number) => ({ year, month, day });
const birthday = (day: number, month: number, year: number | null = null): Birthday => ({
  day,
  month,
  year,
});

describe("moscowToday", () => {
  it("Полночь по Москве: 16 ноября 21:30 UTC is already 17 November in Moscow", () => {
    expect(moscowToday(new Date("2026-11-16T21:30:00Z"))).toEqual(date(2026, 11, 17));
  });

  it("16 ноября 20:59 UTC is still 16 November in Moscow", () => {
    expect(moscowToday(new Date("2026-11-16T20:59:00Z"))).toEqual(date(2026, 11, 16));
  });

  it("changes the year at midnight in Moscow", () => {
    expect(moscowToday(new Date("2026-12-31T21:00:00Z"))).toEqual(date(2027, 1, 1));
  });
});

describe("nextBirthday", () => {
  const today = date(2026, 11, 16);

  it("День рождения сегодня: 0 days", () => {
    expect(nextBirthday(birthday(16, 11), today)).toEqual({
      date: date(2026, 11, 16),
      daysUntil: 0,
    });
  });

  it("Через 7 дней", () => {
    expect(nextBirthday(birthday(23, 11), today)).toEqual({
      date: date(2026, 11, 23),
      daysUntil: 7,
    });
  });

  it("Через 8 дней", () => {
    expect(nextBirthday(birthday(24, 11), today)).toEqual({
      date: date(2026, 11, 24),
      daysUntil: 8,
    });
  });

  it("День рождения был вчера: the next one is in a year", () => {
    expect(nextBirthday(birthday(15, 11), today)).toEqual({
      date: date(2027, 11, 15),
      daysUntil: 364,
    });
  });

  it("Через Новый год: 28 December -> 3 January is 6 days", () => {
    expect(nextBirthday(birthday(3, 1), date(2026, 12, 28))).toEqual({
      date: date(2027, 1, 3),
      daysUntil: 6,
    });
  });

  it("29 февраля в невисокосный год: the birthday is 28 February", () => {
    expect(nextBirthday(birthday(29, 2), date(2027, 2, 25))).toEqual({
      date: date(2027, 2, 28),
      daysUntil: 3,
    });
  });

  it("29 февраля в високосный год: the birthday is 29 February", () => {
    expect(nextBirthday(birthday(29, 2), date(2028, 2, 25))).toEqual({
      date: date(2028, 2, 29),
      daysUntil: 4,
    });
  });

  it("Родился сегодня: the first birthday is in a year", () => {
    expect(nextBirthday(birthday(16, 11, 2026), today)).toEqual({
      date: date(2027, 11, 16),
      daysUntil: 365,
    });
  });
});

describe("ageOn", () => {
  it("Возраст в день рождения: 20 November 1990 on 20 November 2026 is 36", () => {
    expect(ageOn(birthday(20, 11, 1990), date(2026, 11, 20))).toBe(36);
  });

  it("is one less the day before", () => {
    expect(ageOn(birthday(20, 11, 1990), date(2026, 11, 19))).toBe(35);
  });

  it("is empty when the year is not known", () => {
    expect(ageOn(birthday(20, 11), date(2026, 11, 20))).toBeNull();
  });

  it("Возраст родившегося 29 февраля: grows on 28 February in a non-leap year", () => {
    const vera = birthday(29, 2, 2000);
    expect(ageOn(vera, date(2027, 2, 27))).toBe(26);
    expect(ageOn(vera, date(2027, 2, 28))).toBe(27);
  });

  it("grows on 29 February in a leap year", () => {
    const vera = birthday(29, 2, 2000);
    expect(ageOn(vera, date(2028, 2, 28))).toBe(27);
    expect(ageOn(vera, date(2028, 2, 29))).toBe(28);
  });

  it("is 0 on the day of birth", () => {
    expect(ageOn(birthday(16, 11, 2026), date(2026, 11, 16))).toBe(0);
  });
});

describe("upcomingBirthdays", () => {
  const today = date(2026, 11, 16);
  const person = (name: string, day: number, month: number, year: number | null = null) => ({
    name,
    birthDay: day,
    birthMonth: month,
    birthYear: year,
  });

  it("keeps only 0-7 days and adds when and how old", () => {
    const result = upcomingBirthdays(
      [
        person("Сегодня", 16, 11, 2000),
        person("Через 7", 23, 11),
        person("Через 8", 24, 11),
        person("Вчера", 15, 11),
        person("Родился сегодня", 16, 11, 2026),
      ],
      today,
    );

    expect(result.map((item) => item.name)).toEqual(["Сегодня", "Через 7"]);
    expect(result[0]).toMatchObject({ daysUntil: 0, date: date(2026, 11, 16), age: 26 });
    expect(result[1]).toMatchObject({ daysUntil: 7, date: date(2026, 11, 23), age: null });
  });

  it("Порядок по близости: the nearest first", () => {
    const result = upcomingBirthdays(
      [person("Борис", 20, 11), person("Вера", 18, 11), person("Аня", 18, 11)],
      today,
    );
    expect(result.map((item) => item.name)).toEqual(["Вера", "Аня", "Борис"]);
  });

  it("Стабильный порядок: with equal days the contacts stay in the order they came", () => {
    const names = ["Аня", "Борис", "Вера", "Глеб", "Дима", "Ева", "Жанна", "Зоя"];
    const result = upcomingBirthdays(
      names.map((name) => person(name, 18, 11)),
      today,
    );
    expect(result.map((item) => item.name)).toEqual(names);
  });

  it("is empty when nobody has a birthday soon", () => {
    expect(upcomingBirthdays([person("Аня", 1, 3)], today)).toEqual([]);
  });
});
