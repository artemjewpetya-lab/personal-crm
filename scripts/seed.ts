/**
 * Fills an empty database with realistic test contacts and notes for the owner of the app
 * (the user with the email from OWNER_EMAIL in .env).
 *
 * Safe to run more than once: when the contacts table already has rows,
 * the script exits without touching anything.
 *
 * Usage: pnpm db:seed
 */
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

import { seedDatabase } from "./seed-database";

loadEnvConfig(process.cwd());

async function main() {
  const pool = new Pool({ connectionString: getDatabaseUrl() });

  try {
    const summary = await seedDatabase(drizzle(pool), process.env.OWNER_EMAIL);

    console.log(
      summary.skipped
        ? `The database already has ${summary.existingContacts} contacts, seeding skipped.`
        : `Inserted ${summary.contacts} contacts, ${summary.notes} notes and ${summary.memberships} group memberships.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
