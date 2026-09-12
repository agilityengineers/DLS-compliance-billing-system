// vitest.config.ts — unit tests for the workspace's pure logic and the
// demo-mode data path.
//
// SCOPE. Only suites that run with no external setup are included. The pglite
// schema suite (lib/db/__tests__/schema.test.ts) is deliberately NOT here: its
// harness reads supabase/migrations, supabase/policies and supabase/seed.sql
// from the repo root, and those moved to .migration-backup/ during the
// Drizzle migration. Restoring them is a migration decision, not a test one —
// tracked in docs/review/2026-09-feature-opportunity-review.md.
import { defineConfig } from "vitest/config";
import path from "node:path";

const dlsSrc = path.resolve(import.meta.dirname, "artifacts/dls-cms/src");

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "artifacts/dls-cms/src/**/__tests__/**/*.test.ts",
      "lib/credentialing/__tests__/**/*.test.ts",
      "lib/db/__tests__/credentialing.test.ts",
      "artifacts/api-server/__tests__/**/*.test.ts",
      "lib/time/__tests__/**/*.test.ts"
    ],
    // Demo mode is how this build runs (see artifacts/dls-cms/vite.config.ts),
    // so the repo layer resolves to the in-memory store rather than Supabase.
    env: { NEXT_PUBLIC_DEMO_MODE: "true" }
  },
  resolve: {
    // Mirrors the aliases in artifacts/dls-cms/vite.config.ts so server
    // modules import the same way under test as they do in the app.
    alias: {
      "@": dlsSrc,
      "server-only": path.join(dlsSrc, "shims/empty.ts"),
      "next/navigation": path.join(dlsSrc, "shims/next-navigation.tsx"),
      "next/cache": path.join(dlsSrc, "shims/next-cache.ts"),
      "next/headers": path.join(dlsSrc, "shims/next-headers.ts")
    }
  }
});
