import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contactFieldErrors, contactInputSchema } from "./validation";

const base = { name: "Анна", about: "", howWeMet: "", phone: "", email: "", contactFrequency: "" };

const IMPOSSIBLE_DATE = "Такой даты не бывает — проверьте день, месяц и год";

// The form sends three strings; the month is its number "1"-"12", empty for «Не указан».
function check(day: string, month: string, year: string) {
  const parsed = contactInputSchema.safeParse({ ...base, birthday: { day, month, year } });
  return parsed.success
    ? { ok: true as const, birthday: parsed.data.birthday }
    : { ok: false as const, errors: contactFieldErrors(parsed.error) };
}

// "Today" is 16 November 2026 (Moscow)
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("contactInputSchema: birthday", () => {
  it("Новый контакт без даты: all three parts empty is no date", () => {
    expect(check("", "", "")).toEqual({ ok: true, birthday: null });
  });

  it("is no date when the field is not sent at all", () => {
    const parsed = contactInputSchema.safeParse(base);
    expect(parsed.success && parsed.data.birthday).toBeNull();
  });

  it("Дата с годом", () => {
    expect(check("20", "11", "1990")).toEqual({
      ok: true,
      birthday: { day: 20, month: 11, year: 1990 },
    });
  });

  it("Дата без года", () => {
    expect(check("20", "11", "")).toEqual({
      ok: true,
      birthday: { day: 20, month: 11, year: null },
    });
  });

  it("ignores spaces around the parts", () => {
    expect(check(" 5 ", "3", " 1990 ")).toEqual({
      ok: true,
      birthday: { day: 5, month: 3, year: 1990 },
    });
  });

  it("День без месяца", () => {
    expect(check("20", "", "")).toEqual({ ok: false, errors: { birthday: "Выберите месяц" } });
    expect(check("20", "", "1990")).toEqual({ ok: false, errors: { birthday: "Выберите месяц" } });
  });

  it("Месяц без дня", () => {
    expect(check("", "11", "")).toEqual({ ok: false, errors: { birthday: "Укажите день" } });
    expect(check("", "11", "1990")).toEqual({ ok: false, errors: { birthday: "Укажите день" } });
  });

  it("Год без дня и месяца", () => {
    expect(check("", "", "1990")).toEqual({
      ok: false,
      errors: { birthday: "Укажите день и месяц" },
    });
  });

  it("Такого числа нет", () => {
    expect(check("31", "4", "")).toEqual({ ok: false, errors: { birthday: IMPOSSIBLE_DATE } });
    expect(check("32", "1", "")).toEqual({ ok: false, errors: { birthday: IMPOSSIBLE_DATE } });
    expect(check("0", "1", "")).toEqual({ ok: false, errors: { birthday: IMPOSSIBLE_DATE } });
    expect(check("1", "13", "")).toEqual({ ok: false, errors: { birthday: IMPOSSIBLE_DATE } });
  });

  it("День не числом", () => {
    expect(check("двадцать", "11", "")).toEqual({
      ok: false,
      errors: { birthday: IMPOSSIBLE_DATE },
    });
    expect(check("2.5", "11", "")).toEqual({ ok: false, errors: { birthday: IMPOSSIBLE_DATE } });
    expect(check("-3", "11", "")).toEqual({ ok: false, errors: { birthday: IMPOSSIBLE_DATE } });
  });

  it("29 февраля в невисокосный год", () => {
    expect(check("29", "2", "2023")).toEqual({
      ok: false,
      errors: { birthday: IMPOSSIBLE_DATE },
    });
    expect(check("29", "2", "1900")).toEqual({
      ok: false,
      errors: { birthday: IMPOSSIBLE_DATE },
    });
  });

  it("29 февраля в високосный год", () => {
    expect(check("29", "2", "2024")).toEqual({
      ok: true,
      birthday: { day: 29, month: 2, year: 2024 },
    });
    expect(check("29", "2", "2000").ok).toBe(true);
  });

  it("29 февраля без года", () => {
    expect(check("29", "2", "")).toEqual({
      ok: true,
      birthday: { day: 29, month: 2, year: null },
    });
  });

  it("Год записан не так", () => {
    const error = { ok: false, errors: { birthday: "Год — четыре цифры, например 1990" } };
    expect(check("20", "11", "90")).toEqual(error);
    expect(check("20", "11", "19900")).toEqual(error);
    expect(check("20", "11", "год")).toEqual(error);
  });

  it("Слишком ранний год", () => {
    expect(check("20", "11", "1899")).toEqual({
      ok: false,
      errors: { birthday: "Год — не раньше 1900" },
    });
    expect(check("20", "11", "1900").ok).toBe(true);
  });

  it("Дата в будущем", () => {
    const error = { ok: false, errors: { birthday: "Дата рождения ещё не наступила" } };
    expect(check("20", "11", "2026")).toEqual(error);
    expect(check("17", "11", "2026")).toEqual(error);
    expect(check("1", "1", "2027")).toEqual(error);
  });

  it("allows today and the past of this year", () => {
    expect(check("16", "11", "2026").ok).toBe(true);
    expect(check("15", "11", "2026").ok).toBe(true);
    // A day later does not matter without a year
    expect(check("20", "11", "").ok).toBe(true);
  });

  it("looks at today in Moscow, not in UTC", () => {
    // 16 November 22:00 UTC is already 17 November in Moscow
    vi.setSystemTime(new Date("2026-11-16T22:00:00Z"));
    expect(check("17", "11", "2026").ok).toBe(true);
    expect(check("18", "11", "2026").ok).toBe(false);
  });

  it("checks the order: what is filled, then the year, then the date, then the future", () => {
    // Year first: «90» is reported before «31 April» would be
    expect(check("31", "4", "90")).toEqual({
      ok: false,
      errors: { birthday: "Год — четыре цифры, например 1990" },
    });
    // Existence first: 31 April 2030 is reported as impossible, not as the future
    expect(check("31", "4", "2030")).toEqual({ ok: false, errors: { birthday: IMPOSSIBLE_DATE } });
  });

  it("Ошибка любой части - под полем «Дата рождения»", () => {
    for (const [day, month, year] of [
      ["", "11", ""],
      ["20", "", ""],
      ["", "", "1990"],
      ["31", "4", ""],
      ["20", "11", "90"],
    ]) {
      const result = check(day, month, year);
      expect(result.ok === false && Object.keys(result.errors)).toEqual(["birthday"]);
    }
  });

  it("keeps the other fields' errors as they were", () => {
    const parsed = contactInputSchema.safeParse({
      ...base,
      name: "",
      birthday: { day: "20", month: "", year: "" },
    });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && contactFieldErrors(parsed.error)).toEqual({
      name: "Укажите имя",
      birthday: "Выберите месяц",
    });
  });

  it("does not break «updateContactFrequency»: the frequency has its own schema", () => {
    expect(contactInputSchema.shape.contactFrequency.safeParse("month").data).toBe("month");
    expect(contactInputSchema.shape.contactFrequency.safeParse("").data).toBeNull();
  });
});
