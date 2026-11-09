"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { isForeignKeyViolation, isUniqueViolation } from "@/db/errors";
import { contactGroups, groups } from "@/db/schema";
import { CONTACT_NOT_FOUND, DELETE_FAILED, SAVE_FAILED } from "@/lib/contacts/messages";
import { contactIdSchema, type ActionResult } from "@/lib/contacts/validation";
import { GROUP_NOT_FOUND, groupAlreadyExists } from "@/lib/groups/messages";
import { findOrCreateGroup } from "@/lib/groups/mutations";
import { normalizedGroupName } from "@/lib/groups/sql";
import { groupIdSchema, groupNameSchema } from "@/lib/groups/validation";

type GroupFieldName = "name";

/**
 * A group shows up in every contact card and in the filter, so after a change
 * the whole app is refreshed, not a single page.
 */
function revalidateGroups() {
  revalidatePath("/", "layout");
}

/** The group that already has this name (letter case and «ё» ignored), spelled as it is saved. */
async function findGroupWithName(name: string, exceptId?: string): Promise<string | undefined> {
  const [existing] = await db
    .select({ name: groups.name })
    .from(groups)
    .where(
      and(
        eq(normalizedGroupName(groups.name), normalizedGroupName(name)),
        exceptId ? ne(groups.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return existing?.name;
}

export async function createGroup(
  name: string,
): Promise<ActionResult<{ id: string; name: string }, GroupFieldName>> {
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, fieldErrors: { name: parsed.error.issues[0].message } };
  }

  try {
    // The unique index decides: of two simultaneous requests only one inserts.
    const [created] = await db
      .insert(groups)
      .values({ name: parsed.data })
      .onConflictDoNothing()
      .returning({ id: groups.id, name: groups.name });

    if (!created) {
      const existingName = await findGroupWithName(parsed.data);
      return existingName
        ? { ok: false, fieldErrors: { name: groupAlreadyExists(existingName) } }
        : { ok: false, formError: SAVE_FAILED };
    }

    revalidateGroups();
    return { ok: true, data: created };
  } catch (error) {
    console.error("Failed to create group", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}

export async function renameGroup(
  id: string,
  name: string,
): Promise<ActionResult<{ id: string }, GroupFieldName>> {
  if (!groupIdSchema.safeParse(id).success) {
    return { ok: false, formError: GROUP_NOT_FOUND };
  }

  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, fieldErrors: { name: parsed.error.issues[0].message } };
  }

  try {
    const [renamed] = await db
      .update(groups)
      .set({ name: parsed.data, updatedAt: sql`now()` })
      .where(eq(groups.id, id))
      .returning({ id: groups.id });

    if (!renamed) return { ok: false, formError: GROUP_NOT_FOUND };

    revalidateGroups();
    return { ok: true, data: renamed };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existingName = await findGroupWithName(parsed.data, id).catch(() => undefined);
      if (existingName) {
        return { ok: false, fieldErrors: { name: groupAlreadyExists(existingName) } };
      }
    }
    console.error("Failed to rename group", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}

// Only the group and its links go; the contacts, their notes and other groups stay
// (the links are deleted with the group, on delete cascade).
export async function deleteGroup(id: string): Promise<ActionResult<{ name: string }>> {
  if (!groupIdSchema.safeParse(id).success) {
    return { ok: false, formError: GROUP_NOT_FOUND };
  }

  try {
    const [deleted] = await db
      .delete(groups)
      .where(eq(groups.id, id))
      .returning({ name: groups.name });

    if (!deleted) return { ok: false, formError: GROUP_NOT_FOUND };

    revalidateGroups();
    return { ok: true, data: deleted };
  } catch (error) {
    console.error("Failed to delete group", error);
    return { ok: false, formError: DELETE_FAILED };
  }
}

/** Screens that show a contact's groups: the list, the groups page and the card itself. */
function revalidateContactGroups(contactId: string) {
  revalidatePath("/");
  revalidatePath("/groups");
  revalidatePath(`/contacts/${contactId}`);
}

// One mark in the contact card adds ONE group (not the whole set), so two quick
// marks cannot overwrite each other.
export async function addContactToGroup(
  contactId: string,
  groupId: string,
): Promise<ActionResult<null>> {
  if (!contactIdSchema.safeParse(contactId).success) {
    return { ok: false, formError: CONTACT_NOT_FOUND };
  }
  if (!groupIdSchema.safeParse(groupId).success) {
    return { ok: false, formError: GROUP_NOT_FOUND };
  }

  try {
    await db.insert(contactGroups).values({ contactId, groupId }).onConflictDoNothing();

    revalidateContactGroups(contactId);
    return { ok: true, data: null };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      // Either the group or the contact was deleted in another tab. Nothing is created.
      const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId));
      return { ok: false, formError: group ? CONTACT_NOT_FOUND : GROUP_NOT_FOUND };
    }
    console.error("Failed to add contact to group", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}

export async function removeContactFromGroup(
  contactId: string,
  groupId: string,
): Promise<ActionResult<null>> {
  if (!contactIdSchema.safeParse(contactId).success) {
    return { ok: false, formError: CONTACT_NOT_FOUND };
  }
  if (!groupIdSchema.safeParse(groupId).success) {
    return { ok: false, formError: GROUP_NOT_FOUND };
  }

  try {
    await db
      .delete(contactGroups)
      .where(and(eq(contactGroups.contactId, contactId), eq(contactGroups.groupId, groupId)));

    revalidateContactGroups(contactId);
    return { ok: true, data: null };
  } catch (error) {
    console.error("Failed to remove contact from group", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}

/**
 * «Создать группу «…»» in the contact card: finds the group with this name or
 * creates it, and puts the contact in. If the name is taken, the existing group is used.
 */
export async function createGroupForContact(
  contactId: string,
  name: string,
): Promise<ActionResult<{ id: string; name: string }, GroupFieldName>> {
  if (!contactIdSchema.safeParse(contactId).success) {
    return { ok: false, formError: CONTACT_NOT_FOUND };
  }

  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, fieldErrors: { name: parsed.error.issues[0].message } };
  }

  try {
    const group = await db.transaction(async (tx) => {
      const found = await findOrCreateGroup(tx, parsed.data);

      // A deleted contact fails here, and the transaction takes the new group back with it.
      await tx.insert(contactGroups).values({ contactId, groupId: found.id }).onConflictDoNothing();
      return found;
    });

    revalidateContactGroups(contactId);
    return { ok: true, data: group };
  } catch (error) {
    if (isForeignKeyViolation(error)) return { ok: false, formError: CONTACT_NOT_FOUND };
    console.error("Failed to create group for contact", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}
