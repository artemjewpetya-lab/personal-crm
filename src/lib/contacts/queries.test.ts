import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { contacts } from "@/db/schema";

import { givenContact, givenGroup, givenMembership, givenUser } from "../../../test/factories";

import { listContacts, listDueContacts } from "./queries";

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
});
