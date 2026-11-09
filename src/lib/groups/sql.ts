import { sql, type SQLWrapper } from "drizzle-orm";

/**
 * A group name as the database compares names: lowercase, "ё" as "е". It is
 * the expression of the unique index on groups (see src/db/schema.ts); keep
 * them identical, otherwise the index stops helping and the rule changes.
 */
export function normalizedGroupName(value: SQLWrapper | string) {
  return sql`translate(lower(${value}), 'ё', 'е')`;
}
