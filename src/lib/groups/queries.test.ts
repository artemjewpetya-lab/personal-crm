import { beforeEach, describe, expect, it } from "vitest";

import { givenContact, givenGroup, givenMembership, givenUser } from "../../../test/factories";

import { listContactGroups, listGroups } from "./queries";

// Every test has one user who owns what the test creates.
let ownerId: string;

beforeEach(async () => {
  ownerId = await givenUser("owner@example.com");
});

describe("listGroups", () => {
  it("Список групп", async () => {
    const tennis = await givenGroup(ownerId, "Теннис");
    const friends = await givenGroup(ownerId, "Друзья");
    await givenGroup(ownerId, "Семья");
    const anna = await givenContact(ownerId, "Анна");
    const boris = await givenContact(ownerId, "Борис");
    await givenMembership(anna, tennis);
    await givenMembership(boris, tennis);
    await givenMembership(anna, friends);

    const result = await listGroups(ownerId);

    expect(result.map(({ name, contactCount }) => ({ name, contactCount }))).toEqual([
      { name: "Друзья", contactCount: 1 },
      { name: "Семья", contactCount: 0 },
      { name: "Теннис", contactCount: 2 },
    ]);
  });

  it("sorts by name ignoring letter case and treating «ё» as «е»", async () => {
    await givenGroup(ownerId, "яхты");
    await givenGroup(ownerId, "Ёлка");
    await givenGroup(ownerId, "Друзья");

    const result = await listGroups(ownerId);

    expect(result.map((group) => group.name)).toEqual(["Друзья", "Ёлка", "яхты"]);
  });

  it("Групп нет", async () => {
    expect(await listGroups(ownerId)).toEqual([]);
  });
});

describe("listContactGroups", () => {
  it("Несколько групп", async () => {
    const friends = await givenGroup(ownerId, "Друзья");
    const tennis = await givenGroup(ownerId, "Теннис");
    const anna = await givenContact(ownerId, "Анна");
    await givenMembership(anna, tennis);
    await givenMembership(anna, friends);

    expect(await listContactGroups(ownerId, anna)).toEqual([
      { id: friends, name: "Друзья" },
      { id: tennis, name: "Теннис" },
    ]);
  });

  it("Контакт в группах", async () => {
    const tennis = await givenGroup(ownerId, "Теннис");
    const colleagues = await givenGroup(ownerId, "Коллеги");
    await givenGroup(ownerId, "Семья");
    const anna = await givenContact(ownerId, "Анна");
    await givenMembership(anna, tennis);
    await givenMembership(anna, colleagues);

    const result = await listContactGroups(ownerId, anna);

    expect(result.map((group) => group.name)).toEqual(["Коллеги", "Теннис"]);
  });

  it("Контакт без групп", async () => {
    await givenGroup(ownerId, "Семья");
    const boris = await givenContact(ownerId, "Борис");

    expect(await listContactGroups(ownerId, boris)).toEqual([]);
  });

  it("returns nothing for a wrong id", async () => {
    expect(await listContactGroups(ownerId, "not-an-id")).toEqual([]);
  });
});
