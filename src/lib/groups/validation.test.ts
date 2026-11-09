import { describe, expect, it } from "vitest";

import { GROUP_NAME_REQUIRED, GROUP_NAME_TOO_LONG } from "./messages";
import { groupNameSchema, normalizeGroupName } from "./validation";

describe("group name", () => {
  it("Пустое название", () => {
    for (const name of ["", "   "]) {
      const result = groupNameSchema.safeParse(name);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(GROUP_NAME_REQUIRED);
    }
    expect(GROUP_NAME_REQUIRED).toBe("Укажите название группы");
  });

  it("Слишком длинное название", () => {
    expect(groupNameSchema.safeParse("а".repeat(50)).success).toBe(true);

    const result = groupNameSchema.safeParse("а".repeat(51));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(GROUP_NAME_TOO_LONG);
    expect(GROUP_NAME_TOO_LONG).toBe("Название слишком длинное — не больше 50 символов");
  });

  it("Пробелы по краям", () => {
    expect(groupNameSchema.parse(" Аналитики ")).toBe("Аналитики");
  });

  it("normalizeGroupName treats letter case and «ё» like the database index", () => {
    expect(normalizeGroupName("  Ёлка ")).toBe("елка");
    expect(normalizeGroupName("ТЕННИС")).toBe(normalizeGroupName("теннис"));
  });
});
