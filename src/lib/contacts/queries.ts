import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db/client";
import { contacts, notes, type Contact, type Note } from "@/db/schema";

import { CONTACT_FREQUENCIES, CONTACT_FREQUENCY_DETAILS } from "./frequency";
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

export type DueContact = Pick<Contact, "id" | "name"> & {
  lastNoteAt: Date | null;
  /** First line of the last note, at most 200 characters */
  lastNoteSnippet: string | null;
  /** Full days (24 hours each) since the period ran out; 0 means less than a day */
  overdueDays: number;
};

// The longest snippet worth sending: the row shows one line and cuts the rest.
const SNIPPET_LENGTH = 200;

/**
 * Contacts it is time to get in touch with, most overdue first.
 * The period counts from the last note, or, without notes, from when the
 * frequency was set. Postgres adds months by the calendar (15 Sep + 1 month
 * = 15 Oct), and "now" comes from one clock: the database's.
 */
export async function listDueContacts(): Promise<DueContact[]> {
  await connection();

  const lastNote = db
    .select({
      createdAt: notes.createdAt,
      snippet: sql<string>`left(substring(${notes.body} from ${"^[^\\r\\n]*"}), ${SNIPPET_LENGTH})`.as(
        "snippet",
      ),
    })
    .from(notes)
    .where(eq(notes.contactId, contacts.id))
    .orderBy(desc(notes.createdAt))
    .limit(1)
    .as("last_note");

  const frequencyInterval = sql`case ${contacts.contactFrequency} ${sql.join(
    CONTACT_FREQUENCIES.map(
      (frequency) =>
        sql`when ${frequency}::contact_frequency then ${CONTACT_FREQUENCY_DETAILS[frequency].interval}::interval`,
    ),
    sql` `,
  )} end`;
  const dueAt = sql`(coalesce(${lastNote.createdAt}, ${contacts.contactFrequencySetAt}) + ${frequencyInterval})`;

  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      lastNoteAt: lastNote.createdAt,
      lastNoteSnippet: lastNote.snippet,
      overdueDays: sql<number>`floor(extract(epoch from now() - ${dueAt}) / 86400)::int`,
    })
    .from(contacts)
    .leftJoinLateral(lastNote, sql`true`)
    .where(and(isNotNull(contacts.contactFrequency), sql`${dueAt} <= now()`))
    .orderBy(dueAt, asc(contacts.name), asc(contacts.id));
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
