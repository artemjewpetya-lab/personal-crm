import { describe, expect, it } from "vitest";

import { dueBlockView } from "./due-block";

const contacts = (count: number) =>
  Array.from({ length: count }, (_, index) => `Контакт ${index + 1}`);

describe("dueBlockView", () => {
  it("Контактов не больше пяти: all 4 are shown, no «Показать всех»", () => {
    expect(dueBlockView(contacts(4), false)).toEqual({ visible: contacts(4), showAll: null });
  });

  it("shows exactly five without «Показать всех»", () => {
    expect(dueBlockView(contacts(5), false)).toEqual({ visible: contacts(5), showAll: null });
  });

  it("Контактов больше пяти: the first 5 and «Показать всех (30)»", () => {
    expect(dueBlockView(contacts(30), false)).toEqual({
      visible: contacts(5),
      showAll: "Показать всех (30)",
    });
  });

  it("Раскрыть всех: all 30 in the same order, no button", () => {
    expect(dueBlockView(contacts(30), true)).toEqual({ visible: contacts(30), showAll: null });
  });
});
