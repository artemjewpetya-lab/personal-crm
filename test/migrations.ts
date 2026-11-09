import { randomBytes } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import {
  getTestDatabaseName,
  getWorkingDatabaseUrl,
  withDatabaseName,
} from "./database-url";

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

type Journal = {
  entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
};

export type TemporaryDatabase = {
  url: string;
  pool: Pool;
  /** Applies migrations up to and including `upTo` (a file name without .sql); all of them without it. */
  migrate(options?: { upTo?: string; next?: { tag: string; sql: string }[] }): Promise<void>;
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
    async migrate({ upTo, next = [] } = {}) {
      const folder = await prepareMigrationsFolder(upTo, next);
      try {
        await migrate(drizzle(pool), { migrationsFolder: folder });
      } finally {
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
