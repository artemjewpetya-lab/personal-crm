"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { contacts, notes } from "@/db/schema";
import { setContactGroups } from "@/lib/groups/mutations";
import type { ContactFrequency } from "@/lib/contacts/frequency";
import {
  CONTACT_NOT_FOUND,
  CONTACTED_NOTE_BODY,
  DELETE_FAILED,
  SAVE_FAILED,
  UNDO_CONTACTED_FAILED,
} from "@/lib/contacts/messages";
import {
  contactFieldErrors,
  contactIdSchema,
  contactInputSchema,
  firstFieldErrors,
  noteIdSchema,
  noteInputSchema,
  type ActionResult,
  type ContactFieldName,
  type ContactFormValues,
} from "@/lib/contacts/validation";

// Postgres error code for a foreign key violation.
const FOREIGN_KEY_VIOLATION = "23503";

function isForeignKeyViolation(error: unknown): boolean {
  const cause = error instanceof Error && "cause" in error ? error.cause : error;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === FOREIGN_KEY_VIOLATION
  );
}

/**
 * contact_frequency_set_at for an UPDATE that saves `frequency`. A contact
 * without notes is due counting from when the frequency was set, so move that
 * moment only when the frequency really changes. The old value is compared
 * inside the same UPDATE (SET sees the row before the change), so there is no
 * gap between reading and writing it.
 */
function frequencySetAtOnUpdate(frequency: ContactFrequency | null) {
  const newFrequency = sql`${frequency}::contact_frequency`;
  return sql`case
    when ${newFrequency} is null then null
    when ${contacts.contactFrequency} is not distinct from ${newFrequency}
      then ${contacts.contactFrequencySetAt}
    else now()
  end`;
}

