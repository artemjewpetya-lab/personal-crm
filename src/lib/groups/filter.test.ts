import { describe, expect, it } from "vitest";

import { resolveGroupFilter } from "./filter";

const GROUPS = [{ id: "7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10" }, { id: "0f4f7f4c-6d3c-4a3c-8c53-2d1a7f6e9b21" }];

describe("resolveGroupFilter", () => {
  it("Фильтр в адресе страницы", () => {
    expect(resolveGroupFilter(GROUPS[1].id, GROUPS)).toBe(GROUPS[1].id);
  });

  it("Группу из адреса удалили", () => {
    expect(resolveGroupFilter("11111111-2222-4333-8444-555555555555", GROUPS)).toBeNull();
  });

  it("Все группы", () => {
    expect(resolveGroupFilter(undefined, GROUPS)).toBeNull();
    expect(resolveGroupFilter("", GROUPS)).toBeNull();
  });

  it("ignores a value that is not a group id", () => {
    expect(resolveGroupFilter("Семья", GROUPS)).toBeNull();
    expect(resolveGroupFilter(["a", "b"], GROUPS)).toBeNull();
  });
});
