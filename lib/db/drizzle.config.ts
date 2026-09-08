import { defineConfig } from "drizzle-kit";
import path from "path";

// `generate` needs no database; `push`/`migrate` do. Keep the helpful error
// for the commands that need credentials without breaking code generation.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
  ...(url ? { dbCredentials: { url } } : {}),
});
