// lib/data/demo/store.ts — in-memory demo database (server-side singleton).
//
// DEMO: this store stands in for Postgres when demo mode is active. It
// deliberately re-implements the DATABASE-LEVEL rule enforcement from
// supabase/migrations/* with the SAME error codes, so the demo shows exactly
// what production rejects (geofence, NMT cap, physician order, manual-EVV,
// eMAR administered_time) — and it auto-writes audit rows like the DB
// trigger, including impersonation attribution and signature redaction.
//
// Data resets on server restart (by design — synthetic only, no PHI).

import { buildDemoDataset, type DemoDataset, sundayOfWeek, isoDate } from "./dataset";
import { haversineMeters } from "@/lib/evv/gps";
import type {
  AuditRow, EvvLog, MedicationLog, NmtTrip, ProgressNote, Visit
} from "@/lib/supabase/types";

export class DemoRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

export interface AuditContext {
  performedBy: string | null;
  impersonating: string | null;
}

const SYSTEM_CTX: AuditContext = { performedBy: null, impersonating: null };

function redact(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null;
  const out = { ...payload };
  for (const k of ["client_signature_data", "caregiver_signature_data"]) {
    if (out[k]) out[k] = "[signature captured]";
  }
  return out;
}

export class DemoStore {
  data: DemoDataset;

  constructor() {
    this.data = buildDemoDataset();
  }

  reset() {
    this.data = buildDemoDataset();
  }

  // ── audit (mirrors fn_audit_row_change) ────────────────────────────────
  audit(
    table: string,
    action: AuditRow["action"],
    recordId: string | null,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown> | null,
    ctx: AuditContext = SYSTEM_CTX
  ) {
    this.data.auditTrail.push({
      id: crypto.randomUUID(),
      table_name: table,
      record_id: recordId,
      action,
      performed_by: ctx.performedBy,
      impersonating: ctx.impersonating,
      timestamp: new Date().toISOString(),
      old_values: redact(oldValues),
      new_values: redact(newValues)
    });
  }

  // ── rule: geofence (mirrors fn_enforce_evv_geofence) ───────────────────
  private enforceGeofence(log: EvvLog, prev: EvvLog | undefined) {
    if (log.verification_method !== "GPS") return;
    const visit = this.data.visits.find((v) => v.id === log.visit_id);
    const client = visit && this.data.clients.find((c) => c.id === visit.client_id);
    if (!client?.residence_gps) return;
    const radius = Number(this.data.appSettings.evv_geofence_radius_m ?? 150);

    const check = (gps: { lat: number; lng: number } | null, prevGps: { lat: number; lng: number } | null, which: "in" | "out") => {
      if (!gps) return undefined;
      if (prevGps && gps.lat === prevGps.lat && gps.lng === prevGps.lng) return undefined;
      const d = haversineMeters(gps, client.residence_gps!);
      if (d > radius) {
        throw new DemoRuleError("EVV_GEOFENCE", `clock-${which} ${Math.round(d)} m from client residence exceeds ${radius} m`);
      }
      return Math.round(d * 10) / 10;
    };
    const din = check(log.clock_in_gps, prev?.clock_in_gps ?? null, "in");
    if (din !== undefined) log.clock_in_distance_m = din;
    const dout = check(log.clock_out_gps, prev?.clock_out_gps ?? null, "out");
    if (dout !== undefined) log.clock_out_distance_m = dout;
  }

  /** Upsert an EVV log with full rule enforcement. */
  upsertEvvLog(log: EvvLog, ctx: AuditContext, opts: { isAdmin: boolean }) {
    // Manual is Admin-only (RLS in production) and requires a reason (CHECK).
    if (log.verification_method === "Manual") {
      if (!opts.isAdmin) throw new DemoRuleError("RLS_DENIED", "manual EVV entries are Admin-only");
      if (!log.manual_adjustment_reason?.trim()) {
        throw new DemoRuleError("CHECK_VIOLATION", "manual_adjustment_reason is required for manual EVV entries");
      }
    }
    const existing = this.data.evvLogs.find((l) => l.id === log.id);
    // Unique open log per visit (uq_evv_open_per_visit).
    if (!log.clock_out_time) {
      const otherOpen = this.data.evvLogs.find(
        (l) => l.visit_id === log.visit_id && !l.clock_out_time && l.id !== log.id
      );
      if (otherOpen) throw new DemoRuleError("UNIQUE_VIOLATION", "an open EVV log already exists for this visit");
    }
    this.enforceGeofence(log, existing);

    if (existing) {
      const old = { ...existing };
      Object.assign(existing, log);
      this.audit("evv_logs", "UPDATE", log.id, old, { ...existing }, ctx);
      return existing;
    }
    this.data.evvLogs.push(log);
    this.audit("evv_logs", "INSERT", log.id, null, { ...log }, ctx);
    return log;
  }

