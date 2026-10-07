"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { contacts, notes } from "@/db/schema";
import {
  contactIdSchema,
  contactInputSchema,
  firstFieldErrors,
  noteInputSchema,
  type ActionResult,
  type ContactFieldName,
  type ContactFormValues,
} from "@/lib/contacts/validation";

const SAVE_FAILED = "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
const CONTACT_NOT_FOUND = "Контакт не найден — возможно, его уже нет в базе.";

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

export async function createContact(
  values: ContactFormValues,
): Promise<ActionResult<{ id: string; name: string }, ContactFieldName>> {
  const parsed = contactInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: firstFieldErrors(parsed.error) };
  }

  try {
    const [created] = await db
      .insert(contacts)
      .values(parsed.data)
      .returning({ id: contacts.id, name: contacts.name });

    revalidatePath("/");
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
    return { ok: false, fieldErrors: firstFieldErrors(parsed.error) };
  }

  try {
    const [updated] = await db
      .update(contacts)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });

    if (!updated) return { ok: false, formError: CONTACT_NOT_FOUND };

    revalidatePath("/");
    revalidatePath(`/contacts/${id}`);
    return { ok: true, data: updated };
  } catch (error) {
    console.error("Failed to update contact", error);
    return { ok: false, formError: SAVE_FAILED };
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

  try {
    const [created] = await db
      .insert(notes)
      .values({ contactId, body: parsed.data.body })
      .returning({ id: notes.id });

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
