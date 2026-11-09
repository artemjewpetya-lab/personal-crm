import { Client } from "pg";
import { expect } from "vitest";

/**
 * Import this file FIRST in a test file for "the database is unavailable"
 * scenarios: it points the app at a port nobody listens on. The connection
 * really fails, nothing is replaced with a fake. Imports run in order, so the
 * address is set before the app creates its connection pool.
 */
process.env.DATABASE_URL = "postgres://nobody:nothing@127.0.0.1:1/unavailable";

/** The test first makes sure there really is no connection, so it cannot pass by accident. */
export async function expectNoConnection(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await expect(client.connect()).rejects.toMatchObject({ code: "ECONNREFUSED" });
}