  // ── rule: physician order (mirrors fn_visit_requires_active_order) ─────
  enforceActiveOrder(visit: Visit) {
    if (visit.status === "Cancelled") return;
    if (!visit.physician_order_id) {
      throw new DemoRuleError("PHYSICIAN_ORDER_REQUIRED", "visits cannot be saved without an active physician order");
    }
    const date = visit.scheduled_start.slice(0, 10);
    const po = this.data.physicianOrders.find((o) => o.id === visit.physician_order_id);
    const active = po && po.client_id === visit.client_id &&
      po.effective_date <= date && (!po.expiration_date || po.expiration_date >= date);
    if (!active) {
      throw new DemoRuleError("PHYSICIAN_ORDER_INACTIVE", `order is missing, for another client, or not active on ${date}`);
    }
  }

  upsertVisit(visit: Visit, ctx: AuditContext) {
    this.enforceActiveOrder(visit);
    const existing = this.data.visits.find((v) => v.id === visit.id);
    if (existing) {
      const old = { ...existing };
      Object.assign(existing, visit);
      this.audit("visits", "UPDATE", visit.id, old, { ...existing }, ctx);
      return existing;
    }
    this.data.visits.push(visit);
    this.audit("visits", "INSERT", visit.id, null, { ...visit }, ctx);
    return visit;
  }

  // ── rule: NMT weekly cap (mirrors fn_enforce_nmt_weekly_cap) ────────────
  insertNmtTrip(trip: NmtTrip, ctx: AuditContext) {
    const client = this.data.clients.find((c) => c.id === trip.client_id);
    const authorized = client?.authorized_nmt_trips_per_week ?? 0;
    if (authorized <= 0) throw new DemoRuleError("NMT_NOT_AUTHORIZED", "client has no NMT trip authorization");

    const weekStart = sundayOfWeek(new Date(`${trip.trip_date}T12:00:00`));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const inWeek = (d: string) => d >= isoDate(weekStart) && d <= isoDate(weekEnd);
    const used = this.data.nmtTrips.filter(
      (t) => t.client_id === trip.client_id && inWeek(t.trip_date) && t.id !== trip.id
    ).length;
    if (used + 1 > authorized) {
      throw new DemoRuleError("NMT_AUTHORIZATION_EXHAUSTED", `${used} of ${authorized} weekly trips already used for this client`);
    }
    this.data.nmtTrips.push(trip);
    this.audit("nmt_trips", "INSERT", trip.id, null, { ...trip }, ctx);
    return trip;
  }

  // ── rule: eMAR administered_time (mirrors the CHECK constraint) ────────
  updateMedication(update: MedicationLog, ctx: AuditContext) {
    if (update.status === "Administered" && !update.administered_time) {
      throw new DemoRuleError("CHECK_VIOLATION", "'Administered' requires an administered_time");
    }
    const existing = this.data.medicationLogs.find((m) => m.id === update.id);
    if (!existing) {
      this.data.medicationLogs.push(update);
      this.audit("medication_logs", "INSERT", update.id, null, { ...update }, ctx);
      return update;
    }
    const old = { ...existing };
    Object.assign(existing, update);
    this.audit("medication_logs", "UPDATE", update.id, old, { ...existing }, ctx);
    return existing;
  }

  upsertProgressNote(note: ProgressNote, ctx: AuditContext) {
    const existing = this.data.progressNotes.find((n) => n.id === note.id);
    if (existing) {
      const old = { ...existing };
      Object.assign(existing, note);
      this.audit("progress_notes", "UPDATE", note.id, old, { ...existing }, ctx);
      return existing;
    }
    this.data.progressNotes.push(note);
    this.audit("progress_notes", "INSERT", note.id, null, { ...note }, ctx);
    return note;
  }
}

// globalThis cache: survives Next.js dev HMR; resets on server restart.
const g = globalThis as unknown as { __dlsDemoStore?: DemoStore };

export function getDemoStore(): DemoStore {
  if (!g.__dlsDemoStore) g.__dlsDemoStore = new DemoStore();
  return g.__dlsDemoStore;
}
