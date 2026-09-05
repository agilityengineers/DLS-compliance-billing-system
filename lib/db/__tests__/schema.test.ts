// lib/db/__tests__/schema.test.ts — the database rules, verified against a
// real Postgres: RLS per role, CHECK constraints, rule triggers, audit rows,
// and the real-mode defects fixed in migration 0006.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, SEED_USERS, type TestDb } from "./harness";
import { calculateBillingUnits } from "@/lib/billing/units";

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); }, 120_000);
afterAll(async () => { await t.close(); });

const row = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await t.db.query<T>(sql, params)).rows[0];

describe("migrations, policies and seed", () => {
  it("apply cleanly and seed the synthetic dataset", async () => {
    const counts = await row<{ users: number; clients: number; visits: number; notes: number }>(
      `select (select count(*)::int from users) users, (select count(*)::int from clients) clients,
              (select count(*)::int from visits) visits, (select count(*)::int from progress_notes) notes`
    );
    expect(counts.users).toBeGreaterThan(0);
    expect(counts.clients).toBeGreaterThan(0);
    expect(counts.visits).toBeGreaterThan(0);
    expect(counts.notes).toBeGreaterThan(0);
  });

  it("enable RLS on every public table", async () => {
    const off = (await t.db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
    )).rows.map((r) => r.relname);
    expect(off).toEqual([]);
  });
});

