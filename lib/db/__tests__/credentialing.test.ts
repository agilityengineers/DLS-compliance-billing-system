// lib/db/__tests__/credentialing.test.ts — the credentialing tables, verified
// against a real PostgreSQL (TEST_DATABASE_URL), applied through the real
// drizzle-kit migrations rather than a hand-run script.
//
// This is the evidence that persistence actually works: the migration applies,
// the constraints bite, the seed is idempotent, and — the part that matters on
// a live agency database — re-seeding refreshes what we own without touching
// what the agency decided.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DbHandle } from "../src/index";
import { seedRequirements } from "../src/seed/requirements";
import { DEFAULT_REQUIREMENTS } from "@workspace/credentialing";

const TEST_URL = process.env.TEST_DATABASE_URL;

let handle: DbHandle;
const exec = async (text: string, params: unknown[]) => handle.pool.query(text, params);
const rows = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await handle.pool.query<T>(text, params)).rows as T[];
const one = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await rows<T>(text, params))[0];

async function expectRejection(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    expect(msg).toMatch(pattern);
    return;
  }
  throw new Error(`Expected a rejection matching ${pattern}, but the statement succeeded`);
}

beforeAll(async () => {
  handle = createDb(TEST_URL!);
  await handle.db.execute(sql`drop schema public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(handle.db);
}, 120_000);
afterAll(async () => { await handle.pool.end(); });

describe.skipIf(!TEST_URL)("migration", () => {
  it("creates the credentialing tables", async () => {
    const tables = await rows<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name in ('requirements', 'staff_credentials')
       order by table_name`
    );
    expect(tables.map((t) => t.table_name)).toEqual(["requirements", "staff_credentials"]);
  });

  it("refuses a gating requirement that nobody is required to hold", async () => {
    await expectRejection(
      () => exec(
        `insert into requirements (id, label, category, required, gating, applies_to, source)
         values ('x', 'X', 'C', false, true, '["Field_Staff"]', '{"kind":"manual"}')`, []),
      /requirements_gating_requires_required/
    );
  });

  it("refuses a 'confirmed' row with nobody and no date behind it", async () => {
    await expectRejection(
      () => exec(
        `insert into requirements (id, label, category, applies_to, source, verification_status)
         values ('y', 'Y', 'C', '["Field_Staff"]', '{"kind":"manual"}', 'confirmed')`, []),
      /requirements_confirmed_needs_signoff/
    );
  });

  it("refuses an unexplained waiver", async () => {
    await seedRequirements(exec, DEFAULT_REQUIREMENTS.slice(0, 1));
    const staff = "00000000-0000-4000-a000-000000000003";
    await exec(`delete from staff_credentials`, []);
    await expectRejection(
      () => exec(
        `insert into staff_credentials (staff_id, requirement_id, status)
         values ($1, $2, 'waived')`, [staff, DEFAULT_REQUIREMENTS[0].id]),
      /staff_credentials_waiver_needs_reason/
    );
  });
});

