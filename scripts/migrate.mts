/**
 * Applies pending migrations from ./drizzle and exits.
 *
 * Runs in the production image as a one-off container before a new version
 * starts (see deploy/deploy.sh). The image has no TypeScript tooling: Node
 * runs this file directly, so it only uses types that Node can strip.
 *
 * Migration 0005 gives the existing contacts and groups to their owner. It reads the owner's
 * email from the session setting "app.owner_email", which is set below from OWNER_EMAIL on the
 * same single connection that applies the migrations (the email is sent as a query parameter,
 * never pasted into SQL). Without a valid OWNER_EMAIL that migration stops and nothing changes.
 *
 * Usage: node --env-file-if-exists=.env scripts/migrate.mts (needs DATABASE_URL and OWNER_EMAIL)
 */
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
// One connection, not a pool: the owner setting below lives only as long as it does.
const client = new Client({ connectionString: databaseUrl });

// Drizzle records applied migrations in this table (created on the first run).
async function countAppliedMigrations(): Promise<number> {
  const {
    rows: [table],
  } = await client.query<{ name: string | null }>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as name",
  );
  if (!table.name) return 0;

  const {
    rows: [{ total }],
  } = await client.query<{ total: number }>(
    "select count(*)::int as total from drizzle.__drizzle_migrations",
  );
  return total;
}

try {
  await client.connect();
  await client.query("select set_config('app.owner_email', $1, false)", [
    process.env.OWNER_EMAIL ?? "",
  ]);
  const before = await countAppliedMigrations();
  await migrate(drizzle(client), { migrationsFolder });
  const after = await countAppliedMigrations();
  console.log(`Migrations applied: ${after - before} new, ${after} in total.`);
} catch (error) {
  console.error("Migrations failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
