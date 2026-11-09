import { Pool } from "pg";
import { afterAll, beforeEach, vi } from "vitest";

import { getTestDatabaseUrl } from "./database-url";

// From here on the app and the cleanup below use the test database, never the working one.
const testDatabaseUrl = getTestDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl;
process.env.TEST_DATABASE_URL = testDatabaseUrl;

// Next.js calls that need a live request to the site. Everything else is real.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));

// A separate pool, always on the test database: files that point the app at an
// unreachable database (see unavailable-database.ts) are still cleaned the same way.
const pool = new Pool({ connectionString: testDatabaseUrl });

beforeEach(async () => {
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
  await pool.query(`truncate ${tables} restart identity cascade`);
});

afterAll(async () => {
  await pool.end();
});
