import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db/client";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import { CONTACT_NOT_FOUND, UNDO_CONTACTED_FAILED } from "@/lib/contacts/messages";
import { GROUP_NOT_FOUND } from "@/lib/groups/messages";
import { listContactGroups, listGroups } from "@/lib/groups/queries";

import { actAs, type TestUser } from "../../test/current-user";
import {
  givenContact,
  givenGroup,
  givenMembership,
  givenNote,
  givenUser,
} from "../../test/factories";

import {
  addNote,
  createContact,
  deleteContact,
  markContacted,
  undoMarkContacted,
  updateContact,
  updateContactFrequency,
} from "./contacts/actions";
import {
  addContactToGroup,
  createGroup,
  createGroupForContact,
  deleteGroup,
  removeContactFromGroup,
  renameGroup,
} from "./groups/actions";

// The actions run as the signed-in user; the test chooses who that is (test/current-user.ts).
vi.mock("@/lib/auth/current-user", () => import("../../test/current-user"));

// Two users in one database. Every action runs as A or as B.
let a: TestUser;
let b: TestUser;

beforeEach(async () => {
  a = { id: await givenUser("a@example.com"), email: "a@example.com" };
  b = { id: await givenUser("b@example.com"), email: "b@example.com" };
});

function form(overrides: Record<string, unknown> = {}) {
  return {
    name: "Вера",
    about: "",
    howWeMet: "",
    phone: "",
    email: "",
    contactFrequency: "",
    ...overrides,
  };
}

async function contactRows() {
  return db.select().from(contacts).orderBy(contacts.name);
}

describe("У каждой записи есть владелец", () => {
  it("Новый контакт", async () => {
    actAs(a);

    const created = await createContact(form({ newGroupNames: ["Теннис"] }));
    if (!created.ok) throw new Error("The contact was not created");
    const note = await addNote(created.data.id, { body: "Договорились о встрече" });

    expect(note.ok).toBe(true);
    const [contact] = await contactRows();
    expect(contact).toMatchObject({ name: "Вера", userId: a.id });
    // The note belongs to the contact, so to A; the group is A's
    expect(await db.select().from(notes).where(eq(notes.contactId, contact.id))).toHaveLength(1);
    const [tennis] = await db.select().from(groups);
    expect(tennis).toMatchObject({ name: "Теннис", userId: a.id });
  });
});

