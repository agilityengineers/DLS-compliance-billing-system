import { defineConfig } from "vitest/config";

// Workspace test runner. The archived Next.js/Supabase app under
// .migration-backup and the pre-migration schema test under lib/db/__tests__
// (which expects supabase/* at the repo root) are intentionally excluded —
// they belong to the archived tree, not the live artifacts.
export default defineConfig({
  test: {
    include: [
      "lib/features/__tests__/**/*.test.ts",
      "artifacts/api-server/src/**/__tests__/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", ".migration-backup/**", "lib/db/__tests__/**"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