describe("unit math: SQL generated column ≡ lib/billing/units.ts", () => {
  it("agrees for 7, 8, 14, 15, 22, 23, 60 and 95 minutes", async () => {
    const visit = await row<{ id: string; client_id: string; staff_id: string }>(
      `select id, client_id, staff_id from visits order by scheduled_start limit 1`
    );
    for (const minutes of [7, 8, 14, 15, 22, 23, 60, 95]) {
      const end = `${String(9 + Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      const r = await row<{ units: number; hours: string }>(
        `insert into progress_notes (visit_id, client_id, staff_id, date, start_time, end_time)
         values ($1, $2, $3, '2026-06-01', '09:00', $4)
         returning calculated_billing_units as units, calculated_billable_hours as hours`,
        [visit.id, visit.client_id, visit.staff_id, end]
      );
      expect(r.units).toBe(calculateBillingUnits(new Date("2026-06-01T09:00:00Z"), new Date(`2026-06-01T${end}:00Z`)));
      await t.db.query(`delete from progress_notes where visit_id = $1 and date = '2026-06-01'`, [visit.id]);
    }
  });
});

describe("0006 — route-record rows append in real mode", () => {
  it("accepts ON CONFLICT (source, source_id) and is idempotent per source record", async () => {
    await t.as(SEED_USERS.vega, async () => {
      const ts = await row<{ id: string }>(
        `insert into timesheets (staff_id, period_start, period_end)
         values ($1, '2026-06-01', '2026-06-07') returning id`, [SEED_USERS.vega]
      );
      const sourceId = "11111111-1111-4111-8111-111111111111";
      const insert = `insert into timesheet_entries (timesheet_id, work_date, service_code, hours, source, source_id)
                      values ($1, '2026-06-01', 'SCC', 1.5, 'evv', $2) on conflict (source, source_id) do nothing`;
      await t.db.query(insert, [ts.id, sourceId]); // first append
      await t.db.query(insert, [ts.id, sourceId]); // sync replay — must not error, must not duplicate
      const c = await row<{ n: number }>(`select count(*)::int n from timesheet_entries where source_id = $1`, [sourceId]);
      expect(c.n).toBe(1);
      // manual rows have no source_id and never collide with each other
      for (let i = 0; i < 2; i++) {
        await t.db.query(`insert into timesheet_entries (timesheet_id, work_date, service_code, hours, source)
                          values ($1, '2026-06-02', 'DH', 2, 'manual')`, [ts.id]);
      }
      const m = await row<{ n: number }>(`select count(*)::int n from timesheet_entries where timesheet_id = $1 and source = 'manual'`, [ts.id]);
      expect(m.n).toBe(2);
    });
  });
});

describe("0006 — eMAR field policy", () => {
  const assignedMed = () => row<{ id: string }>(
    `select m.id from medication_logs m
     where m.client_id in (select client_id from visits where staff_id = $1) and m.status <> 'Administered'
     limit 1`, [SEED_USERS.vega]
  );

  it("lets field staff mark an assigned client's med Missed (no administrator)", async () => {
    const med = await assignedMed();
    expect(med).toBeTruthy();
    const updated = await t.queryAs(SEED_USERS.vega,
      `update medication_logs set status = 'Missed', administered_by = null where id = $1 returning id`, [med.id]);
    expect(updated).toHaveLength(1);
  });

  it("still requires administered_by = self for Administered, and a time", async () => {
    const med = await assignedMed();
    await t.expectError(
      () => t.queryAs(SEED_USERS.vega,
        `update medication_logs set status = 'Administered', administered_by = $2 where id = $1`,
        [med.id, SEED_USERS.vega]),
      /check constraint|violates/i // Administered without administered_time
    );
    await t.expectError(
      () => t.queryAs(SEED_USERS.vega,
        `update medication_logs set status = 'Administered', administered_time = now(), administered_by = $2 where id = $1`,
        [med.id, SEED_USERS.price]),
      /row-level security|violates/i // attributing to someone else
    );
    const ok = await t.queryAs(SEED_USERS.vega,
      `update medication_logs set status = 'Administered', administered_time = now(), administered_by = $2 where id = $1 returning id`,
      [med.id, SEED_USERS.vega]);
    expect(ok).toHaveLength(1);
  });
});

describe("rule triggers and RLS (regression)", () => {
  it("rejects a GPS clock-in outside the 150 m geofence with EVV_GEOFENCE", async () => {
    const visit = await row<{ id: string }>(
      `select v.id from visits v join clients c on c.id = v.client_id
       where v.staff_id = $1 and c.residence_gps is not null and not exists (select 1 from evv_logs e where e.visit_id = v.id)
       order by v.scheduled_start limit 1`, [SEED_USERS.vega]);
    expect(visit).toBeTruthy();
    await t.expectError(
      () => t.queryAs(SEED_USERS.vega,
        `insert into evv_logs (visit_id, clock_in_time, clock_in_gps, verification_method)
         values ($1, now(), point(39.7392, -104.9903), 'GPS')`, [visit.id]), // downtown Denver
      /EVV_GEOFENCE/
    );
  });

  it("denies a Manual EVV record from a field session", async () => {
    const visit = await row<{ id: string }>(`select id from visits where staff_id = $1 limit 1`, [SEED_USERS.vega]);
    await t.expectError(
      () => t.queryAs(SEED_USERS.vega,
        `insert into evv_logs (visit_id, clock_in_time, verification_method, manual_adjustment_reason)
         values ($1, now(), 'Manual', 'typo')`, [visit.id]),
      /row-level security/i
    );
  });

  it("requires a documented reason on a Manual EVV record, even for an Admin", async () => {
    const visit = await row<{ id: string }>(`select id from visits order by scheduled_start limit 1`);
    await t.expectError(
      () => t.queryAs(SEED_USERS.admin,
        `insert into evv_logs (visit_id, clock_in_time, clock_out_time, verification_method, manual_adjustment_reason)
         values ($1, now() - interval '2 hours', now() - interval '1 hour', 'Manual', '   ')`, [visit.id]),
      /check constraint|violates/i
    );
  });

  it("rejects a visit without an active physician order", async () => {
    const c = await row<{ id: string }>(`select id from clients limit 1`);
    await t.expectError(
      () => t.queryAs(SEED_USERS.admin,
        `insert into visits (client_id, staff_id, visit_type, scheduled_start, scheduled_end, physician_order_id)
         values ($1, $2, 'SCC', now() + interval '1 day', now() + interval '1 day 2 hours', null)`,
        [c.id, SEED_USERS.vega]),
      /PHYSICIAN_ORDER_REQUIRED/
    );
  });

  it("evaluates the physician order on the AGENCY day, not the UTC day", async () => {
    // An order that expires 2027-06-30. A visit at 6 pm Denver on 2027-06-30 is
    // 2027-07-01T00:00Z — still the 30th to the agency, so it must be accepted;
    // a visit at 12:30 am on 2027-07-01 Denver must be rejected.
    const c = await row<{ id: string }>(`select id from clients limit 1`);
    const order = await row<{ id: string }>(
      `insert into physician_orders (client_id, order_number, ordering_physician, order_type, effective_date, expiration_date)
       values ($1, 'PO-TZ-TEST', 'Dr. Test', 'Standing', '2027-06-01', '2027-06-30') returning id`, [c.id]);
    const accepted = await t.queryAs<{ id: string }>(SEED_USERS.admin,
      `insert into visits (client_id, staff_id, visit_type, scheduled_start, scheduled_end, physician_order_id)
       values ($1, $2, 'SCC', '2027-07-01T00:00:00Z', '2027-07-01T02:00:00Z', $3) returning id`,
      [c.id, SEED_USERS.vega, order.id]);
    expect(accepted).toHaveLength(1);
    await t.expectError(
      () => t.queryAs(SEED_USERS.admin,
        `insert into visits (client_id, staff_id, visit_type, scheduled_start, scheduled_end, physician_order_id)
         values ($1, $2, 'SCC', '2027-07-01T06:30:00Z', '2027-07-01T08:00:00Z', $3)`,
        [c.id, SEED_USERS.vega, order.id]),
      /PHYSICIAN_ORDER/
    );
  });

  it("blocks NMT trips beyond the client's weekly authorization", async () => {
    const c = await row<{ id: string; cap: number }>(
      `select id, authorized_nmt_trips_per_week as cap from clients where authorized_nmt_trips_per_week > 0 limit 1`);
    const staff = SEED_USERS.admin; // admin may insert for any client
    const used = await row<{ n: number }>(
      `select count(*)::int n from nmt_trips where client_id = $1 and trip_date = current_date`, [c.id]);
    // trip_date far in the future → a fresh week with zero usage
    const day = "2027-03-03";
    void used;
    for (let i = 0; i < c.cap; i++) {
      await t.queryAs(staff,
        `insert into nmt_trips (client_id, staff_id, trip_date, destination) values ($1, $2, $3, 'Library')`,
        [c.id, staff, day]);
    }
    await t.expectError(
      () => t.queryAs(staff,
        `insert into nmt_trips (client_id, staff_id, trip_date, destination) values ($1, $2, $3, 'Store')`,
        [c.id, staff, day]),
      /NMT_AUTHORIZATION_EXHAUSTED/
    );
  });

  it("allows only one OPEN clock-in per visit (uq_evv_open_per_visit)", async () => {
    const v = await row<{ id: string; lat: number; lng: number }>(
      `select v.id, c.residence_gps[0] as lat, c.residence_gps[1] as lng
       from visits v join clients c on c.id = v.client_id
       where v.staff_id = $1 and c.residence_gps is not null
         and not exists (select 1 from evv_logs e where e.visit_id = v.id)
       order by v.scheduled_start desc limit 1`, [SEED_USERS.vega]);
    expect(v).toBeTruthy();
    const open = `insert into evv_logs (visit_id, clock_in_time, clock_in_gps, verification_method)
                  values ($1, now(), point($2, $3), 'GPS') returning id, clock_in_distance_m`;
    const first = (await t.queryAs<{ id: string; clock_in_distance_m: string }>(SEED_USERS.vega, open, [v.id, v.lat, v.lng]))[0];
    expect(Number(first.clock_in_distance_m)).toBeLessThan(1); // at the residence → distance recorded by the trigger
    await t.expectError(() => t.queryAs(SEED_USERS.vega, open, [v.id, v.lat, v.lng]), /duplicate key|uq_evv_open_per_visit/i);
  });

  it("redacts signature blobs from audit rows", async () => {
    const v = await row<{ id: string; client_id: string }>(
      `select id, client_id from visits where staff_id = $1 order by scheduled_start limit 1`, [SEED_USERS.vega]);
    const note = (await t.queryAs<{ id: string }>(SEED_USERS.vega,
      `insert into progress_notes (visit_id, client_id, staff_id, date, start_time, end_time, client_signature_data, caregiver_signature_data)
       values ($1, $2, $3, '2026-06-03', '09:00', '10:00', 'data:image/png;base64,AAAA', 'data:image/png;base64,BBBB') returning id`,
      [v.id, v.client_id, SEED_USERS.vega]))[0];
    const audit = await row<{ client_sig: string; caregiver_sig: string; performed_by: string }>(
      `select new_values->>'client_signature_data' as client_sig, new_values->>'caregiver_signature_data' as caregiver_sig, performed_by
       from audit_trails where table_name = 'progress_notes' and record_id = $1 and action = 'INSERT'`, [note.id]);
    expect(audit.client_sig).toBe("[signature captured]");
    expect(audit.caregiver_sig).toBe("[signature captured]");
    expect(audit.performed_by).toBe(SEED_USERS.vega);
  });

  it("field staff see only clients on their own visits", async () => {
    const all = await row<{ n: number }>(`select count(*)::int n from clients`);
    const mine = await row<{ n: number }>(
      `select count(distinct client_id)::int n from visits where staff_id = $1`, [SEED_USERS.vega]);
    const seen = (await t.queryAs<{ id: string }>(SEED_USERS.vega, `select id from clients`)).length;
    expect(seen).toBe(mine.n);
    expect(seen).toBeLessThan(all.n);
  });

  it("writes an audit row attributed to the acting user", async () => {
    const ts = (await t.queryAs<{ id: string }>(SEED_USERS.vega,
      `insert into timesheets (staff_id, period_start, period_end)
       values ($1, '2026-07-06', '2026-07-12') returning id`, [SEED_USERS.vega]))[0];
    const audit = await row<{ performed_by: string; action: string }>(
      `select performed_by, action from audit_trails where table_name = 'timesheets' and record_id = $1
       order by "timestamp" desc limit 1`, [ts.id]);
    expect(audit.action).toBe("INSERT");
    expect(audit.performed_by).toBe(SEED_USERS.vega);
  });

  it("field staff cannot touch a medication record administered by someone else", async () => {
    const other = await row<{ id: string }>(
      `select m.id from medication_logs m
       where m.client_id in (select client_id from visits where staff_id = $1)
         and m.administered_by is not null and m.administered_by <> $1 limit 1`, [SEED_USERS.vega]);
    if (!other) return; // seed has no such row — nothing to assert
    await t.expectError(
      () => t.queryAs(SEED_USERS.vega, `update medication_logs set notes = 'x' where id = $1`, [other.id]),
      /row-level security/i
    );
  });
});

describe("0007 — Scheduler column guard on clients", () => {
  const client = "00000000-0000-4000-b000-000000000002"; // synthetic seed row

  it("lets a Scheduler change scheduling and authorization fields", async () => {
    const r = await t.queryAs<{ case_manager_name: string; authorized_scc_hours_per_week: string }>(
      SEED_USERS.scheduler,
      `update clients
         set case_manager_name = 'R. Ortega', authorized_scc_hours_per_week = 6,
             service_plan_end = service_plan_end + 30
       where id = $1 returning case_manager_name, authorized_scc_hours_per_week`, [client]);
    expect(r[0].case_manager_name).toBe("R. Ortega");
    expect(Number(r[0].authorized_scc_hours_per_week)).toBe(6);
  });

  it("blocks a Scheduler from changing identity, clinical or location columns", async () => {
    const attempts = [
      "medicaid_id = 'CO0000001'",
      "first_name = 'Benjamin'",
      "last_name = 'Okafor-Smith'",
      "date_of_birth = '1995-07-03'",
      "active_diagnoses = '[]'::jsonb",
      "insurance_provider = 'Other'",
      "residence_gps = point(0, 0)"
    ];
    for (const set of attempts) {
      await t.expectError(
        () => t.queryAs(SEED_USERS.scheduler, `update clients set ${set} where id = $1`, [client]),
        /RLS_DENIED: schedulers may only edit scheduling fields/
      );
    }
    const still = await row<{ medicaid_id: string; first_name: string }>(
      `select medicaid_id, first_name from clients where id = $1`, [client]);
    expect(still.medicaid_id).toBe("CO5510283");
    expect(still.first_name).toBe("Ben");
  });

  it("does not restrict an Admin", async () => {
    const r = await t.queryAs<{ insurance_provider: string }>(SEED_USERS.admin,
      `update clients set insurance_provider = 'Health First Colorado (verified)' where id = $1
       returning insurance_provider`, [client]);
    expect(r[0].insurance_provider).toBe("Health First Colorado (verified)");
  });

  it("still lets a Scheduler create a client (intake needs the identity fields)", async () => {
    const id = "00000000-0000-4000-b000-0000000000f7";
    const r = await t.queryAs<{ id: string }>(SEED_USERS.scheduler,
      `insert into clients (id, first_name, last_name, medicaid_id, date_of_birth)
       values ($1, 'Test', 'Intake', 'CO0000777', '2000-01-01') returning id`, [id]);
    expect(r[0].id).toBe(id);
    await t.db.query(`delete from clients where id = $1`, [id]);
  });
});
