import { z } from "zod";

import { GROUP_NAME_REQUIRED, GROUP_NAME_TOO_LONG } from "./messages";

export const GROUP_NAME_MAX_LENGTH = 50;

/** The name as it is saved: no spaces at the edges, not empty, not longer than 50. */
export const groupNameSchema = z
  .string()
  .trim()
  .min(1, GROUP_NAME_REQUIRED)
  .max(GROUP_NAME_MAX_LENGTH, GROUP_NAME_TOO_LONG);

export const groupIdSchema = z.uuid();

/**
 * Lowercase and "ё" as "е": the same rule as the unique index on group names
 * (see src/db/schema.ts), so the browser can tell "семья" from a new name.
 */
export function normalizeGroupName(name: string): string {
  return name.trim().toLowerCase().replaceAll("ё", "е");
}
