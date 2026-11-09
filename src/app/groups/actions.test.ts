import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { contacts, notes } from "@/db/schema";
import { givenContact, givenGroup, givenMembership, givenNote, groupNamesOf } from "../../../test/factories";
import { listGroups } from "@/lib/groups/queries";

import {
  addContactToGroup,
  createGroup,
  createGroupForContact,
  deleteGroup,
  removeContactFromGroup,
  renameGroup,
} from "./actions";

const names = async () => (await listGroups()).map((group) => group.name);

describe("createGroup", () => {
  it("Создать пустую группу", async () => {
    await givenGroup("Друзья");
    await givenGroup("Семья");

    const result = await createGroup("Аналитики");

    expect(result.ok).toBe(true);
    const groups = await listGroups();
    expect(groups.map(({ name, contactCount }) => ({ name, contactCount }))).toEqual([
      { name: "Аналитики", contactCount: 0 },
      { name: "Друзья", contactCount: 0 },
      { name: "Семья", contactCount: 0 },
    ]);
  });

  it("Пробелы по краям", async () => {
    await createGroup(" Аналитики ");

    expect(await names()).toEqual(["Аналитики"]);
  });

  it("Пустое название", async () => {
    expect(await createGroup("   ")).toEqual({
      ok: false,
      fieldErrors: { name: "Укажите название группы" },
    });
    expect(await names()).toEqual([]);
  });

  it("Слишком длинное название", async () => {
    expect(await createGroup("а".repeat(51))).toEqual({
      ok: false,
      fieldErrors: { name: "Название слишком длинное — не больше 50 символов" },
    });
    expect(await names()).toEqual([]);
  });

  it("Такая группа уже есть", async () => {
    await givenGroup("Друзья");

    const result = await createGroup("друзья");

    expect(result).toEqual({ ok: false, fieldErrors: { name: "Группа «Друзья» уже есть" } });
    expect(await names()).toEqual(["Друзья"]);
  });

  it("two simultaneous requests with one name create one group", async () => {
    const results = await Promise.all([createGroup("Теннис"), createGroup("теннис")]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await names()).toHaveLength(1);
  });
});

describe("renameGroup", () => {
  it("Переименовать", async () => {
    const tennis = await givenGroup("Теннис");
    const anna = await givenContact("Анна");
    await givenMembership(anna, tennis);

    const result = await renameGroup(tennis, "Большой теннис");

    expect(result.ok).toBe(true);
    const [group] = await listGroups();
    expect(group).toMatchObject({ name: "Большой теннис", contactCount: 1 });
  });

  it("Такое название уже есть", async () => {
    await givenGroup("Друзья");
    const tennis = await givenGroup("Теннис");

    const result = await renameGroup(tennis, "друзья");

    expect(result).toEqual({ ok: false, fieldErrors: { name: "Группа «Друзья» уже есть" } });
    expect(await names()).toEqual(["Друзья", "Теннис"]);
  });

  it("Такое название уже есть: «Ёлка» и «Елка» одно название", async () => {
    await givenGroup("Елка");
    const other = await givenGroup("Другая");

    const result = await renameGroup(other, "Ёлка");

    expect(result).toEqual({ ok: false, fieldErrors: { name: "Группа «Елка» уже есть" } });
  });

  it("Исправить большие и маленькие буквы", async () => {
    const tennis = await givenGroup("теннис");

    const result = await renameGroup(tennis, "Теннис");

    expect(result.ok).toBe(true);
    expect(await names()).toEqual(["Теннис"]);
  });

  it("Пустое название", async () => {
    const tennis = await givenGroup("Теннис");

    expect(await renameGroup(tennis, "  ")).toEqual({
      ok: false,
      fieldErrors: { name: "Укажите название группы" },
    });
    expect(await names()).toEqual(["Теннис"]);
  });

  it("Слишком длинное название", async () => {
    const tennis = await givenGroup("Теннис");

    expect(await renameGroup(tennis, "а".repeat(51))).toEqual({
      ok: false,
      fieldErrors: { name: "Название слишком длинное — не больше 50 символов" },
    });
    expect(await names()).toEqual(["Теннис"]);
  });

  it("answers «Группа не найдена…» for a group that is already deleted", async () => {
    const message = "Группа не найдена — возможно, её уже удалили.";

    expect(await renameGroup("7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10", "Теннис")).toEqual({
      ok: false,
      formError: message,
    });
    expect(await renameGroup("not-an-id", "Теннис")).toEqual({ ok: false, formError: message });
  });
});

