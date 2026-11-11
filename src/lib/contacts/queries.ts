import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db/client";
import {
  contactGroups,
  contacts,
  groups,
  notes,
  type Contact,
  type Group,
  type Note,
} from "@/db/schema";
import { normalizedGroupName } from "@/lib/groups/sql";
import { groupIdSchema } from "@/lib/groups/validation";

import { CONTACT_FREQUENCIES, CONTACT_FREQUENCY_DETAILS } from "./frequency";
import { contactIdSchema } from "./validation";

export type ContactListItem = Pick<Contact, "id" | "name" | "about" | "phone" | "email"> & {
  /** All groups of the contact by name, whatever group the list is filtered by */
  groups: Pick<Group, "id" | "name">[];
};

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

/**
 * The contacts by name, optionally only those matching `search` and/or only
 * those in the group `groupId` (both conditions together). Each row carries
 * its groups, read by the same query: no extra request per row.
 */
// Drizzle writes a column of a single-table query without its table name, and inside
// a subquery that bare "id" would mean the id of the subquery's own table. So the
// reference to the outer contact is spelled out.
const contactIdRef = sql`"contacts"."id"`;

export async function listContacts(
  userId: string,
  search: string,
  groupId?: string | null,
): Promise<ContactListItem[]> {
  // Always read fresh data at request time, never during the build.
  await connection();

  const inGroup =
    groupId && groupIdSchema.safeParse(groupId).success
      ? // A group that no longer exists, or belongs to somebody else, filters nothing (the same
        // as «Все группы»): the page can start reading the contacts without waiting to learn
        // which groups exist.
        sql`(not exists (select 1 from ${groups} where ${groups.id} = ${groupId} and ${groups.userId} = ${userId})
          or exists (select 1 from ${contactGroups} where ${contactGroups.contactId} = ${contactIdRef} and ${contactGroups.groupId} = ${groupId}))`
      : undefined;

  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
      groups: sql<ContactListItem["groups"]>`coalesce(
        (select json_agg(json_build_object('id', ${groups.id}, 'name', ${groups.name})
                order by ${normalizedGroupName(groups.name)}, ${groups.name})
           from ${contactGroups}
           inner join ${groups} on ${groups.id} = ${contactGroups.groupId}
          where ${contactGroups.contactId} = ${contactIdRef} and ${groups.userId} = ${userId}),
        '[]'::json)`,
    })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), search ? searchCondition(search) : undefined, inGroup))
    .orderBy(asc(contacts.name), asc(contacts.createdAt));
}

export async function countContacts(userId: string): Promise<number> {
  await connection();

  const [{ total }] = await db
    .select({ total: count() })
    .from(contacts)
    .where(eq(contacts.userId, userId));
  return total;
}

/** The contact, or null if there is none with this id among the user's own. */
export async function getContact(userId: string, id: string): Promise<Contact | null> {
  await connection();

  if (!contactIdSchema.safeParse(id).success) return null;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
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
export async function listDueContacts(userId: string): Promise<DueContact[]> {
  await connection();

  const lastNote = db
    .select({
      createdAt: notes.createdAt,
      snippet:
        sql<string>`left(substring(${notes.body} from ${"^[^\\r\\n]*"}), ${SNIPPET_LENGTH})`.as(
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
    .where(
      and(
        eq(contacts.userId, userId),
        isNotNull(contacts.contactFrequency),
        sql`${dueAt} <= now()`,
      ),
    )
    .orderBy(dueAt, asc(contacts.name), asc(contacts.id));
}

/** The notes of one of the user's own contacts; none for somebody else's. */
export async function listNotes(userId: string, contactId: string): Promise<Note[]> {
  await connection();

  if (!contactIdSchema.safeParse(contactId).success) return [];

  return db
    .select(getTableColumns(notes))
    .from(notes)
    .innerJoin(contacts, eq(contacts.id, notes.contactId))
    .where(and(eq(notes.contactId, contactId), eq(contacts.userId, userId)))
    .orderBy(desc(notes.createdAt));
}
