import { describe, expect, it } from "vitest";

import { signInEmailSchema } from "./validation";

describe("signInEmailSchema", () => {
  it("Пробелы и большие буквы", () => {
    expect(signInEmailSchema.parse(" Anna@Example.COM ")).toBe("anna@example.com");
  });

  it("Неверный адрес в форме и пустое поле", () => {
    for (const value of ["anna@", "anna", "@example.com", "", "   ", "anna @example.com"]) {
      const result = signInEmailSchema.safeParse(value);
      expect(result.success, `"${value}" must be rejected`).toBe(false);
      expect(result.error?.issues[0].message).toBe("Проверьте адрес почты");
    }
  });

  it("Неверный адрес не из формы: не строка", () => {
    for (const value of [
      undefined,
      null,
      42,
      ["anna@example.com"],
      { email: "anna@example.com" },
    ]) {
      const result = signInEmailSchema.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe("Проверьте адрес почты");
    }
  });
});
