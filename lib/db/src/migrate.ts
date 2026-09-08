import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./index";

/**
 * Locate lib/db/migrations whether we run from source (tsx, vitest), from the
 * esbuild bundle under artifacts/api-server/dist, or from an explicit
 * DB_MIGRATIONS_DIR.
 */
export function resolveMigrationsDir(): string {
  const explicit = process.env.DB_MIGRATIONS_DIR;
  if (explicit) return explicit;
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(dir, "lib", "db", "migrations");
      if (existsSync(path.join(candidate, "meta", "_journal.json"))) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("Could not locate lib/db/migrations; set DB_MIGRATIONS_DIR.");
}

/** Apply every pending SQL migration (idempotent; tracked in __drizzle_migrations). */
export async function runMigrations(db: Db, migrationsFolder = resolveMigrationsDir()): Promise<void> {
  await migrate(db, { migrationsFolder });
}
