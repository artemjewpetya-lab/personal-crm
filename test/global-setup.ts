import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import {
  DATABASE_NOT_RUNNING,
  getTestDatabaseName,
  getWorkingDatabaseUrl,
  withDatabaseName,
} from "./database-url";

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Runs once before all tests: recreates the "<working database>_test" database
 * and applies every migration from ./drizzle. The working database is only
 * used to connect to the server and is never changed.
 */
export default async function setup() {
  const workingUrl = getWorkingDatabaseUrl();
  const testName = getTestDatabaseName(workingUrl);
  // Never drop anything that is not clearly a test database.
  if (!testName.endsWith("_test")) throw new Error(`Refusing to recreate ${testName}`);

  // "postgres" is the maintenance database every server has.
  const admin = new Pool({ connectionString: withDatabaseName(workingUrl, "postgres") });
  try {
    try {
      await admin.query(`drop database if exists ${quoteIdentifier(testName)} with (force)`);
    } catch (error) {
      if (isConnectionError(error)) throw new Error(DATABASE_NOT_RUNNING, { cause: error });
      throw error;
    }
    await admin.query(`create database ${quoteIdentifier(testName)}`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: withDatabaseName(workingUrl, testName) });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
  } finally {
    await pool.end();
  }
}

function isConnectionError(error: unknown): boolean {
  const candidates = [error, error instanceof Error ? error.cause : undefined];
  return candidates.some((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return false;
    const { code, errors } = candidate as { code?: string; errors?: { code?: string }[] };
    return (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ETIMEDOUT" ||
      (errors ?? []).some((inner) => inner.code === "ECONNREFUSED")
    );
  });
}
