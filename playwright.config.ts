import { loadEnvConfig } from "@next/env";
import { defineConfig } from "@playwright/test";

// The tests talk to the same database as the app (to clean up after themselves).
loadEnvConfig(process.cwd());

const baseURL = "http://localhost:3000";

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
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