export async function createContact(
  values: ContactFormValues,
): Promise<ActionResult<{ id: string; name: string }, ContactFieldName>> {
  const parsed = contactInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: contactFieldErrors(parsed.error) };
  }
  const { groupIds, newGroupNames, ...fields } = parsed.data;

  try {
    // The contact and its groups are saved together: all or nothing.
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contacts)
        .values({
          ...fields,
          contactFrequencySetAt: fields.contactFrequency ? sql`now()` : null,
        })
        .returning({ id: contacts.id, name: contacts.name });
      if (groupIds || newGroupNames) {
        await setContactGroups(tx, row.id, groupIds ?? [], newGroupNames ?? []);
      }
      return row;
    });

    revalidatePath("/");
    revalidatePath("/groups");
    return { ok: true, data: created };
  } catch (error) {
    console.error("Failed to create contact", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}

export async function updateContact(
  id: string,
  values: ContactFormValues,
): Promise<ActionResult<{ id: string }, ContactFieldName>> {
  if (!contactIdSchema.safeParse(id).success) {
    return { ok: false, formError: CONTACT_NOT_FOUND };
  }

  const parsed = contactInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: contactFieldErrors(parsed.error) };
  }
  const { groupIds, newGroupNames, ...fields } = parsed.data;

  try {
    // The contact and its groups are saved together: all or nothing.
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(contacts)
        .set({
          ...fields,
          contactFrequencySetAt: frequencySetAtOnUpdate(fields.contactFrequency),
          updatedAt: sql`now()`,
        })
        .where(eq(contacts.id, id))
        .returning({ id: contacts.id });
      // A deleted contact: no group is created for it.
      if (row && (groupIds || newGroupNames)) {
        await setContactGroups(tx, row.id, groupIds ?? [], newGroupNames ?? []);
      }
      return row;
    });

    if (!updated) return { ok: false, formError: CONTACT_NOT_FOUND };

    revalidatePath("/");
    revalidatePath("/groups");
    revalidatePath(`/contacts/${id}`);
    return { ok: true, data: updated };
  } catch (error) {
    console.error("Failed to update contact", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}

/** The frequency picker in the contact card: saves the choice right away. "" means "Не задано". */
export async function updateContactFrequency(
  contactId: string,
  frequency: string,
): Promise<ActionResult<null>> {
  if (!contactIdSchema.safeParse(contactId).success) {
    return { ok: false, formError: CONTACT_NOT_FOUND };
  }

  const parsed = contactInputSchema.shape.contactFrequency.safeParse(frequency);
  if (!parsed.success) {
    return { ok: false, formError: parsed.error.issues[0]?.message ?? SAVE_FAILED };
  }

  try {
    const [updated] = await db
      .update(contacts)
      .set({
        contactFrequency: parsed.data,
        contactFrequencySetAt: frequencySetAtOnUpdate(parsed.data),
        updatedAt: sql`now()`,
      })
      .where(eq(contacts.id, contactId))
      .returning({ id: contacts.id });

    if (!updated) return { ok: false, formError: CONTACT_NOT_FOUND };

    revalidatePath("/");
    revalidatePath(`/contacts/${contactId}`);
    return { ok: true, data: null };
  } catch (error) {
    console.error("Failed to update contact frequency", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}

// The contact's notes are deleted with it (on delete cascade).
export async function deleteContact(id: string): Promise<ActionResult<{ name: string }>> {
  if (!contactIdSchema.safeParse(id).success) {
    return { ok: false, formError: CONTACT_NOT_FOUND };
  }

  try {
    const [deleted] = await db
      .delete(contacts)
      .where(eq(contacts.id, id))
      .returning({ name: contacts.name });

    if (!deleted) return { ok: false, formError: CONTACT_NOT_FOUND };

    revalidatePath("/");
    return { ok: true, data: deleted };
  } catch (error) {
    console.error("Failed to delete contact", error);
    return { ok: false, formError: DELETE_FAILED };
  }
}

export async function addNote(
  contactId: string,
  values: { body: string },
): Promise<ActionResult<{ id: string }, "body">> {
  if (!contactIdSchema.safeParse(contactId).success) {
    return { ok: false, formError: CONTACT_NOT_FOUND };
  }

  const parsed = noteInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: firstFieldErrors(parsed.error) };
  }

  return insertNote(contactId, parsed.data.body);
}

/** "Связались": a regular note, so the period starts again from now. */
export async function markContacted(contactId: string): Promise<ActionResult<{ id: string }>> {
  if (!contactIdSchema.safeParse(contactId).success) {
    return { ok: false, formError: CONTACT_NOT_FOUND };
  }

  return insertNote(contactId, CONTACTED_NOTE_BODY);
}

/**
 * "Отменить" after "Связались": deletes the note that press saved. The app
 * cannot delete notes otherwise, so only a fresh "Связались" note of this
 * contact goes: without these checks anyone could call this action directly
 * and erase any note. The screen offers "Отменить" for 10 seconds; a minute
 * here leaves room for a slow connection.
 */
export async function undoMarkContacted(
  contactId: string,
  noteId: string,
): Promise<ActionResult<null>> {
  if (!contactIdSchema.safeParse(contactId).success || !noteIdSchema.safeParse(noteId).success) {
    return { ok: false, formError: UNDO_CONTACTED_FAILED };
  }

  try {
    const [deleted] = await db
      .delete(notes)
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.contactId, contactId),
          eq(notes.body, CONTACTED_NOTE_BODY),
          sql`${notes.createdAt} > now() - interval '1 minute'`,
        ),
      )
      .returning({ id: notes.id });

    if (!deleted) return { ok: false, formError: UNDO_CONTACTED_FAILED };

    // The contact is due again: back into "Пора связаться".
    revalidatePath("/");
    revalidatePath(`/contacts/${contactId}`);
    return { ok: true, data: null };
  } catch (error) {
    console.error("Failed to undo «Связались»", error);
    return { ok: false, formError: UNDO_CONTACTED_FAILED };
  }
}

async function insertNote(contactId: string, body: string): Promise<ActionResult<{ id: string }>> {
  try {
    const [created] = await db
      .insert(notes)
      .values({ contactId, body })
      .returning({ id: notes.id });

    // A new note starts the period again: the contact leaves "Пора связаться".
    revalidatePath("/");
    revalidatePath(`/contacts/${contactId}`);
    return { ok: true, data: created };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return { ok: false, formError: CONTACT_NOT_FOUND };
    }
    console.error("Failed to add note", error);
    return { ok: false, formError: SAVE_FAILED };
  }
}