describe("Чужое нельзя изменить прямым запросом", () => {
  it("Чужой контакт", async () => {
    const vera = await givenContact(a.id, "Вера", { about: "Соседка" });
    await givenNote(vera, "Договорились о встрече");
    const [contactedNote] = await db
      .insert(notes)
      .values({ contactId: vera, body: "Связались" })
      .returning({ id: notes.id });
    const before = { contacts: await contactRows(), notes: await db.select().from(notes) };

    // B tries every action with the number of A's contact
    actAs(b);
    expect(await updateContact(vera, form({ name: "Взломана" }))).toEqual({
      ok: false,
      formError: CONTACT_NOT_FOUND,
    });
    expect(await updateContactFrequency(vera, "week")).toEqual({
      ok: false,
      formError: CONTACT_NOT_FOUND,
    });
    expect(await addNote(vera, { body: "Чужая заметка" })).toEqual({
      ok: false,
      formError: CONTACT_NOT_FOUND,
    });
    expect(await markContacted(vera)).toEqual({ ok: false, formError: CONTACT_NOT_FOUND });
    // Undo answers the way it does for a contact that does not exist at all
    const missing = await undoMarkContacted(
      "7d1b6a52-4c53-4a56-9d0c-3a4b1f6d2e10",
      contactedNote.id,
    );
    expect(missing).toEqual({ ok: false, formError: UNDO_CONTACTED_FAILED });
    expect(await undoMarkContacted(vera, contactedNote.id)).toEqual(missing);
    expect(await deleteContact(vera)).toEqual({ ok: false, formError: CONTACT_NOT_FOUND });

    // Nothing of A's has changed
    expect({ contacts: await contactRows(), notes: await db.select().from(notes) }).toEqual(before);
  });

  it("Чужая группа", async () => {
    const tennis = await givenGroup(a.id, "Теннис");
    const before = await db.select().from(groups);

    actAs(b);
    expect(await renameGroup(tennis, "Большой теннис")).toEqual({
      ok: false,
      formError: GROUP_NOT_FOUND,
    });
    expect(await deleteGroup(tennis)).toEqual({ ok: false, formError: GROUP_NOT_FOUND });

    expect(await db.select().from(groups)).toEqual(before);
  });

  it("Свой контакт в чужую группу", async () => {
    const tennis = await givenGroup(a.id, "Теннис");
    const oleg = await givenContact(b.id, "Олег");

    actAs(b);
    expect(await addContactToGroup(oleg, tennis)).toEqual({
      ok: false,
      formError: GROUP_NOT_FOUND,
    });

    expect(await db.select().from(contactGroups)).toEqual([]);
  });

  it("Чужой контакт в свою группу", async () => {
    const vera = await givenContact(a.id, "Вера");
    const friends = await givenGroup(b.id, "Друзья");

    actAs(b);
    expect(await addContactToGroup(vera, friends)).toEqual({
      ok: false,
      formError: CONTACT_NOT_FOUND,
    });
    // ... or a new group made for her
    expect(await createGroupForContact(vera, "Новая")).toEqual({
      ok: false,
      formError: CONTACT_NOT_FOUND,
    });

    expect(await db.select().from(contactGroups)).toEqual([]);
    expect((await listGroups(b.id)).map((group) => group.name)).toEqual(["Друзья"]);
  });

  it("Чужую связь нельзя разорвать", async () => {
    const tennis = await givenGroup(a.id, "Теннис");
    const oleg = await givenContact(a.id, "Олег");
    await givenMembership(oleg, tennis);

    actAs(b);
    await removeContactFromGroup(oleg, tennis);

    expect(await db.select().from(contactGroups)).toHaveLength(1);
  });

  it("Чужая группа в форме контакта", async () => {
    const tennis = await givenGroup(a.id, "Теннис");
    const oleg = await givenContact(b.id, "Олег");

    actAs(b);
    // A new contact and a saved one, each with A's group in the form
    const created = await createContact(form({ name: "Игорь", groupIds: [tennis] }));
    const updated = await updateContact(oleg, form({ name: "Олег", groupIds: [tennis] }));

    // Saved, but without that group, as with a group that was deleted
    expect(created.ok).toBe(true);
    expect(updated.ok).toBe(true);
    expect(await db.select().from(contactGroups)).toEqual([]);
    expect(await listContactGroups(b.id, oleg)).toEqual([]);
  });
});

describe("Одинаковые названия у разных пользователей", () => {
  it("на странице «Группы»", async () => {
    const tennis = await givenGroup(a.id, "Теннис");

    actAs(b);
    const result = await createGroup("теннис");

    expect(result).toMatchObject({ ok: true, data: { name: "теннис" } });
    expect((await listGroups(a.id)).map((group) => group.name)).toEqual(["Теннис"]);
    expect((await listGroups(b.id)).map((group) => group.name)).toEqual(["теннис"]);
    // A's group did not change and got no contacts
    expect(await listGroups(a.id)).toEqual([{ id: tennis, name: "Теннис", contactCount: 0 }]);
  });

  it("в карточке контакта", async () => {
    const tennis = await givenGroup(a.id, "Теннис");
    const oleg = await givenContact(b.id, "Олег");

    actAs(b);
    const result = await createGroupForContact(oleg, "теннис");

    expect(result).toMatchObject({ ok: true, data: { name: "теннис" } });
    expect((await listContactGroups(b.id, oleg)).map((group) => group.name)).toEqual(["теннис"]);
    expect(await db.select().from(contactGroups).where(eq(contactGroups.groupId, tennis))).toEqual(
      [],
    );
  });

  it("в форме контакта", async () => {
    const tennis = await givenGroup(a.id, "Теннис");

    actAs(b);
    const result = await createContact(form({ name: "Олег", newGroupNames: ["теннис"] }));

    expect(result.ok).toBe(true);
    expect((await listGroups(b.id)).map((group) => group.name)).toEqual(["теннис"]);
    expect(await listGroups(a.id)).toEqual([{ id: tennis, name: "Теннис", contactCount: 0 }]);
  });
});
