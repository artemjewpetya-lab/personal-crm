import { describe, expect, it } from "vitest";

import { groupSuggestions } from "./suggestions";

const GROUPS = [
  { id: "1", name: "Друзья" },
  { id: "2", name: "Семья" },
  { id: "3", name: "Елка" },
];

describe("groupSuggestions", () => {
  it("Создать новую группу", () => {
    expect(groupSuggestions("Теннис", GROUPS)).toEqual({ matches: [], createName: "Теннис" });
  });

  it("Группа с таким названием уже есть", () => {
    expect(groupSuggestions("семья", GROUPS)).toEqual({
      matches: [{ id: "2", name: "Семья" }],
      createName: null,
    });
  });

  it("Пробелы по краям", () => {
    expect(groupSuggestions("  Теннис  ", GROUPS).createName).toBe("Теннис");
    expect(groupSuggestions(" семья ", GROUPS).createName).toBeNull();
  });

  it("treats «ё» and «е» as the same letter", () => {
    expect(groupSuggestions("Ёлка", GROUPS)).toEqual({
      matches: [{ id: "3", name: "Елка" }],
      createName: null,
    });
  });

  it("offers matching groups and «Создать» for a part of a name", () => {
    expect(groupSuggestions("дру", GROUPS)).toEqual({
      matches: [{ id: "1", name: "Друзья" }],
      createName: "дру",
    });
  });

  it("shows all groups and no «Создать» for an empty query", () => {
    expect(groupSuggestions("   ", GROUPS)).toEqual({ matches: GROUPS, createName: null });
  });
});
