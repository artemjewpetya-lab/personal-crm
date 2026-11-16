import { describe, expect, it } from "vitest";

import { homeBlockView } from "./home-block";

const contacts = (count: number) =>
  Array.from({ length: count }, (_, index) => `Контакт ${index + 1}`);

describe("homeBlockView", () => {
  it("Контактов не больше пяти: all 4 are shown, no «Показать всех»", () => {
    expect(homeBlockView(contacts(4), false)).toEqual({ visible: contacts(4), showAll: null });
  });

  it("shows exactly five without «Показать всех»", () => {
    expect(homeBlockView(contacts(5), false)).toEqual({ visible: contacts(5), showAll: null });
  });

  it("Контактов больше пяти: the first 5 and «Показать всех (30)»", () => {
    expect(homeBlockView(contacts(30), false)).toEqual({
      visible: contacts(5),
      showAll: "Показать всех (30)",
    });
  });

  it("Раскрыть всех: all 30 in the same order, no button", () => {
    expect(homeBlockView(contacts(30), true)).toEqual({ visible: contacts(30), showAll: null });
  });

  // «Скоро день рождения» uses the same function as «Пора связаться»; these guard that.
  it("Дней рождения не больше пяти: all 4 are shown, no «Показать всех»", () => {
    expect(homeBlockView(contacts(4), false)).toEqual({ visible: contacts(4), showAll: null });
  });

  it("Дней рождения больше пяти: the first 5 and «Показать всех (8)»", () => {
    expect(homeBlockView(contacts(8), false)).toEqual({
      visible: contacts(5),
      showAll: "Показать всех (8)",
    });
  });
});
