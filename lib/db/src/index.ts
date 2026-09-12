import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * A Drizzle handle over node-postgres. `drizzle()` attaches the underlying
 * pool as `$client`; naming it here lets callers run a parameterised query
 * without threading the pool separately or interpolating values into SQL.
 */
export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
}

/** Open a connection pool for `connectionString`. Callers own the handle. */
export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

let shared: DbHandle | null = null;

/**
 * The process-wide database, opened lazily from DATABASE_URL so that merely
 * importing this package (tests, type-checks, tooling) never requires one.
 */
export function getDb(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
    }
    shared = createDb(url);
  }
  return shared.db;
}

export * from "./schema";
export { migrationStatus, resolveMigrationsDir, runMigrations, type MigrationStatus } from "./migrate";
