import { defineConfig } from "vitest/config";
import path from "node:path";

// Workspace test runner.
//
// The archived Next.js/Supabase app under .migration-backup is excluded, as is
// the pre-migration schema test (lib/db/__tests__/schema.test.ts), whose
// harness still expects supabase/* at the repo root. The rest of
// lib/db/__tests__ runs — those suites use the live Drizzle migrations.
//
// Suites that need a database are guarded by `describe.skipIf(!TEST_DATABASE_URL)`,
// so a plain `pnpm test` with no database still runs the pure logic.
const dlsSrc = path.resolve(import.meta.dirname, "artifacts/dls-cms/src");

export default defineConfig({
  test: {
    include: [
      "lib/features/__tests__/**/*.test.ts",
      "lib/credentialing/__tests__/**/*.test.ts",
      "lib/time/__tests__/**/*.test.ts",
      "lib/db/__tests__/**/*.test.ts",
      "artifacts/api-server/src/**/__tests__/**/*.test.ts",
      "artifacts/dls-cms/src/**/__tests__/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      ".migration-backup/**",
      "lib/db/__tests__/schema.test.ts",
    ],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Every database-backed suite takes exclusive ownership of
    // TEST_DATABASE_URL — it drops and recreates the public schema before
    // running migrations. Run test FILES one at a time so they cannot reset
    // the schema out from under each other. The suite takes seconds either
    // way, and the alternative (a database per file) buys nothing here.
    fileParallelism: false,
    // The web app builds demo-mode only (see artifacts/dls-cms/vite.config.ts),
    // so its repo layer resolves to the in-memory store rather than the API.
    env: { NEXT_PUBLIC_DEMO_MODE: "true" },
  },
  resolve: {
    // Mirrors the aliases in artifacts/dls-cms/vite.config.ts so the web app's
    // server modules import the same way under test as they do in the app.
    alias: {
      "@": dlsSrc,
      "server-only": path.join(dlsSrc, "shims/empty.ts"),
      "next/navigation": path.join(dlsSrc, "shims/next-navigation.tsx"),
      "next/cache": path.join(dlsSrc, "shims/next-cache.ts"),
      "next/headers": path.join(dlsSrc, "shims/next-headers.ts"),
    },
  },
});
