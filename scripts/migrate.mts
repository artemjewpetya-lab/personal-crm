/**
 * Applies pending migrations from ./drizzle and exits.
 *
 * Runs in the production image as a one-off container before a new version
 * starts (see deploy/deploy.sh). The image has no TypeScript tooling: Node
 * runs this file directly, so it only uses types that Node can strip.
 *
 * Usage: node scripts/migrate.mts (needs DATABASE_URL)
 */
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const pool = new Pool({ connectionString: databaseUrl });

// Drizzle records applied migrations in this table (created on the first run).
async function countAppliedMigrations(): Promise<number> {
  const { rows: [table] } = await pool.query<{ name: string | null }>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as name",
  );
  if (!table.name) return 0;

  const { rows: [{ total }] } = await pool.query<{ total: number }>(
    "select count(*)::int as total from drizzle.__drizzle_migrations",
  );
  return total;
}

try {
  const before = await countAppliedMigrations();
  await migrate(drizzle(pool), { migrationsFolder });
  const after = await countAppliedMigrations();
  console.log(
    `Migrations applied: ${after - before} new, ${after} in total.`,
  );
} catch (error) {
  console.error("Migrations failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
