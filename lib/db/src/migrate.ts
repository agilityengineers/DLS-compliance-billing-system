import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
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

export interface MigrationStatus {
  /** Migrations in the journal. */
  total: number;
  /** …of which the database has applied. */
  applied: number;
  /** Journal tags not yet applied, in journal order. Empty on a healthy deployment. */
  pending: string[];
  /** The newest applied migration and the date it was authored (the journal's `when`). */
  latestApplied: { tag: string; authoredAt: string } | null;
}

interface JournalEntry {
  tag: string;
  when: number;
}

/**
 * Compare the journal with what drizzle recorded in `drizzle.__drizzle_migrations`.
 * Drizzle stores each applied migration's folder timestamp (the journal's
 * `when`) as `created_at`, so matching on that value tells us exactly which
 * journal entries have run. A database that has never been migrated has no
 * bookkeeping table at all; that reads as "nothing applied", not as an error.
 */
export async function migrationStatus(db: Db, migrationsFolder = resolveMigrationsDir()): Promise<MigrationStatus> {
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  let appliedMillis = new Set<number>();
  try {
    const result = await db.execute(sql`select created_at from drizzle.__drizzle_migrations order by created_at`);
    appliedMillis = new Set((result.rows as { created_at: string | number }[]).map((r) => Number(r.created_at)));
  } catch {
    appliedMillis = new Set();
  }
  const appliedEntries = journal.entries.filter((e) => appliedMillis.has(e.when));
  const latest = appliedEntries[appliedEntries.length - 1];
  return {
    total: journal.entries.length,
    applied: appliedEntries.length,
    pending: journal.entries.filter((e) => !appliedMillis.has(e.when)).map((e) => e.tag),
    latestApplied: latest ? { tag: latest.tag, authoredAt: new Date(latest.when).toISOString() } : null,
  };
}
