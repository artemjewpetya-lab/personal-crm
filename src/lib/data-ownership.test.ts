import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { notes } from "@/db/schema";
import {
  countContacts,
  getContact,
  listContacts,
  listDueContacts,
  listNotes,
} from "@/lib/contacts/queries";
import { resolveGroupFilter } from "@/lib/groups/filter";
import { listContactGroups, listGroups } from "@/lib/groups/queries";

import {
  givenContact,
  givenGroup,
  givenMembership,
  givenNote,
  givenUser,
} from "../../test/factories";

// What a person sees: only their own records. Two users, A and B, in one database.

let a: string;
let b: string;

beforeEach(async () => {
  a = await givenUser("a@example.com");
  b = await givenUser("b@example.com");
});

const names = (rows: { name: string }[]) => rows.map((row) => row.name);

describe("Пользователь видит только своё", () => {
  it("Счётчик и поиск", async () => {
    await givenContact(a, "Анна");
    await givenContact(a, "Борис");
    await givenContact(a, "Вера Первая");
    await givenContact(b, "Вера");

    expect(await countContacts(b)).toBe(1);
    expect(await countContacts(a)).toBe(3);
    expect(names(await listContacts(b, ""))).toEqual(["Вера"]);
    // Search finds only B's own "Вера", not A's "Вера Первая"
    expect(names(await listContacts(b, "Вера"))).toEqual(["Вера"]);
    expect(names(await listContacts(a, "Вера"))).toEqual(["Вера Первая"]);
  });

  it("Пора связаться", async () => {
    const longAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const dueContact = await givenContact(a, "Давно не общались", {
      contactFrequency: "week",
      contactFrequencySetAt: longAgo,
    });
    await db
      .insert(notes)
      .values({ contactId: dueContact, body: "Созвонились", createdAt: longAgo });

    expect(names(await listDueContacts(a))).toEqual(["Давно не общались"]);
    expect(await listDueContacts(b)).toEqual([]);
  });

  it("Группы", async () => {
    const tennis = await givenGroup(a, "Теннис");
    const oleg = await givenContact(a, "Олег");
    const pavel = await givenContact(a, "Павел");
    await givenMembership(oleg, tennis);
    await givenMembership(pavel, tennis);
    const ownGroup = await givenGroup(b, "Друзья");
    const bContact = await givenContact(b, "Вера");
    await givenMembership(bContact, ownGroup);

    // The page "Группы" and the groups in the filter, the form and the card
    expect(await listGroups(b)).toEqual([{ id: ownGroup, name: "Друзья", contactCount: 1 }]);
    expect(names(await listContactGroups(b, bContact))).toEqual(["Друзья"]);
    // A's contact has A's groups, but B cannot read them through its id
    expect(await listContactGroups(b, oleg)).toEqual([]);
    expect(await listGroups(a)).toEqual([{ id: tennis, name: "Теннис", contactCount: 2 }]);
    // B's list of contacts shows only B's groups under the names
    const [veraRow] = await listContacts(b, "");
    expect(names(veraRow.groups)).toEqual(["Друзья"]);
  });

  it("Чужая группа в адресе", async () => {
    const tennis = await givenGroup(a, "Теннис");
    const oleg = await givenContact(a, "Олег");
    await givenMembership(oleg, tennis);
    await givenContact(b, "Вера");
    await givenContact(b, "Игорь");

    // B opens the main page with A's group in the address
    const groupsOfB = await listGroups(b);
    expect(resolveGroupFilter(tennis, groupsOfB)).toBeNull();
    // ... and the list is B's whole list, as for a group that was deleted
    expect(names(await listContacts(b, "", tennis))).toEqual(["Вера", "Игорь"]);
    expect(names(await listContacts(b, "", null))).toEqual(["Вера", "Игорь"]);
  });

  it("Прямая ссылка на чужой контакт", async () => {
    const vera = await givenContact(a, "Вера");
    await givenNote(vera, "Договорились о встрече");

    // A reads their own contact ...
    expect(await getContact(a, vera)).toMatchObject({ id: vera, name: "Вера" });
    expect(names((await listNotes(a, vera)).map((note) => ({ name: note.body })))).toEqual([
      "Договорились о встрече",
    ]);
    // ... and for B it is as if there were none
    expect(await getContact(b, vera)).toBeNull();
    expect(await listNotes(b, vera)).toEqual([]);
  });
});
