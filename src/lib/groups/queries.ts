import "server-only";

import { and, asc, count, eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db/client";
import { contactGroups, contacts, groups, type Group } from "@/db/schema";
import { contactIdSchema } from "@/lib/contacts/validation";

import { normalizedGroupName } from "./sql";

export type GroupListItem = Pick<Group, "id" | "name"> & { contactCount: number };

/** All groups of the user by name, with the number of contacts in each. */
export async function listGroups(userId: string): Promise<GroupListItem[]> {
  // Always read fresh data at request time, never during the build.
  await connection();

  return db
    .select({
      id: groups.id,
      name: groups.name,
      contactCount: count(contactGroups.contactId),
    })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .where(eq(groups.userId, userId))
    .groupBy(groups.id)
    .orderBy(asc(normalizedGroupName(groups.name)), asc(groups.name));
}

/** The groups one of the user's own contacts is in, by name. */
export async function listContactGroups(
  userId: string,
  contactId: string,
): Promise<Pick<Group, "id" | "name">[]> {
  await connection();

  if (!contactIdSchema.safeParse(contactId).success) return [];

  return db
    .select({ id: groups.id, name: groups.name })
    .from(contactGroups)
    .innerJoin(groups, eq(groups.id, contactGroups.groupId))
    .innerJoin(contacts, eq(contacts.id, contactGroups.contactId))
    .where(
      and(
        eq(contactGroups.contactId, contactId),
        eq(groups.userId, userId),
        eq(contacts.userId, userId),
      ),
    )
    .orderBy(asc(normalizedGroupName(groups.name)), asc(groups.name));
}