describe.skipIf(!TEST_URL)("seed", () => {
  it("installs the whole shipped registry", async () => {
    const res = await seedRequirements(exec);
    expect(res.seeded).toBe(DEFAULT_REQUIREMENTS.length);
    const n = await one<{ n: number }>(`select count(*)::int n from requirements`);
    expect(n.n).toBe(DEFAULT_REQUIREMENTS.length);
  });

  it("round-trips the registry shape, jsonb columns included", async () => {
    await seedRequirements(exec);
    const qmap = await one<{ applies_to: string[]; source: { kind: string }; renews_months: number | null }>(
      `select applies_to, source, renews_months from requirements where id = 'qmap'`
    );
    expect(qmap.applies_to).toEqual(["Field_Staff"]);
    expect(qmap.source.kind).toBe("training");
    // QMAP registration does not expire — the correction this registry carries.
    expect(qmap.renews_months).toBeNull();
  });

  it("is idempotent", async () => {
    await seedRequirements(exec);
    await seedRequirements(exec);
    const n = await one<{ n: number }>(`select count(*)::int n from requirements`);
    expect(n.n).toBe(DEFAULT_REQUIREMENTS.length);
  });

  it("never clobbers an admin's required/gating toggles", async () => {
    await seedRequirements(exec);
    await exec(`update requirements set required = false, gating = false where id = 'hipaa'`, []);
    await seedRequirements(exec);
    const r = await one<{ required: boolean; gating: boolean }>(
      `select required, gating from requirements where id = 'hipaa'`
    );
    expect(r.required).toBe(false);
    expect(r.gating).toBe(false);
  });

  it("keeps a recorded sign-off but still refreshes a corrected citation", async () => {
    await seedRequirements(exec);
    await exec(
      `update requirements
       set verification_status = 'confirmed', verified_on = '2026-09-01',
           verified_by = 'Compliance Officer', verification_note = 'Checked against the rule text.'
       where id = 'caps_check'`, []);

    // Ship a corrected citation for the same row.
    const corrected = DEFAULT_REQUIREMENTS.map((r) =>
      r.id === "caps_check" ? { ...r, authorityCitation: "C.R.S. 26-3.1-111 (as amended)" } : r
    );
    await seedRequirements(exec, corrected);

    const r = await one<{
      verification_status: string; verified_by: string; verification_note: string; authority_citation: string;
    }>(`select verification_status, verified_by, verification_note, authority_citation
        from requirements where id = 'caps_check'`);
    expect(r.verification_status).toBe("confirmed");
    expect(r.verified_by).toBe("Compliance Officer");
    expect(r.verification_note).toBe("Checked against the rule text.");
    expect(r.authority_citation).toBe("C.R.S. 26-3.1-111 (as amended)"); // ours to update
  });

  it("re-states our own wording while the row is still unconfirmed", async () => {
    await seedRequirements(exec);
    await exec(`update requirements set verification_note = 'scribbled over' where id = 'tb_screening'`, []);
    await seedRequirements(exec);
    const r = await one<{ verification_note: string }>(
      `select verification_note from requirements where id = 'tb_screening'`
    );
    expect(r.verification_note).toContain("UNCONFIRMED");
  });
});

describe.skipIf(!TEST_URL)("staff credentials", () => {
  it("holds one row per staff member per requirement", async () => {
    await seedRequirements(exec);
    const staff = "00000000-0000-4000-a000-000000000003";
    await exec(
      `insert into staff_credentials (staff_id, requirement_id, status, completed_on)
       values ($1, 'hipaa', 'verified', '2026-01-15')`, [staff]);
    await expectRejection(
      () => exec(
        `insert into staff_credentials (staff_id, requirement_id, status)
         values ($1, 'hipaa', 'verified')`, [staff]),
      /uq_staff_credential|duplicate key/i
    );
  });

  it("accepts a waiver that names a person and a reason", async () => {
    await seedRequirements(exec);
    const staff = "00000000-0000-4000-a000-000000000007";
    const admin = "00000000-0000-4000-a000-000000000001";
    const inserted = await rows<{ id: string }>(
      `insert into staff_credentials (staff_id, requirement_id, status, waived_by, waive_reason, waived_at)
       values ($1, 'tb_screening', 'waived', $2, 'Conditional start approved by the agency director', now())
       returning id`, [staff, admin]);
    expect(inserted).toHaveLength(1);
  });

  it("removes a requirement's credentials with the requirement", async () => {
    await seedRequirements(exec);
    const staff = "00000000-0000-4000-a000-000000000004";
    await exec(
      `insert into staff_credentials (staff_id, requirement_id, status)
       values ($1, 'drivers_license', 'verified')`, [staff]);
    await exec(`delete from requirements where id = 'drivers_license'`, []);
    const left = await rows(`select 1 from staff_credentials where requirement_id = 'drivers_license'`);
    expect(left).toHaveLength(0);
  });
});
