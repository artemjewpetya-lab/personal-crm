import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" throws outside Next.js, so tests get an empty stand-in.
      "server-only": path.resolve(import.meta.dirname, "test/stubs/server-only.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // One database for all files, so they run one after another.
    fileParallelism: false,
  },
});
