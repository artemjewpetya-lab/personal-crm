import { describe, expect, it } from "vitest";

import { frequencySummary } from "./frequency";

describe("frequencySummary", () => {
  it.each([
    ["week", "Общаемся раз в неделю"],
    ["month", "Общаемся раз в месяц"],
    ["quarter", "Общаемся раз в квартал"],
    ["year", "Общаемся раз в год"],
  ] as const)("Частота задана: %s -> «%s»", (frequency, text) => {
    expect(frequencySummary(frequency)).toBe(text);
  });
});
