import "server-only";

import { asc, count, eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db/client";
import { contactGroups, groups, type Group } from "@/db/schema";
import { contactIdSchema } from "@/lib/contacts/validation";

import { normalizedGroupName } from "./sql";

export type GroupListItem = Pick<Group, "id" | "name"> & { contactCount: number };

/** All groups by name, with the number of contacts in each. */
export async function listGroups(): Promise<GroupListItem[]> {
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
    .groupBy(groups.id)
    .orderBy(asc(normalizedGroupName(groups.name)), asc(groups.name));
}

/** The groups one contact is in, by name. */
export async function listContactGroups(contactId: string): Promise<Pick<Group, "id" | "name">[]> {
  await connection();

  if (!contactIdSchema.safeParse(contactId).success) return [];

  return db
    .select({ id: groups.id, name: groups.name })
    .from(contactGroups)
    .innerJoin(groups, eq(groups.id, contactGroups.groupId))
    .where(eq(contactGroups.contactId, contactId))
    .orderBy(asc(normalizedGroupName(groups.name)), asc(groups.name));
}
