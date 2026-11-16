import { describe, expect, it } from "vitest";

import { formatBirthdayLine, formatBirthdayRow } from "./format";

const row = (
  date: { year: number; month: number; day: number },
  daysUntil: number,
  age: number | null,
) => {
  const { before, when, after } = formatBirthdayRow({ date, daysUntil, age });
  return before + when + after;
};

describe("formatBirthdayRow", () => {
  it("Строка с годом", () => {
    expect(row({ year: 2026, month: 11, day: 20 }, 4, 36)).toBe(
      "20 ноября, через 4 дня · исполнится 36",
    );
  });

  it("Строка без года", () => {
    expect(row({ year: 2026, month: 11, day: 18 }, 2, null)).toBe("18 ноября, через 2 дня");
  });

  it("Строка в день рождения", () => {
    expect(row({ year: 2026, month: 11, day: 16 }, 0, 26)).toBe(
      "16 ноября, сегодня · исполняется 26",
    );
  });

  it("Строка накануне", () => {
    expect(row({ year: 2026, month: 11, day: 17 }, 1, null)).toBe("17 ноября, завтра");
  });

  it("Окончания слова в днях", () => {
    expect(row({ year: 2026, month: 11, day: 19 }, 3, null)).toBe("19 ноября, через 3 дня");
    expect(row({ year: 2026, month: 11, day: 22 }, 6, null)).toBe("22 ноября, через 6 дней");
  });

  it("highlights only the «when» part", () => {
    expect(
      formatBirthdayRow({ date: { year: 2026, month: 11, day: 20 }, daysUntil: 4, age: 36 }),
    ).toEqual({ before: "20 ноября, ", when: "через 4 дня", after: " · исполнится 36" });
  });

  it("writes 28 February for 29 February in a non-leap year", () => {
    expect(row({ year: 2027, month: 2, day: 28 }, 3, null)).toBe("28 февраля, через 3 дня");
  });
});

describe("formatBirthdayLine", () => {
  it("Дата с годом в карточке", () => {
    expect(formatBirthdayLine({ day: 20, month: 11, year: 1990 }, 35)).toBe(
      "День рождения 20 ноября 1990 г. (35 лет)",
    );
  });

  it("Дата без года в карточке", () => {
    expect(formatBirthdayLine({ day: 3, month: 3, year: null }, null)).toBe(
      "День рождения 3 марта",
    );
  });

  it("Окончания слова в возрасте", () => {
    const line = (age: number) => formatBirthdayLine({ day: 20, month: 11, year: 1990 }, age);
    expect(line(21)).toMatch(/\(21 год\)$/);
    expect(line(22)).toMatch(/\(22 года\)$/);
    expect(line(35)).toMatch(/\(35 лет\)$/);
  });

  it("shows «0 лет» for a person born today", () => {
    expect(formatBirthdayLine({ day: 16, month: 11, year: 2026 }, 0)).toBe(
      "День рождения 16 ноября 2026 г. (0 лет)",
    );
  });
});
