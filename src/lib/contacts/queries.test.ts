import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { contacts } from "@/db/schema";

import {
  ago,
  givenContact,
  givenGroup,
  givenMembership,
  givenNote,
  givenUser,
} from "../../../test/factories";

import { upcomingBirthdays } from "./birthdays";
import { listContactBirthdays, listContacts, listDueContacts } from "./queries";

const names = (items: { name: string }[]) => items.map((item) => item.name);

// Every test has one user who owns what the test creates.
let ownerId: string;

beforeEach(async () => {
  ownerId = await givenUser("owner@example.com");
});

describe("listContacts", () => {
  it("returns an empty list on an empty database", async () => {
    expect(await listContacts(ownerId, "")).toEqual([]);
  });

  it("Контакт в группах", async () => {
    const tennis = await givenGroup(ownerId, "Теннис");
    const friends = await givenGroup(ownerId, "Друзья");
    const anna = await givenContact(ownerId, "Анна");
    await givenMembership(anna, tennis);
    await givenMembership(anna, friends);

    const [item] = await listContacts(ownerId, "");

    expect(item.groups).toEqual([
      { id: friends, name: "Друзья" },
      { id: tennis, name: "Теннис" },
    ]);
  });

  it("Контакт без групп", async () => {
    await givenContact(ownerId, "Борис");

    const [item] = await listContacts(ownerId, "");

    expect(item.groups).toEqual([]);
  });

  it("Выбрать группу", async () => {
    const family = await givenGroup(ownerId, "Семья");
    const vera = await givenContact(ownerId, "Вера");
    const anna = await givenContact(ownerId, "Анна");
    await givenContact(ownerId, "Борис");
    await givenMembership(vera, family);
    await givenMembership(anna, family);

    const result = await listContacts(ownerId, "", family);

    expect(names(result)).toEqual(["Анна", "Вера"]);
  });

  it("shows all groups of a contact while the list is filtered by one of them", async () => {
    const family = await givenGroup(ownerId, "Семья");
    const friends = await givenGroup(ownerId, "Друзья");
    const anna = await givenContact(ownerId, "Анна");
    await givenMembership(anna, family);
    await givenMembership(anna, friends);

    const [item] = await listContacts(ownerId, "", family);

    expect(item.groups.map((group) => group.name)).toEqual(["Друзья", "Семья"]);
  });

  it("Фильтр и поиск вместе", async () => {
    const friends = await givenGroup(ownerId, "Друзья");
    const smirnova = await givenContact(ownerId, "Анна Смирнова");
    const petrov = await givenContact(ownerId, "Борис Петров");
    await givenContact(ownerId, "Анна Иванова");
    await givenMembership(smirnova, friends);
    await givenMembership(petrov, friends);

    const result = await listContacts(ownerId, "Анна", friends);

    expect(names(result)).toEqual(["Анна Смирнова"]);
  });

  it("Все группы", async () => {
    const family = await givenGroup(ownerId, "Семья");
    const anna = await givenContact(ownerId, "Анна");
    await givenContact(ownerId, "Борис");
    await givenMembership(anna, family);

    expect(names(await listContacts(ownerId, ""))).toEqual(["Анна", "Борис"]);
    expect(names(await listContacts(ownerId, "", null))).toEqual(["Анна", "Борис"]);
  });

  it("В группе никого", async () => {
    const tennis = await givenGroup(ownerId, "Теннис");
    await givenContact(ownerId, "Анна");

    expect(await listContacts(ownerId, "", tennis)).toEqual([]);
  });

  it("Группу из адреса удалили: a group that does not exist filters nothing", async () => {
    await givenContact(ownerId, "Анна");
    await givenContact(ownerId, "Борис");

    const result = await listContacts(ownerId, "", "7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10");

    expect(names(result)).toEqual(["Анна", "Борис"]);
  });

  it("lists a contact once even when it is in several groups", async () => {
    const family = await givenGroup(ownerId, "Семья");
    const friends = await givenGroup(ownerId, "Друзья");
    const anna = await givenContact(ownerId, "Анна");
    await givenMembership(anna, family);
    await givenMembership(anna, friends);

    expect(await listContacts(ownerId, "")).toHaveLength(1);
  });
});

