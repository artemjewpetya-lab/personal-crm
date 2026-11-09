import { describe, expect, it } from "vitest";

import { givenContact, givenGroup, givenMembership } from "../../../test/factories";

import { listContactGroups, listGroups } from "./queries";

describe("listGroups", () => {
  it("Список групп", async () => {
    const tennis = await givenGroup("Теннис");
    const friends = await givenGroup("Друзья");
    await givenGroup("Семья");
    const anna = await givenContact("Анна");
    const boris = await givenContact("Борис");
    await givenMembership(anna, tennis);
    await givenMembership(boris, tennis);
    await givenMembership(anna, friends);

    const result = await listGroups();

    expect(result.map(({ name, contactCount }) => ({ name, contactCount }))).toEqual([
      { name: "Друзья", contactCount: 1 },
      { name: "Семья", contactCount: 0 },
      { name: "Теннис", contactCount: 2 },
    ]);
  });

  it("sorts by name ignoring letter case and treating «ё» as «е»", async () => {
    await givenGroup("яхты");
    await givenGroup("Ёлка");
    await givenGroup("Друзья");

    const result = await listGroups();

    expect(result.map((group) => group.name)).toEqual(["Друзья", "Ёлка", "яхты"]);
  });

  it("Групп нет", async () => {
    expect(await listGroups()).toEqual([]);
  });
});

describe("listContactGroups", () => {
  it("Несколько групп", async () => {
    const friends = await givenGroup("Друзья");
    const tennis = await givenGroup("Теннис");
    const anna = await givenContact("Анна");
    await givenMembership(anna, tennis);
    await givenMembership(anna, friends);

    expect(await listContactGroups(anna)).toEqual([
      { id: friends, name: "Друзья" },
      { id: tennis, name: "Теннис" },
    ]);
  });

  it("Контакт в группах", async () => {
    const tennis = await givenGroup("Теннис");
    const colleagues = await givenGroup("Коллеги");
    await givenGroup("Семья");
    const anna = await givenContact("Анна");
    await givenMembership(anna, tennis);
    await givenMembership(anna, colleagues);

    const result = await listContactGroups(anna);

    expect(result.map((group) => group.name)).toEqual(["Коллеги", "Теннис"]);
  });

  it("Контакт без групп", async () => {
    await givenGroup("Семья");
    const boris = await givenContact("Борис");

    expect(await listContactGroups(boris)).toEqual([]);
  });

  it("returns nothing for a wrong id", async () => {
    expect(await listContactGroups("not-an-id")).toEqual([]);
  });
});
