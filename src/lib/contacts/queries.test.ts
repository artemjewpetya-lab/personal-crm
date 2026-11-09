import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { contacts } from "@/db/schema";

import { ago, givenContact, givenGroup, givenMembership, givenNote } from "../../../test/factories";

import { listContacts, listDueContacts } from "./queries";

const names = (items: { name: string }[]) => items.map((item) => item.name);

describe("listContacts", () => {
  it("returns an empty list on an empty database", async () => {
    expect(await listContacts("")).toEqual([]);
  });

  it("Контакт в группах", async () => {
    const tennis = await givenGroup("Теннис");
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, tennis);
    await givenMembership(anna, friends);

    const [item] = await listContacts("");

    expect(item.groups).toEqual([
      { id: friends, name: "Друзья" },
      { id: tennis, name: "Теннис" },
    ]);
  });

  it("Контакт без групп", async () => {
    await givenContact("Борис");

    const [item] = await listContacts("");

    expect(item.groups).toEqual([]);
  });

  it("Выбрать группу", async () => {
    const family = await givenGroup("Семья");
    const vera = await givenContact("Вера");
    const anna = await givenContact("Анна");
    await givenContact("Борис");
    await givenMembership(vera, family);
    await givenMembership(anna, family);

    const result = await listContacts("", family);

    expect(names(result)).toEqual(["Анна", "Вера"]);
  });

  it("shows all groups of a contact while the list is filtered by one of them", async () => {
    const family = await givenGroup("Семья");
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, family);
    await givenMembership(anna, friends);

    const [item] = await listContacts("", family);

    expect(item.groups.map((group) => group.name)).toEqual(["Друзья", "Семья"]);
  });

  it("Фильтр и поиск вместе", async () => {
    const friends = await givenGroup("Друзья");
    const smirnova = await givenContact("Анна Смирнова");
    const petrov = await givenContact("Борис Петров");
    await givenContact("Анна Иванова");
    await givenMembership(smirnova, friends);
    await givenMembership(petrov, friends);

    const result = await listContacts("Анна", friends);

    expect(names(result)).toEqual(["Анна Смирнова"]);
  });

  it("Все группы", async () => {
    const family = await givenGroup("Семья");
    const anna = await givenContact("Анна");
    await givenContact("Борис");
    await givenMembership(anna, family);

    expect(names(await listContacts(""))).toEqual(["Анна", "Борис"]);
    expect(names(await listContacts("", null))).toEqual(["Анна", "Борис"]);
  });

  it("В группе никого", async () => {
    const tennis = await givenGroup("Теннис");
    await givenContact("Анна");

    expect(await listContacts("", tennis)).toEqual([]);
  });

  it("Группу из адреса удалили: a group that does not exist filters nothing", async () => {
    await givenContact("Анна");
    await givenContact("Борис");

    const result = await listContacts("", "7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10");

    expect(names(result)).toEqual(["Анна", "Борис"]);
  });

  it("lists a contact once even when it is in several groups", async () => {
    const family = await givenGroup("Семья");
    const friends = await givenGroup("Друзья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, family);
    await givenMembership(anna, friends);

    expect(await listContacts("")).toHaveLength(1);
  });
});

describe("listDueContacts", () => {
  it("Пора связаться не меняется", async () => {
    const family = await givenGroup("Семья");
    await givenContact("Аня", {
      contactFrequency: "week",
      contactFrequencySetAt: new Date("2020-01-01T00:00:00Z"),
    });
    const vera = await givenContact("Вера");
    await givenMembership(vera, family);

    const due = await listDueContacts();

    expect(names(due)).toEqual(["Аня"]);
    expect(await db.select().from(contacts)).toHaveLength(2);
  });

  it("Срок ещё не прошёл: an hour before the period runs out the contact is not due", async () => {
    // An hour past the week: due. An hour short of it: not yet.
    const hourPast = await givenContact("Аня", { contactFrequency: "week" });
    await givenNote(hourPast, "Созвонились", ago("7 days 1 hour"));
    const hourShort = await givenContact("Борис", { contactFrequency: "week" });
    await givenNote(hourShort, "Созвонились", ago("6 days 23 hours"));

    expect(names(await listDueContacts())).toEqual(["Аня"]);
  });

  it("Пора связаться не с кем", async () => {
    const recent = await givenContact("Аня", { contactFrequency: "week" });
    await givenNote(recent, "Созвонились", ago("6 days"));
    await givenContact("Борис", { contactFrequency: "month", contactFrequencySetAt: new Date() });
    const notSet = await givenContact("Вера");
    await givenNote(notSet, "Давняя заметка", new Date("2020-01-01T00:00:00Z"));

    expect(await listDueContacts()).toEqual([]);
  });

  it("puts contacts whose period ran out at the same moment by name", async () => {
    const setAt = new Date("2020-01-01T00:00:00Z");
    await givenContact("Вера", { contactFrequency: "week", contactFrequencySetAt: setAt });
    await givenContact("Аня", { contactFrequency: "week", contactFrequencySetAt: setAt });
    await givenContact("Борис", { contactFrequency: "week", contactFrequencySetAt: setAt });

    expect(names(await listDueContacts())).toEqual(["Аня", "Борис", "Вера"]);
  });

  it("Список контактов не меняется", async () => {
    await givenContact("Анна");
    await givenContact("Борис", {
      contactFrequency: "week",
      contactFrequencySetAt: new Date("2020-01-01T00:00:00Z"),
    });
    await givenContact("Вера");

    expect(names(await listDueContacts())).toEqual(["Борис"]);
    expect(names(await listContacts(""))).toEqual(["Анна", "Борис", "Вера"]);
  });
});
