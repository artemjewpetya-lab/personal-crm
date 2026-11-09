import { loadEnvConfig } from "@next/env";

/** Same .env loading as Next.js and drizzle-kit, so tests see the same settings. */
export function getWorkingDatabaseUrl(): string {
  loadEnvConfig(process.cwd());
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill in the values.");
  }
  return url;
}

/** Name of the database tests run on: the working database name plus "_test". */
export function getTestDatabaseName(workingUrl: string): string {
  const name = decodeURIComponent(new URL(workingUrl).pathname.slice(1));
  // A second call in the same process already sees the test name.
  return name.endsWith("_test") ? name : `${name}_test`;
}

/** Address of the same Postgres with another database name. */
export function withDatabaseName(url: string, name: string): string {
  const next = new URL(url);
  next.pathname = `/${encodeURIComponent(name)}`;
  return next.toString();
}

export function getTestDatabaseUrl(): string {
  const workingUrl = getWorkingDatabaseUrl();
  return withDatabaseName(workingUrl, getTestDatabaseName(workingUrl));
}

/** The text shown when Postgres does not answer. */
export const DATABASE_NOT_RUNNING = "Запустите базу: docker compose up -d";
