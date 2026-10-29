// artifacts/api-server/src/__tests__/helpers/isolated-db.ts — a database that
// exists only for one test file.
//
// The suites that need PostgreSQL are pointed at TEST_DATABASE_URL. The older
// ones take that database over: drop the public schema, migrate, run. That is
// fine against a scratch server and catastrophic against anything else, and
// nothing in the URL says which it is. This helper never touches the database
// the URL names. It connects there only to CREATE DATABASE a fresh one with a
// random name, hands back a handle to that, and drops it again at the end —
// so a suite built on it cannot delete a record it did not create, and two
// suites can run side by side without resetting each other's schema.
//
// Two refusals, before anything is created:
//   · TEST_DATABASE_URL is the application's own DATABASE_URL (the same
//     server and database), which is how a scratch URL turns into the
//     development or production database by a copied line in .env;
//   · the URL's database name has "prod" or "production" in it.
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DbHandle } from "@workspace/db";

export interface IsolatedDb extends DbHandle {
  /** The connection string of the database this suite owns. */
  url: string;
  /** The name of that database. */
  name: string;
  /** A second, independent pool on the same database — another "process". */
  openAnother(): DbHandle;
  /** Close every pool opened here and drop the database. */
  destroy(): Promise<void>;
}

function sameDatabase(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname === y.hostname && (x.port || "5432") === (y.port || "5432") && x.pathname === y.pathname;
  } catch {
    return a === b;
  }
}

export function refuseUnsafeTestUrl(testUrl: string, appUrl: string | undefined = process.env.DATABASE_URL): void {
  if (appUrl && sameDatabase(testUrl, appUrl)) {
    throw new Error("Refusing to run database tests: TEST_DATABASE_URL is the application's DATABASE_URL. Point it at a scratch server.");
  }
  const name = (() => {
    try {
      return new URL(testUrl).pathname.replace(/^\//, "");
    } catch {
      return testUrl;
    }
  })();
  if (/prod/i.test(name)) {
    throw new Error(`Refusing to run database tests against a database called "${name}".`);
  }
}

/**
 * Create a fresh database next to the one TEST_DATABASE_URL names, apply every
 * migration to it, and return a handle. `prefix` makes the name readable in
 * `\\l` while something is running; the random suffix keeps parallel runs apart.
 */
export async function createIsolatedDb(adminUrl: string, prefix = "dls_test"): Promise<IsolatedDb> {
  refuseUnsafeTestUrl(adminUrl);
  const name = `${prefix}_${randomBytes(6).toString("hex")}`;
  const admin = createDb(adminUrl);
  try {
    await admin.db.execute(sql.raw(`create database "${name}"`));
  } finally {
    await admin.pool.end();
  }
  const url = (() => {
    const u = new URL(adminUrl);
    u.pathname = `/${name}`;
    return u.toString();
  })();
  const handles: DbHandle[] = [];
  const main = createDb(url);
  handles.push(main);
  await runMigrations(main.db);
  return {
    ...main,
    url,
    name,
    openAnother() {
      const h = createDb(url);
      handles.push(h);
      return h;
    },
    async destroy() {
      for (const h of handles) await h.pool.end().catch(() => undefined);
      const cleaner = createDb(adminUrl);
      try {
        await cleaner.db.execute(sql.raw(`drop database if exists "${name}" with (force)`));
      } finally {
        await cleaner.pool.end();
      }
    },
  };
}

/** `count(*)` of a table, through Drizzle, for assertions. */
export async function countRows(db: DbHandle["db"], table: string, where = "true"): Promise<number> {
  const res = await db.execute(sql.raw(`select count(*)::int as n from ${table} where ${where}`));
  return Number((res.rows[0] as { n: number }).n);
}
