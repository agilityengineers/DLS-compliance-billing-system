// The audit log's tamper evidence, against a real PostgreSQL.
//
// The chain is enforced by a trigger rather than by the application, so these
// tests speak SQL directly: that is the same door a privileged connection
// would come through.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, migrationStatus, runMigrations, type DbHandle } from "../src";

const TEST_URL = process.env.TEST_DATABASE_URL;

interface VerifyRow {
  checked: string | number;
  ok: boolean;
  first_bad_seq: string | number | null;
  first_bad_id: string | null;
  last_seq: string | number | null;
  last_hash: string | null;
}

interface ChainRow {
  seq: string;
  action: string;
  prev_hash: string | null;
  hash: string;
}

/** Postgres errors arrive wrapped by the driver; match anywhere in the chain. */
async function rejectsWith(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  let thrown: unknown;
  try {
    await run();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, "expected the statement to be rejected").toBeDefined();
  const messages: string[] = [];
  for (let e: unknown = thrown; e instanceof Error; e = e.cause) messages.push(e.message);
  expect(messages.join("\n")).toMatch(pattern);
}

describe.skipIf(!TEST_URL)("audit log chain", () => {
  let handle: DbHandle;

  const verify = async (fromSeq?: number): Promise<VerifyRow> => {
    const res =
      fromSeq === undefined
        ? await handle.db.execute(sql`select * from audit_log_verify()`)
        : await handle.db.execute(sql`select * from audit_log_verify(${fromSeq})`);
    return res.rows[0] as unknown as VerifyRow;
  };

  const chain = async (): Promise<ChainRow[]> =>
    (await handle.db.execute(sql`select seq, action, prev_hash, hash from audit_log order by seq`))
      .rows as unknown as ChainRow[];

  const addEntry = async (action: string, details: Record<string, unknown> | null = null) => {
    await handle.db.execute(
      sql`insert into audit_log (action, target_type, details)
          values (${action}, 'test', ${details === null ? null : JSON.stringify(details)}::jsonb)`
    );
  };

  beforeAll(async () => {
    handle = createDb(TEST_URL!);
    await handle.db.execute(sql`drop schema public cascade; drop schema if exists drizzle cascade; create schema public;`);
    await runMigrations(handle.db);
  });

  afterAll(async () => {
    await handle.pool.end();
  });

  it("applies every migration in the journal", async () => {
    const status = await migrationStatus(handle.db);
    expect(status.pending).toEqual([]);
    expect(status.applied).toBe(status.total);
    expect(status.latestApplied?.tag).toBe("0002_platform_hardening");
  });

  it("links each new entry to the one before it", async () => {
    await addEntry("platform.bootstrap");
    await addEntry("auth.login", { email: "someone@example.com" });
    await addEntry("user.created", { role: "Admin" });
    await addEntry("auth.login", { email: "someone@example.com" });

    const rows = await chain();
    expect(rows).toHaveLength(4);
    expect(rows[0]!.prev_hash).toBeNull();
    for (const [i, row] of rows.entries()) {
      expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
      if (i > 0) expect(row.prev_hash).toBe(rows[i - 1]!.hash);
    }
    // Monotonic, though not contiguous: the column's own default draws a value
    // and the trigger draws another under its lock. Gaps are expected.
    const seqs = rows.map((r) => Number(r.seq));
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    // Two identical actions still hash differently — id and seq are in the digest.
    expect(new Set(rows.map((r) => r.hash)).size).toBe(rows.length);
  });

  it("verifies clean and reports the tip", async () => {
    const rows = await chain();
    const v = await verify();
    expect(v.ok).toBe(true);
    expect(Number(v.checked)).toBe(rows.length);
    expect(v.first_bad_seq).toBeNull();
    expect(Number(v.last_seq)).toBe(Number(rows.at(-1)!.seq));
    expect(v.last_hash).toBe(rows.at(-1)!.hash);
  });

  it("refuses an update or a delete outright", async () => {
    const target = (await chain())[1]!;
    await rejectsWith(
      () => handle.db.execute(sql`update audit_log set action = 'rewritten' where seq = ${Number(target.seq)}`),
      /append-only/
    );
    await rejectsWith(
      () => handle.db.execute(sql`delete from audit_log where seq = ${Number(target.seq)}`),
      /append-only/
    );
    expect((await verify()).ok).toBe(true);
  });

  it("shows where the chain broke when a row is edited behind the trigger's back", async () => {
    const rows = await chain();
    const target = rows[1]!; // the second entry, mid-chain
    // Only a table owner can disable a trigger. That is the threat model: the
    // point is not that it cannot happen, it is that it cannot happen quietly.
    await handle.db.execute(sql`alter table audit_log disable trigger trg_audit_log_no_rewrite`);
    try {
      await handle.db.execute(
        sql`update audit_log set details = '{"email":"rewritten@example.com"}'::jsonb where seq = ${Number(target.seq)}`
      );
      const bad = await verify();
      expect(bad.ok).toBe(false);
      expect(Number(bad.first_bad_seq)).toBe(Number(target.seq));
      expect(bad.first_bad_id).not.toBeNull();
      // Later entries are still internally consistent, so verifying only the
      // tail (which trusts its starting row) comes back clean.
      expect((await verify(Number(rows[2]!.seq))).ok).toBe(true);

      // The digest is a pure function of the row, so putting the row back
      // restores the chain — an edit is detectable, not unrecoverable.
      await handle.db.execute(
        sql`update audit_log set details = '{"email":"someone@example.com"}'::jsonb where seq = ${Number(target.seq)}`
      );
      expect((await verify()).ok).toBe(true);
    } finally {
      await handle.db.execute(sql`alter table audit_log enable trigger trg_audit_log_no_rewrite`);
    }
  });

  it("keeps chain order and seq order in step when inserts interleave", async () => {
    // Two connections insert at the same time. The trigger draws seq under an
    // advisory lock, so whichever commits second is also the later seq and the
    // chain cannot fork.
    const other = createDb(TEST_URL!);
    try {
      await Promise.all([
        handle.db.execute(sql`insert into audit_log (action, target_type) values ('a.one', 'test')`),
        other.db.execute(sql`insert into audit_log (action, target_type) values ('a.two', 'test')`),
      ]);
      const rows = await chain();
      const v = await verify();
      expect(v.ok).toBe(true);
      expect(Number(v.checked)).toBe(rows.length);
    } finally {
      await other.pool.end();
    }
  });
});
