import { describe, expect, it } from "vitest";

import { pickerItems, sortGroups } from "./picker";

const GROUPS = [
  { id: "2", name: "Семья" },
  { id: "1", name: "Друзья" },
];

describe("pickerItems", () => {
  it("lists all groups by name for an empty query", () => {
    expect(pickerItems("", sortGroups(GROUPS))).toEqual([
      { id: "1", name: "Друзья" },
      { id: "2", name: "Семья" },
    ]);
  });

  it("Создать новую группу: adds the «Создать группу» item last", () => {
    expect(pickerItems("Теннис", GROUPS)).toEqual([
      { id: "create:Теннис", name: "Создать группу «Теннис»" },
    ]);
  });

  it("Группа с таким названием уже есть: no «Создать группу» item", () => {
    expect(pickerItems("семья", GROUPS)).toEqual([{ id: "2", name: "Семья" }]);
  });
});

describe("sortGroups", () => {
  it("sorts by name ignoring letter case and «ё»", () => {
    const sorted = sortGroups([{ name: "яхты" }, { name: "Ёлка" }, { name: "Друзья" }]);

    expect(sorted.map((group) => group.name)).toEqual(["Друзья", "Ёлка", "яхты"]);
  });
});
