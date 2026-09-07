// lib/db/__tests__/harness.ts — in-process Postgres for schema/RLS tests.
//
// Boots pglite (a real PostgreSQL compiled to WASM), installs a minimal
// Supabase `auth` shim, applies supabase/migrations/* → supabase/policies/*
// → supabase/seed.sql, and lets a test act as a signed-in user so that RLS,
// CHECK constraints, and the rule triggers behave exactly as in production.
//
// Role model: statements run as the table owner (superuser, RLS bypassed)
// unless wrapped in `as(userId, …)`, which switches to the `authenticated`
// role with a JWT-claims setting — the same thing PostgREST does.
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Supabase-compatible auth schema: auth.users + auth.uid()/auth.role() reading request.jwt.claims. */
const AUTH_SHIM = `
create schema if not exists auth;
create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
grant usage on schema public, auth to authenticated;
`;

/** What Supabase grants the `authenticated` role on public objects. */
const GRANTS = `
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant select on auth.users to authenticated;
`;

function sqlFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".sql")).sort();
}

export interface TestDb {
  db: PGlite;
  /** Run `fn` as a signed-in user (RLS enforced). `null` = anonymous. */
  as<T>(userId: string | null, fn: () => Promise<T>): Promise<T>;
  /** Convenience: one query as a signed-in user. */
  queryAs<T = Record<string, unknown>>(userId: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  /** Assert that `fn` rejects with a message matching `pattern`; returns the message. */
  expectError(fn: () => Promise<unknown>, pattern: RegExp): Promise<string>;
  close(): Promise<void>;
}

export const SEED_USERS = {
  admin: "00000000-0000-4000-a000-000000000001",     // K. Sandoval
  scheduler: "00000000-0000-4000-a000-000000000002", // T. Alvarez
  vega: "00000000-0000-4000-a000-000000000003",      // Maria Vega, Field_Staff
  price: "00000000-0000-4000-a000-000000000004"      // Devon Price, Field_Staff
} as const;

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<TestDb> {
  const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  await db.exec(AUTH_SHIM);
  for (const f of sqlFiles("supabase/migrations")) await db.exec(readFileSync(join(ROOT, "supabase/migrations", f), "utf8"));
  for (const f of sqlFiles("supabase/policies")) await db.exec(readFileSync(join(ROOT, "supabase/policies", f), "utf8"));
  await db.exec(GRANTS);
  if (opts.seed !== false) await db.exec(readFileSync(join(ROOT, "supabase/seed.sql"), "utf8"));

  const as = async <T,>(userId: string | null, fn: () => Promise<T>): Promise<T> => {
    const claims = userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : "";
    await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${claims}', false);`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
    }
  };

  return {
    db,
    as,
    queryAs: async <T = Record<string, unknown>,>(userId: string | null, sql: string, params: unknown[] = []) =>
      as(userId, async () => (await db.query<T>(sql, params)).rows),
    expectError: async (fn, pattern) => {
      try {
        await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!pattern.test(msg)) throw new Error(`Expected error matching ${pattern}, got: ${msg}`);
        return msg;
      }
      throw new Error(`Expected an error matching ${pattern}, but the statement succeeded`);
    },
    close: () => db.close()
  };
}
