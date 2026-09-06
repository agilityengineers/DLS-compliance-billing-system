// lib/api/__tests__/sync-schemas.test.ts — per-table validation of field sync payloads.
import { describe, expect, it } from "vitest";
import { describeIssues, SyncBody } from "../sync-schemas";

const V = "00000000-0000-4000-d000-000000000001";
const C = "00000000-0000-4000-b000-000000000001";
const S = "00000000-0000-4000-a000-000000000003";
const ID = "11111111-1111-4111-8111-111111111111";
const parse = (body: unknown) => SyncBody.safeParse(body);

describe("SyncBody", () => {
  it("accepts the clock-in / clock-out shapes the field app enqueues and strips mirror-only fields", () => {
    const clockIn = parse({ table: "evv_logs", op: "insert", payload: {
      id: ID, visit_id: V, clock_in_time: "2026-09-05T15:01:00.000Z", clock_out_time: null,
      clock_in_gps: { lat: 40.4233, lng: -104.7091 }, clock_out_gps: null,
      verification_method: "GPS", offline_locked: false, manual_adjustment_reason: null
    } });
    expect(clockIn.success).toBe(true);
    const clockOut = parse({ table: "evv_logs", op: "update", payload: {
      id: ID, visit_id: V, clock_in_time: "2026-09-05T15:01:00.000Z", clock_out_time: "2026-09-05T17:03:00.000Z",
      clock_in_gps: { lat: 40.4233, lng: -104.7091 }, clock_out_gps: { lat: 40.4233, lng: -104.7091 },
      verification_method: "GPS", offline_locked: true, manual_adjustment_reason: null,
      synced: 0, clock_in_distance_m: 0 // local mirror / DB-computed — must not pass through
    } });
    expect(clockOut.success).toBe(true);
    if (clockOut.success) {
      expect("synced" in clockOut.data.payload).toBe(false);
      expect("clock_in_distance_m" in clockOut.data.payload).toBe(false);
    }
  });

  it("strips billing and generated columns from a progress note", () => {
    const r = parse({ table: "progress_notes", op: "insert", payload: {
      id: ID, visit_id: V, client_id: C, staff_id: S, date: "2026-09-05", start_time: "09:00", end_time: "10:30",
      specific_services_provided: "Worked on community access.", caregiver_signature_data: "data:image/png;base64,AAAA",
      client_signature_data: "data:image/png;base64,BBBB", client_redirection_logged: false,
      goals_addressed: [{ goal: "Independent transit", progress: "2 of 3 stops" }], cancellation_reason: null,
      billed_at: "2020-01-01T00:00:00Z", claim_export_id: ID, calculated_billing_units: 99
    } });
    expect(r.success).toBe(true);
    if (r.success) {
      const keys = Object.keys(r.data.payload);
      expect(keys).not.toContain("billed_at");
      expect(keys).not.toContain("claim_export_id");
      expect(keys).not.toContain("calculated_billing_units");
    }
  });

  it("lets a device record only the outcome of a dose, never the MAR definition", () => {
    const r = parse({ table: "medication_logs", op: "update", payload: {
      id: ID, client_id: C, client_name: "Alma Reyes", medication_name: "Something else", dosage: "999 mg",
      route: "oral", scheduled_time: "2026-09-05T14:00:00Z", status: "Administered",
      administered_time: "2026-09-05T14:05:00.000Z", administered_by: S, notes: null, synced: 0
    } });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data.payload).sort()).toEqual(["administered_time", "id", "notes", "status"]);
    expect(parse({ table: "medication_logs", op: "update", payload: { id: ID, status: "Held", administered_time: null } }).success).toBe(false);
  });

  it("accepts the NMT trip and cancellation shapes", () => {
    expect(parse({ table: "nmt_trips", op: "insert", payload: {
      id: ID, visit_id: V, client_id: C, staff_id: S, trip_date: "2026-09-05", destination: "Day program", purpose: null, miles: null
    } }).success).toBe(true);
    const cancel = parse({ table: "visits", op: "update", payload: { id: V, status: "Cancelled", cancellation_reason: "Client ill", scheduled_start: "2020-01-01T00:00:00Z" } });
    expect(cancel.success).toBe(true);
    if (cancel.success) expect("scheduled_start" in cancel.data.payload).toBe(false);
    expect(parse({ table: "visits", op: "update", payload: { id: V, status: "Scheduled" } }).success).toBe(false);
  });

  it("rejects unknown tables and malformed ids, dates and coordinates", () => {
    expect(parse({ table: "users", op: "update", payload: { id: ID } }).success).toBe(false);
    expect(parse({ table: "nmt_trips", op: "insert", payload: { id: "not-a-uuid", client_id: C, trip_date: "2026-09-05", destination: "x" } }).success).toBe(false);
    expect(parse({ table: "nmt_trips", op: "insert", payload: { id: ID, client_id: C, trip_date: "09/05/2026", destination: "x" } }).success).toBe(false);
    expect(parse({ table: "evv_logs", op: "insert", payload: { id: ID, visit_id: V, verification_method: "GPS", clock_in_gps: { lat: 400, lng: 0 } } }).success).toBe(false);
  });

  it("describes problems by path only, never by value", () => {
    const r = parse({ table: "nmt_trips", op: "insert", payload: { id: ID, client_id: C, trip_date: "2026-09-05", destination: "", miles: "SECRET-VALUE" } });
    expect(r.success).toBe(false);
    if (!r.success) {
      const text = describeIssues(r.error);
      expect(text).toContain("payload.destination");
      expect(text).toContain("payload.miles");
      expect(text).not.toContain("SECRET-VALUE");
    }
  });
});
