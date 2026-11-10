import "server-only";

import { and, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/db/client";
import { contactGroups, groups } from "@/db/schema";

import { normalizedGroupName } from "./sql";

/** The transaction object that db.transaction hands over. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The group of this user with this name, created if there is none. The unique index decides:
 * if another request made it a moment ago, that group is taken, not a twin. Groups of other
 * users are never looked at: two users may have groups with the same name.
 */
export async function findOrCreateGroup(
  tx: Transaction,
  userId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const [inserted] = await tx
    .insert(groups)
    .values({ userId, name })
    .onConflictDoNothing()
    .returning({ id: groups.id, name: groups.name });
  if (inserted) return inserted;

  const [found] = await tx
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(
      and(
        eq(groups.userId, userId),
        eq(normalizedGroupName(groups.name), normalizedGroupName(name)),
      ),
    )
    .limit(1);
  if (!found) throw new Error("The group disappeared right after it was found");
  return found;
}

/**
 * Makes the contact (one of this user's own) a member of exactly these groups: `groupIds`
 * (those that still exist and are the user's own; a group deleted in the meantime, or somebody
 * else's, is skipped) and the groups with `newGroupNames` (found or created). Extra links are
 * removed, missing ones added.
 */
export async function setContactGroups(
  tx: Transaction,
  userId: string,
  contactId: string,
  groupIds: string[],
  newGroupNames: string[],
): Promise<void> {
  const wanted = new Set<string>();

  if (groupIds.length > 0) {
    const existing = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(and(inArray(groups.id, groupIds), eq(groups.userId, userId)));
    for (const group of existing) wanted.add(group.id);
  }
  for (const name of newGroupNames) {
    wanted.add((await findOrCreateGroup(tx, userId, name)).id);
  }

  const wantedIds = [...wanted];
  await tx
    .delete(contactGroups)
    .where(
      and(
        eq(contactGroups.contactId, contactId),
        wantedIds.length > 0 ? notInArray(contactGroups.groupId, wantedIds) : undefined,
      ),
    );
  if (wantedIds.length > 0) {
    await tx
      .insert(contactGroups)
      .values(wantedIds.map((groupId) => ({ contactId, groupId })))
      .onConflictDoNothing();
  }
}
