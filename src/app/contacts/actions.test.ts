import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { contacts, groups } from "@/db/schema";
import { listContactGroups, listGroups } from "@/lib/groups/queries";
import { listDueContacts } from "@/lib/contacts/queries";
import type { ContactFormValues } from "@/lib/contacts/validation";

import {
  ago,
  givenContact,
  givenGroup,
  givenMembership,
  givenNote,
  groupNamesOf,
} from "../../../test/factories";

import { createContact, updateContact, updateContactFrequency } from "./actions";

const MISSING_ID = "7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10";

function form(overrides: Partial<ContactFormValues> = {}): ContactFormValues {
  return {
    name: "Анна",
    about: "Коллега",
    howWeMet: "",
    phone: "",
    email: "",
    contactFrequency: "",
    ...overrides,
  };
}

async function created(values: ContactFormValues): Promise<string> {
  const result = await createContact(values);
  if (!result.ok) throw new Error("The contact was not created");
  return result.data.id;
}

const groupNames = async () => (await listGroups()).map((group) => group.name);

describe("createContact with groups", () => {
  it("Группы при добавлении", async () => {
    const family = await givenGroup("Семья");
    const friends = await givenGroup("Друзья");

    const id = await created(form({ groupIds: [family, friends] }));

    expect((await listContactGroups(id)).map((group) => group.name)).toEqual(["Друзья", "Семья"]);
  });

  it("Без групп", async () => {
    await givenGroup("Семья");

    const id = await created(form({ groupIds: [] }));

    expect(await groupNamesOf(id)).toEqual([]);
    const [saved] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(saved).toMatchObject({ name: "Анна", about: "Коллега" });
  });

  it("Новая группа из формы", async () => {
    const id = await created(form({ newGroupNames: [" Теннис "] }));

    expect(await groupNames()).toEqual(["Теннис"]);
    expect(await groupNamesOf(id)).toEqual(["Теннис"]);
  });

  it("uses the existing group when a new name matches it", async () => {
    await givenGroup("Семья");

    const id = await created(form({ newGroupNames: ["семья", "СЕМЬЯ"] }));

    expect(await groupNames()).toEqual(["Семья"]);
    expect(await groupNamesOf(id)).toEqual(["Семья"]);
  });

  it("Ошибка в названии новой группы", async () => {
    const result = await createContact(form({ newGroupNames: ["а".repeat(51)] }));

    expect(result).toEqual({
      ok: false,
      fieldErrors: { groups: "Название слишком длинное — не больше 50 символов" },
    });
    expect(await db.select().from(contacts)).toEqual([]);
    expect(await db.select().from(groups)).toEqual([]);
  });

  it("skips a selected group that was deleted in the meantime", async () => {
    const family = await givenGroup("Семья");

    const id = await created(form({ groupIds: [family, MISSING_ID] }));

    expect(await groupNamesOf(id)).toEqual(["Семья"]);
  });
});

describe("updateContact with groups", () => {
  it("Текущие группы в форме «Изменить»", async () => {
    const friends = await givenGroup("Друзья");
    const tennis = await givenGroup("Теннис");
    await givenGroup("Семья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);
    await givenMembership(anna, tennis);

    expect(await listContactGroups(anna)).toEqual([
      { id: friends, name: "Друзья" },
      { id: tennis, name: "Теннис" },
    ]);
  });

  it("Убрать группу в форме", async () => {
    const friends = await givenGroup("Друзья");
    const tennis = await givenGroup("Теннис");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);
    await givenMembership(anna, tennis);

    const result = await updateContact(anna, form({ groupIds: [friends] }));

    expect(result.ok).toBe(true);
    expect(await groupNamesOf(anna)).toEqual(["Друзья"]);
  });

  it("removes all groups when the form sends none", async () => {
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);

    await updateContact(anna, form({ groupIds: [] }));

    expect(await groupNamesOf(anna)).toEqual([]);
  });

  it("leaves the groups as they are when the form does not mention them", async () => {
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);

    await updateContact(anna, form());

    expect(await groupNamesOf(anna)).toEqual(["Друзья"]);
  });

  it("Новая группа из формы", async () => {
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);

    const result = await updateContact(
      anna,
      form({ groupIds: [friends], newGroupNames: ["Теннис"] }),
    );

    expect(result.ok).toBe(true);
    expect(await groupNames()).toEqual(["Друзья", "Теннис"]);
    expect((await listContactGroups(anna)).map((group) => group.name)).toEqual([
      "Друзья",
      "Теннис",
    ]);
  });

  it("Ошибка в названии новой группы", async () => {
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, friends);

    const result = await updateContact(
      anna,
      form({ name: "Анна Новая", groupIds: [], newGroupNames: ["а".repeat(51)] }),
    );

    expect(result).toMatchObject({ ok: false, fieldErrors: { groups: expect.any(String) } });
    expect(await groupNamesOf(anna)).toEqual(["Друзья"]);
    const [saved] = await db.select().from(contacts).where(eq(contacts.id, anna));
    expect(saved.name).toBe("Анна");
  });

  it("creates no group for a contact that is already deleted", async () => {
    const result = await updateContact(MISSING_ID, form({ newGroupNames: ["Теннис"] }));

    expect(result.ok).toBe(false);
    expect(await groupNames()).toEqual([]);
  });
});

describe("frequency and the due date", () => {
  const dueNames = async () => (await listDueContacts()).map((contact) => contact.name);

  /** «Раз в год», the last note two months ago: not due yet. */
  async function givenYearlyContactWithOldNote(): Promise<string> {
    const id = await givenContact("Анна", {
      contactFrequency: "year",
      contactFrequencySetAt: new Date("2020-01-01T00:00:00Z"),
    });
    await givenNote(id, "Обсудили переезд", ago("2 months"));
    expect(await dueNames()).toEqual([]);
    return id;
  }

  it("Есть заметки, частоту сменили: in the form, the period counts from the last note", async () => {
    const id = await givenYearlyContactWithOldNote();

    const result = await updateContact(id, form({ contactFrequency: "month" }));

    expect(result.ok).toBe(true);
    expect(await dueNames()).toEqual(["Анна"]);
  });

  it("Есть заметки, частоту сменили: in the card, the period counts from the last note", async () => {
    const id = await givenYearlyContactWithOldNote();

    const result = await updateContactFrequency(id, "month");

    expect(result.ok).toBe(true);
    expect(await dueNames()).toEqual(["Анна"]);
  });

  it("Частоту убрали: the contact leaves «Пора связаться»", async () => {
    const id = await givenContact("Анна", {
      contactFrequency: "month",
      contactFrequencySetAt: new Date("2020-01-01T00:00:00Z"),
    });
    expect(await dueNames()).toEqual(["Анна"]);

    const result = await updateContact(id, form({ contactFrequency: "" }));

    expect(result.ok).toBe(true);
    const [saved] = await db.select().from(contacts).where(eq(contacts.id, id));
    expect(saved.contactFrequency).toBeNull();
    expect(await dueNames()).toEqual([]);
  });
});
