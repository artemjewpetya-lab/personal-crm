import { Pool } from "pg";
import { afterAll, beforeEach, vi } from "vitest";

import { getTestDatabaseUrl } from "./database-url";
import { resetRequestHeaders } from "./request-context";

// From here on the app and the cleanup below use the test database, never the working one.
const testDatabaseUrl = getTestDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl;
process.env.TEST_DATABASE_URL = testDatabaseUrl;

// Next.js calls that need a live request to the site. Everything else is real.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// (NextRequest and NextResponse stay real: the tests of proxy.ts need them.)
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
// The headers of "the request" are whatever the test put into test/request-context.ts.
vi.mock("next/headers", async () => {
  const context = await import("./request-context");
  return { headers: async () => context.currentRequestHeaders() };
});

// A separate pool, always on the test database: files that point the app at an
// unreachable database (see unavailable-database.ts) are still cleaned the same way.
const pool = new Pool({ connectionString: testDatabaseUrl });

beforeEach(async () => {
  resetRequestHeaders();
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
