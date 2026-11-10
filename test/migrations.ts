import { randomBytes } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import { getTestDatabaseName, getWorkingDatabaseUrl, withDatabaseName } from "./database-url";

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

/** The owner of existing data in tests that do not care who it is (OWNER_EMAIL in production). */
export const TEST_OWNER_EMAIL = "owner@example.com";

type Journal = {
  entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
};

export type TemporaryDatabase = {
  url: string;
  pool: Pool;
  /**
   * Applies migrations up to and including `upTo` (a file name without .sql); all of them without it.
   * `ownerEmail` plays OWNER_EMAIL: the same setting on the same single connection as scripts/migrate.mts.
   */
  migrate(options?: {
    upTo?: string;
    next?: { tag: string; sql: string }[];
    ownerEmail?: string;
  }): Promise<void>;
  drop(): Promise<void>;
};

/**
 * A throwaway database for tests that apply migrations step by step
 * (for example "the app was updated while the data was already there").
 */
export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const workingUrl = getWorkingDatabaseUrl();
  const name = `${getTestDatabaseName(workingUrl)}_tmp_${randomBytes(4).toString("hex")}`;
  const admin = new Pool({ connectionString: withDatabaseName(workingUrl, "postgres") });
  await admin.query(`create database "${name}"`);

  const url = withDatabaseName(workingUrl, name);
  const pool = new Pool({ connectionString: url });

  return {
    url,
    pool,
    async migrate({ upTo, next = [], ownerEmail } = {}) {
      const folder = await prepareMigrationsFolder(upTo, next);
      // One connection: the setting below lives only as long as it does.
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        if (ownerEmail !== undefined) {
          await client.query("select set_config('app.owner_email', $1, false)", [ownerEmail]);
        }
        await migrate(drizzle(client), { migrationsFolder: folder });
      } finally {
        await client.end();
        await rm(folder, { recursive: true, force: true });
      }
    },
    async drop() {
      await pool.end();
      await admin.query(`drop database if exists "${name}" with (force)`);
      await admin.end();
    },
  };
}

/** A copy of ./drizzle that stops at `upTo`, plus optional later migrations ("the next version"). */
async function prepareMigrationsFolder(
  upTo: string | undefined,
  next: { tag: string; sql: string }[],
): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "crm-migrations-"));
  await cp(MIGRATIONS_FOLDER, folder, { recursive: true });

  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal: Journal = JSON.parse(await readFile(journalPath, "utf8"));

  if (upTo) {
    const last = journal.entries.findIndex((entry) => entry.tag === upTo);
    if (last === -1) throw new Error(`No migration named ${upTo}`);
    journal.entries = journal.entries.slice(0, last + 1);
  }

  for (const migration of next) {
    const previous = journal.entries[journal.entries.length - 1];
    journal.entries.push({
      idx: previous.idx + 1,
      version: previous.version,
      when: previous.when + 1000,
      tag: migration.tag,
      breakpoints: true,
    });
    await writeFile(path.join(folder, `${migration.tag}.sql`), migration.sql);
  }

  await writeFile(journalPath, JSON.stringify(journal, null, 2));
  return folder;
}
