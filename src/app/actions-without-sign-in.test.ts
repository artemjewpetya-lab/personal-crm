import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { contactGroups, contacts, groups, notes, users } from "@/db/schema";

import { setRequestHeaders } from "../../test/request-context";
import {
  givenContact,
  givenGroup,
  givenMembership,
  givenNote,
  givenUser,
} from "../../test/factories";

import * as contactActions from "./contacts/actions";
import * as groupActions from "./groups/actions";

// No mock here: the real getCurrentUser reads the request, and the request has no sign-in cookie.

const form = {
  name: "Вера",
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
  contactFrequency: "",
};

async function everything() {
  return {
    users: await db.select().from(users),
    contacts: await db.select().from(contacts),
    notes: await db.select().from(notes),
    groups: await db.select().from(groups),
    links: await db.select().from(contactGroups),
  };
}

describe("Запрос к серверу без входа", () => {
  let contactId: string;
  let groupId: string;
  let noteId: string;

  beforeEach(async () => {
    setRequestHeaders({});
    const owner = await givenUser("owner@example.com");
    contactId = await givenContact(owner, "Вера");
    groupId = await givenGroup(owner, "Теннис");
    await givenMembership(contactId, groupId);
    await givenNote(contactId, "Связались");
    [{ id: noteId }] = await db.select({ id: notes.id }).from(notes);
  });

  // Every action that the app has. A new one must be added here: the check below fails otherwise.
  const calls: Record<string, () => Promise<unknown>> = {
    createContact: () => contactActions.createContact(form),
    updateContact: () => contactActions.updateContact(contactId, form),
    updateContactFrequency: () => contactActions.updateContactFrequency(contactId, "week"),
    deleteContact: () => contactActions.deleteContact(contactId),
    addNote: () => contactActions.addNote(contactId, { body: "Чужая заметка" }),
    markContacted: () => contactActions.markContacted(contactId),
    undoMarkContacted: () => contactActions.undoMarkContacted(contactId, noteId),
    createGroup: () => groupActions.createGroup("Аналитики"),
    renameGroup: () => groupActions.renameGroup(groupId, "Другое"),
    deleteGroup: () => groupActions.deleteGroup(groupId),
    addContactToGroup: () => groupActions.addContactToGroup(contactId, groupId),
    removeContactFromGroup: () => groupActions.removeContactFromGroup(contactId, groupId),
    createGroupForContact: () => groupActions.createGroupForContact(contactId, "Новая"),
  };

  it("lists every server action of the app", () => {
    const exported = [...Object.keys(contactActions), ...Object.keys(groupActions)].sort();
    expect(Object.keys(calls).sort()).toEqual(exported);
  });

  it("ничего не меняет и никому не отдаёт", async () => {
    const before = await everything();

    for (const [name, call] of Object.entries(calls)) {
      // The person is sent to the sign-in page: the action stops with a redirect
      const failure = await call().then(
        () => null,
        (error: { digest?: string }) => error,
      );
      expect(failure?.digest, name).toMatch(/^NEXT_REDIRECT;[^;]*;\/login;/);
    }

    expect(await everything()).toEqual(before);
  });
});
