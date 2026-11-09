import { groupIdSchema } from "./validation";

/**
 * The group chosen in the page address (?group=...). Only a group that exists
 * counts: an unknown or deleted one is the same as «Все группы» (null).
 */
export function resolveGroupFilter(
  param: string | string[] | undefined,
  groups: { id: string }[],
): string | null {
  if (typeof param !== "string" || !groupIdSchema.safeParse(param).success) return null;
  return groups.some((group) => group.id === param) ? param : null;
}
