import "server-only";

import {
  asc,
  count,
  desc,
  eq,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db/client";
import { contacts, notes, type Contact, type Note } from "@/db/schema";

import { contactIdSchema } from "./validation";

export type ContactListItem = Pick<
  Contact,
  "id" | "name" | "about" | "phone" | "email"
>;

// Lowercase and treat "ё" as "е", so "Артем" finds "Артём".
function normalizeForSearch(value: SQLWrapper | string) {
  return sql`translate(lower(${value}), 'ё', 'е')`;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function searchCondition(search: string): SQL | undefined {
  const pattern = `%${escapeLikePattern(search)}%`;
  const conditions = [
    sql`${normalizeForSearch(contacts.name)} like ${normalizeForSearch(pattern)}`,
    sql`lower(coalesce(${contacts.email}, '')) like lower(${pattern})`,
  ];

  // Phone numbers are stored formatted ("+7 900 123-45-67"),
  // so compare digits only when the query looks like a phone number.
  const digits = search.replace(/\D/g, "");
  if (digits.length >= 3 && /^[\d\s()+\-.]+$/.test(search)) {
    conditions.push(
      sql`regexp_replace(coalesce(${contacts.phone}, ''), ${"\\D"}, '', 'g') like ${`%${digits}%`}`,
    );
  }

  return or(...conditions);
}

export async function listContacts(search: string): Promise<ContactListItem[]> {
  // Always read fresh data at request time, never during the build.
  await connection();

  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(search ? searchCondition(search) : undefined)
    .orderBy(asc(contacts.name), asc(contacts.createdAt));
}

export async function countContacts(): Promise<number> {
  await connection();

  const [{ total }] = await db.select({ total: count() }).from(contacts);
  return total;
}

export async function getContact(id: string): Promise<Contact | null> {
  await connection();

  if (!contactIdSchema.safeParse(id).success) return null;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  return contact ?? null;
}

export async function listNotes(contactId: string): Promise<Note[]> {
  await connection();

  if (!contactIdSchema.safeParse(contactId).success) return [];

  return db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt));
}