describe("deleteGroup", () => {
  it("Удалить группу", async () => {
    const friends = await givenGroup("Друзья");
    const tennis = await givenGroup("Теннис");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);
    await givenMembership(anna, tennis);
    await givenNote(anna, "Договорились о матче");

    const result = await deleteGroup(tennis);

    expect(result.ok).toBe(true);
    expect(await names()).toEqual(["Друзья"]);
    expect(await db.select().from(contacts)).toHaveLength(1);
    expect(await db.select().from(notes)).toHaveLength(1);
    expect(await groupNamesOf(anna)).toEqual(["Друзья"]);
  });

  it("answers «Группа не найдена…» for a group that is already deleted", async () => {
    const message = "Группа не найдена — возможно, её уже удалили.";

    expect(await deleteGroup("7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10")).toEqual({
      ok: false,
      formError: message,
    });
    expect(await deleteGroup("not-an-id")).toEqual({ ok: false, formError: message });
  });
});

const MISSING_ID = "7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10";

describe("addContactToGroup", () => {
  it("Добавить в группу из карточки", async () => {
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");

    const result = await addContactToGroup(anna, friends);

    expect(result.ok).toBe(true);
    expect(await groupNamesOf(anna)).toEqual(["Друзья"]);
  });

  it("two quick marks of one group keep one link", async () => {
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");

    await Promise.all([addContactToGroup(anna, friends), addContactToGroup(anna, friends)]);

    expect(await groupNamesOf(anna)).toEqual(["Друзья"]);
  });

  it("does not bring back a group deleted in another tab", async () => {
    const anna = await givenContact("Анна");

    const result = await addContactToGroup(anna, MISSING_ID);

    expect(result).toEqual({ ok: false, formError: "Группа не найдена — возможно, её уже удалили." });
    expect(await names()).toEqual([]);
  });

  it("answers «Контакт не найден…» for a contact that is already deleted", async () => {
    const friends = await givenGroup("Друзья");

    const result = await addContactToGroup(MISSING_ID, friends);

    expect(result).toEqual({
      ok: false,
      formError: "Контакт не найден — возможно, его уже нет в базе.",
    });
  });
});

describe("removeContactFromGroup", () => {
  it("Убрать из группы в карточке", async () => {
    const friends = await givenGroup("Друзья");
    const tennis = await givenGroup("Теннис");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);
    await givenMembership(anna, tennis);

    const result = await removeContactFromGroup(anna, tennis);

    expect(result.ok).toBe(true);
    expect(await groupNamesOf(anna)).toEqual(["Друзья"]);
  });

  it("Убрать последнюю группу", async () => {
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);

    await removeContactFromGroup(anna, friends);

    expect(await groupNamesOf(anna)).toEqual([]);
    expect(await names()).toEqual(["Друзья"]);
  });
});

describe("createGroupForContact", () => {
  it("Создать группу из карточки", async () => {
    const anna = await givenContact("Анна");

    const result = await createGroupForContact(anna, "Теннис");

    expect(result.ok).toBe(true);
    expect(await names()).toEqual(["Теннис"]);
    expect(await groupNamesOf(anna)).toEqual(["Теннис"]);
  });

  it("Создать новую группу", async () => {
    const anna = await givenContact("Анна");

    await createGroupForContact(anna, " Теннис ");

    expect(await groupNamesOf(anna)).toEqual(["Теннис"]);
  });

  it("Группа с таким названием уже есть", async () => {
    await givenGroup("Семья");
    const anna = await givenContact("Анна");

    const result = await createGroupForContact(anna, "семья");

    expect(result).toMatchObject({ ok: true, data: { name: "Семья" } });
    expect(await names()).toEqual(["Семья"]);
    expect(await groupNamesOf(anna)).toEqual(["Семья"]);
  });

  it("Слишком длинное название", async () => {
    const anna = await givenContact("Анна");

    const result = await createGroupForContact(anna, "а".repeat(51));

    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: "Название слишком длинное — не больше 50 символов" },
    });
    expect(await names()).toEqual([]);
  });

  it("creates no group for a contact that is already deleted", async () => {
    const result = await createGroupForContact(MISSING_ID, "Теннис");

    expect(result).toEqual({
      ok: false,
      formError: "Контакт не найден — возможно, его уже нет в базе.",
    });
    expect(await names()).toEqual([]);
  });
});