describe("listDueContacts", () => {
  it("Пора связаться не меняется", async () => {
    const family = await givenGroup(ownerId, "Семья");
    await givenContact(ownerId, "Аня", {
      contactFrequency: "week",
      contactFrequencySetAt: new Date("2020-01-01T00:00:00Z"),
    });
    const vera = await givenContact(ownerId, "Вера");
    await givenMembership(vera, family);

    const due = await listDueContacts(ownerId);

    expect(names(due)).toEqual(["Аня"]);
    expect(await db.select().from(contacts)).toHaveLength(2);
  });

  it("Срок ещё не прошёл: an hour before the period runs out the contact is not due", async () => {
    // An hour past the week: due. An hour short of it: not yet.
    const hourPast = await givenContact(ownerId, "Аня", { contactFrequency: "week" });
    await givenNote(hourPast, "Созвонились", ago("7 days 1 hour"));
    const hourShort = await givenContact(ownerId, "Борис", { contactFrequency: "week" });
    await givenNote(hourShort, "Созвонились", ago("6 days 23 hours"));

    expect(names(await listDueContacts(ownerId))).toEqual(["Аня"]);
  });

  it("Пора связаться не с кем", async () => {
    const recent = await givenContact(ownerId, "Аня", { contactFrequency: "week" });
    await givenNote(recent, "Созвонились", ago("6 days"));
    await givenContact(ownerId, "Борис", {
      contactFrequency: "month",
      contactFrequencySetAt: new Date(),
    });
    const notSet = await givenContact(ownerId, "Вера");
    await givenNote(notSet, "Давняя заметка", new Date("2020-01-01T00:00:00Z"));

    expect(await listDueContacts(ownerId)).toEqual([]);
  });

  it("puts contacts whose period ran out at the same moment by name", async () => {
    const setAt = new Date("2020-01-01T00:00:00Z");
    await givenContact(ownerId, "Вера", { contactFrequency: "week", contactFrequencySetAt: setAt });
    await givenContact(ownerId, "Аня", { contactFrequency: "week", contactFrequencySetAt: setAt });
    await givenContact(ownerId, "Борис", {
      contactFrequency: "week",
      contactFrequencySetAt: setAt,
    });

    expect(names(await listDueContacts(ownerId))).toEqual(["Аня", "Борис", "Вера"]);
  });

  it("Список контактов не меняется", async () => {
    await givenContact(ownerId, "Анна");
    await givenContact(ownerId, "Борис", {
      contactFrequency: "week",
      contactFrequencySetAt: new Date("2020-01-01T00:00:00Z"),
    });
    await givenContact(ownerId, "Вера");

    expect(names(await listDueContacts(ownerId))).toEqual(["Борис"]);
    expect(names(await listContacts(ownerId, ""))).toEqual(["Анна", "Борис", "Вера"]);
  });
});

describe("listContactBirthdays", () => {
  const today = { year: 2026, month: 11, day: 16 };
  const birthday = (day: number, month: number, year: number | null = null) => ({
    birthDay: day,
    birthMonth: month,
    birthYear: year,
  });

  it("Порядок по близости", async () => {
    // By name: Аня, Борис, Вера; by closeness: Аня and Вера (18 Nov, by name), then Борис (20 Nov)
    await givenContact(ownerId, "Борис", birthday(20, 11));
    await givenContact(ownerId, "Вера", birthday(18, 11, 2000));
    await givenContact(ownerId, "Аня", birthday(18, 11));

    const soon = upcomingBirthdays(await listContactBirthdays(ownerId), today);

    expect(names(soon)).toEqual(["Аня", "Вера", "Борис"]);
    expect(soon.map((item) => item.daysUntil)).toEqual([2, 2, 4]);
    expect(soon[1].age).toBe(26);
  });

  it("Дней рождения скоро нет", async () => {
    await givenContact(ownerId, "Аня", birthday(1, 3));
    await givenContact(ownerId, "Борис", birthday(15, 11));

    expect(upcomingBirthdays(await listContactBirthdays(ownerId), today)).toEqual([]);
  });

  it("reads only what the block needs, and only contacts with a date", async () => {
    await givenContact(ownerId, "Аня", { ...birthday(20, 11, 1990), about: "Коллега" });
    await givenContact(ownerId, "Борис");

    const [anna, ...others] = await listContactBirthdays(ownerId);

    expect(others).toEqual([]);
    expect(anna).toEqual({
      id: expect.any(String),
      name: "Аня",
      birthDay: 20,
      birthMonth: 11,
      birthYear: 1990,
    });
  });
});
