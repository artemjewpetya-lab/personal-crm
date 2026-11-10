"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { isForeignKeyViolation, isUniqueViolation } from "@/db/errors";
import { contactGroups, contacts, groups } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CONTACT_NOT_FOUND, DELETE_FAILED, SAVE_FAILED } from "@/lib/contacts/messages";
import { contactIdSchema, type ActionResult } from "@/lib/contacts/validation";
import { GROUP_NOT_FOUND, groupAlreadyExists } from "@/lib/groups/messages";
import { findOrCreateGroup } from "@/lib/groups/mutations";
import { normalizedGroupName } from "@/lib/groups/sql";
import { groupIdSchema, groupNameSchema } from "@/lib/groups/validation";

type GroupFieldName = "name";

async function ownsContact(userId: string, contactId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));
  return Boolean(row);
}

async function ownsGroup(userId: string, groupId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.userId, userId)));
  return Boolean(row);
}

/**
 * A group shows up in every contact card and in the filter, so after a change
 * the whole app is refreshed, not a single page.
 */
function revalidateGroups() {
  revalidatePath("/", "layout");
}

/**
 * The group of this user that already has this name (letter case and «ё» ignored), spelled as
 * it is saved. Other users' groups do not count.
 */
async function findGroupWithName(
  userId: string,
  name: string,
  exceptId?: string,
): Promise<string | undefined> {
  const [existing] = await db
    .select({ name: groups.name })
    .from(groups)
    .where(
      and(
        eq(groups.userId, userId),
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

  // Outside the try on purpose: without a sign-in this redirects to the sign-in page.
  const user = await getCurrentUser();

  try {
    // The unique index decides: of two simultaneous requests only one inserts.
    const [created] = await db
      .insert(groups)
      .values({ userId: user.id, name: parsed.data })
      .onConflictDoNothing()
      .returning({ id: groups.id, name: groups.name });

    if (!created) {
      const existingName = await findGroupWithName(user.id, parsed.data);
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

  const user = await getCurrentUser();

  try {
    const [renamed] = await db
      .update(groups)
      .set({ name: parsed.data, updatedAt: sql`now()` })
      .where(and(eq(groups.id, id), eq(groups.userId, user.id)))
      .returning({ id: groups.id });

    if (!renamed) return { ok: false, formError: GROUP_NOT_FOUND };

    revalidateGroups();
    return { ok: true, data: renamed };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existingName = await findGroupWithName(user.id, parsed.data, id).catch(() => undefined);
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

  const user = await getCurrentUser();

  try {
    const [deleted] = await db
      .delete(groups)
      .where(and(eq(groups.id, id), eq(groups.userId, user.id)))
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

  const user = await getCurrentUser();

  try {
    // Both must be the user's own; somebody else's is the same as a deleted one.
    if (!(await ownsContact(user.id, contactId))) {
      return { ok: false, formError: CONTACT_NOT_FOUND };
    }
    if (!(await ownsGroup(user.id, groupId))) {
      return { ok: false, formError: GROUP_NOT_FOUND };
    }

    await db.insert(contactGroups).values({ contactId, groupId }).onConflictDoNothing();

    revalidateContactGroups(contactId);
    return { ok: true, data: null };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      // Either the group or the contact was deleted in another tab. Nothing is created.
      const group = await ownsGroup(user.id, groupId);
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

  const user = await getCurrentUser();

  try {
    // Only a link between the user's own contact and group can be removed.
    await db
      .delete(contactGroups)
      .where(
        and(
          eq(contactGroups.contactId, contactId),
          eq(contactGroups.groupId, groupId),
          sql`${contactGroups.contactId} in (select ${contacts.id} from ${contacts} where ${contacts.userId} = ${user.id})`,
          sql`${contactGroups.groupId} in (select ${groups.id} from ${groups} where ${groups.userId} = ${user.id})`,
        ),
      );

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

  const user = await getCurrentUser();

  try {
    // Somebody else's contact is the same as a deleted one: no group is created for it.
    if (!(await ownsContact(user.id, contactId))) {
      return { ok: false, formError: CONTACT_NOT_FOUND };
    }

    const group = await db.transaction(async (tx) => {
      const found = await findOrCreateGroup(tx, user.id, parsed.data);

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
