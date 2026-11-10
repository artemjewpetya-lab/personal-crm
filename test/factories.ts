import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { contactGroups, contacts, groups, notes, users } from "@/db/schema";

// Rows written straight to the test database, for the "given" part of a test.

/** A user who has signed in before, the owner of the contacts and groups given below. */
export async function givenUser(email: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: email.trim().toLowerCase(), emailVerified: true })
    .returning({ id: users.id });
  return row.id;
}

export async function givenContact(
  userId: string,
  name: string,
  values: Partial<Omit<typeof contacts.$inferInsert, "userId">> = {},
): Promise<string> {
  const [row] = await db
    .insert(contacts)
    .values({ userId, name, ...values })
    .returning({ id: contacts.id });
  return row.id;
}

export async function givenGroup(userId: string, name: string): Promise<string> {
  const [row] = await db.insert(groups).values({ userId, name }).returning({ id: groups.id });
  return row.id;
}

export async function givenMembership(contactId: string, groupId: string): Promise<void> {
  await db.insert(contactGroups).values({ contactId, groupId });
}

export async function givenNote(contactId: string, body: string): Promise<void> {
  await db.insert(notes).values({ contactId, body });
}

/** Names of the groups a contact is in, read straight from the tables (no sorting). */
export async function groupNamesOf(contactId: string): Promise<string[]> {
  const rows = await db
    .select({ name: groups.name })
    .from(contactGroups)
    .innerJoin(groups, eq(contactGroups.groupId, groups.id))
    .where(eq(contactGroups.contactId, contactId));
  return rows.map((row) => row.name);
}
