import { defineConfig } from "drizzle-kit";

// Paths are relative to this package, which is where `pnpm --filter
// @workspace/db run <script>` runs. They must stay relative: drizzle-kit
// prefixes `out` with "./" when it reads the migration folder, so an absolute
// path becomes ".//home/…" and every command that touches the folder fails.
//
// `generate` needs no database; `push`/`migrate` do. Keep the helpful error
// for the commands that need credentials without breaking code generation.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  ...(url ? { dbCredentials: { url } } : {}),
});
