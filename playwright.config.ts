import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "@playwright/test";

// The tests talk to the same database as the app (to clean up after themselves).
loadEnvConfig(process.cwd());

const baseURL = "http://localhost:3000";

// The sign-in of the owner is made once by the "setup" project and reused by "app".
const OWNER_STATE = path.resolve(__dirname, "e2e", ".auth", "owner.json");

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL,
    locale: "ru-RU",
    // Use the Edge installed on the machine, no browser download needed.
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    // Signs in under OWNER_EMAIL and saves the sign-in for the tests below.
    { name: "setup", testMatch: /auth.setup.ts/ },
    {
      name: "app",
      testIgnore: /auth.setup.ts/,
      dependencies: ["setup"],
      // Everything works with the owner's data, so these tests start signed in as the owner.
      // e2e/sign-in.spec.ts starts signed out on its own.
      use: { storageState: OWNER_STATE },
    },
  ],
  webServer: {
    command: "pnpm dev",
    // /health is open without signing in; the main page would send the waiting check to the sign-in page.
    url: `${baseURL}/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
