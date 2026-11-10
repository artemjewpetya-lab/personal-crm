import { expect, test as base } from "@playwright/test";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";

/**
 * `test` for all e2e files. Before every test the log of sent sign-in emails is cleared: all
 * tests come from one address and sign in under many emails, so the limit of 5 different
 * addresses per device would stop them otherwise. The limit itself stays on and is checked
 * for real in the Vitest tests.
 */
export const test = base.extend<{ clearSignInLog: void }>({
  clearSignInLog: [
    async ({}, use) => {
      const pool = new Pool({ connectionString: getDatabaseUrl() });
      try {
        await pool.query("delete from sign_in_emails");
      } finally {
        await pool.end();
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
