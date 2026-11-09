import { normalizeGroupName } from "./validation";

export type Suggestions<G extends { name: string }> = {
  /** Groups whose name contains the query, in the order given */
  matches: G[];
  /** The name for the «Создать группу «…»» item; null when there is nothing to create */
  createName: string | null;
};

/**
 * What the group picker offers for the typed text: the groups that fit and,
 * unless a group with exactly this name exists, a new group with this name.
 * Names are compared the way the database does (letter case and «ё» ignored).
 */
export function groupSuggestions<G extends { name: string }>(
  query: string,
  groups: G[],
): Suggestions<G> {
  const typed = query.trim();
  if (!typed) return { matches: groups, createName: null };

  const wanted = normalizeGroupName(typed);
  const matches = groups.filter((group) => normalizeGroupName(group.name).includes(wanted));
  const exists = groups.some((group) => normalizeGroupName(group.name) === wanted);
  return { matches, createName: exists ? null : typed };
}
