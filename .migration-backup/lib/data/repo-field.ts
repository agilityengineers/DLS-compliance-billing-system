// lib/data/repo-field.ts — EVV logs, progress notes, eMAR, NMT trips,
// documents/uploads, timesheets, user preferences.
import "server-only";

import { isDemoMode } from "@/lib/demo/mode";
import { getDemoStore, DemoRuleError, type AuditContext } from "@/lib/data/demo/store";
import { createDataClient } from "@/lib/supabase/server";
import { normalizeGps } from "./repo-core";
import { calculateBillingUnits } from "@/lib/billing/units";
import type {
  DocumentRow, EvvLog, JobCoachingLog, MedicationLog, NmtTrip, ProgressNote,
  ServiceCode, Timesheet, TimesheetEntry, UserPrefs
} from "@/lib/supabase/types";

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

// ═══ EVV ═════════════════════════════════════════════════════════════════

export async function getEvvLogForVisit(visitId: string): Promise<EvvLog | null> {
  if (isDemoMode()) {
    return getDemoStore().data.evvLogs.find((l) => l.visit_id === visitId) ?? null;
  }
  const { data } = await createDataClient()
    .from("evv_logs").select("*").eq("visit_id", visitId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return {
    ...(data as unknown as EvvLog),
    clock_in_gps: normalizeGps(data.clock_in_gps),
    clock_out_gps: normalizeGps(data.clock_out_gps)
  };
}

export interface EvvLogWithContext extends EvvLog {
  visit_id: string;
  client_name: string;
  staff_name: string;
  visit_type: string;
}

export async function listEvvLogs(filter: { from?: string; to?: string } = {}): Promise<EvvLogWithContext[]> {
  if (isDemoMode()) {
    const { evvLogs, visits, clients, users } = getDemoStore().data;
    return evvLogs
      .filter((l) => {
        const d = (l.clock_in_time ?? "").slice(0, 10);
        if (filter.from && d < filter.from) return false;
        if (filter.to && d > filter.to) return false;
        return true;
      })
      .map((l) => {
        const v = visits.find((x) => x.id === l.visit_id);
        const c = v && clients.find((x) => x.id === v.client_id);
        const s = v && users.find((x) => x.id === v.staff_id);
        return {
          ...l,
          client_name: c ? `${c.first_name} ${c.last_name}` : "—",
          staff_name: s?.full_name ?? "—",
          visit_type: v?.visit_type ?? "—"
        };
      })
      .sort((a, b) => (b.clock_in_time ?? "").localeCompare(a.clock_in_time ?? ""));
  }
  let q = createDataClient()
    .from("evv_logs")
    .select("*, visits(visit_type, clients(first_name,last_name), staff:users!visits_staff_id_fkey(full_name))")
    .order("clock_in_time", { ascending: false })
    .limit(200);
  if (filter.from) q = q.gte("clock_in_time", `${filter.from}T00:00:00`);
  if (filter.to) q = q.lte("clock_in_time", `${filter.to}T23:59:59`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const v = row.visits as {
      visit_type?: string;
      clients?: { first_name?: string; last_name?: string } | null;
      staff?: { full_name?: string } | null;
    } | null;
    return {
      ...(row as unknown as EvvLog),
      clock_in_gps: normalizeGps(row.clock_in_gps),
      clock_out_gps: normalizeGps(row.clock_out_gps),
      client_name: v?.clients ? `${v.clients.first_name} ${v.clients.last_name}` : "—",
      staff_name: v?.staff?.full_name ?? "—",
      visit_type: v?.visit_type ?? "—"
    };
  });
}

/**
 * Server-side EVV write (used by /api/sync and the manual-adjustment action).
 * The geofence/uniqueness/manual rules live in the DB (migration 0002) and in
 * the demo store — rejections surface with their rule codes.
 */
export async function upsertEvvLog(
  log: EvvLog,
  ctx: AuditContext,
  opts: { isAdmin: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    try {
      getDemoStore().upsertEvvLog({ ...log }, ctx, opts);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }
  const payload = {
    ...log,
    clock_in_gps: log.clock_in_gps ? `(${log.clock_in_gps.lat},${log.clock_in_gps.lng})` : null,
    clock_out_gps: log.clock_out_gps ? `(${log.clock_out_gps.lat},${log.clock_out_gps.lng})` : null
  };
  const { error } = await createDataClient().from("evv_logs").upsert(payload, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ progress notes + job coaching ════════════════════════════════════════

export interface NoteWithContext extends ProgressNote {
  client_name: string;
  staff_name: string;
  medicaid_id: string;
  visit_type: string;
}

export async function listNotes(filter: {
  from?: string; to?: string; staffId?: string; clientId?: string; unbilledOnly?: boolean;
} = {}): Promise<NoteWithContext[]> {
  if (isDemoMode()) {
    const { progressNotes, visits, clients, users } = getDemoStore().data;
    return progressNotes
      .filter((n) => {
        if (filter.from && n.date < filter.from) return false;
        if (filter.to && n.date > filter.to) return false;
        if (filter.staffId && n.staff_id !== filter.staffId) return false;
        if (filter.clientId && n.client_id !== filter.clientId) return false;
        if (filter.unbilledOnly && n.billed_at) return false;
        return true;
      })
      .map((n) => {
        const c = clients.find((x) => x.id === n.client_id);
        const s = users.find((x) => x.id === n.staff_id);
        const v = visits.find((x) => x.id === n.visit_id);
        return {
          ...n,
          calculated_billing_units: n.calculated_billing_units ??
            calculateBillingUnits(`${n.date}T${n.start_time}`, `${n.date}T${n.end_time}`),
          calculated_billable_hours: n.calculated_billable_hours ?? hoursBetween(n.start_time, n.end_time),
          client_name: c ? `${c.first_name} ${c.last_name}` : "—",
          medicaid_id: c?.medicaid_id ?? "—",
          staff_name: s?.full_name ?? "—",
          visit_type: v?.visit_type ?? "SCC"
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  let q = createDataClient()
    .from("progress_notes")
    .select("*, clients(first_name,last_name,medicaid_id), staff:users!progress_notes_staff_id_fkey(full_name), visits(visit_type)")
    .order("date", { ascending: false })
    .limit(300);
  if (filter.from) q = q.gte("date", filter.from);
  if (filter.to) q = q.lte("date", filter.to);
  if (filter.staffId) q = q.eq("staff_id", filter.staffId);
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  if (filter.unbilledOnly) q = q.is("billed_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const c = row.clients as { first_name?: string; last_name?: string; medicaid_id?: string } | null;
    const s = row.staff as { full_name?: string } | null;
    const v = row.visits as { visit_type?: string } | null;
    return {
      ...(row as unknown as ProgressNote),
      client_name: c ? `${c.first_name} ${c.last_name}` : "—",
      medicaid_id: c?.medicaid_id ?? "—",
      staff_name: s?.full_name ?? "—",
      visit_type: v?.visit_type ?? "SCC"
    };
  });
}

export async function getNoteForVisit(visitId: string): Promise<ProgressNote | null> {
  if (isDemoMode()) {
    return getDemoStore().data.progressNotes.find((n) => n.visit_id === visitId) ?? null;
  }
  const { data } = await createDataClient()
    .from("progress_notes").select("*").eq("visit_id", visitId).maybeSingle();
  return (data as ProgressNote) ?? null;
}

export async function upsertProgressNote(
  note: ProgressNote,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    try {
      getDemoStore().upsertProgressNote({ ...note }, ctx);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }
  // calculated_* are DB generated columns — never write them.
  const { calculated_billable_hours, calculated_billing_units, ...payload } = note;
  void calculated_billable_hours; void calculated_billing_units;
  const { error } = await createDataClient().from("progress_notes").upsert(payload, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getJobCoachingLog(progressNoteId: string): Promise<JobCoachingLog | null> {
  if (isDemoMode()) {
    return getDemoStore().data.jobCoachingLogs.find((j) => j.progress_note_id === progressNoteId) ?? null;
  }
  const { data } = await createDataClient()
    .from("job_coaching_logs").select("*").eq("progress_note_id", progressNoteId).maybeSingle();
  return (data as JobCoachingLog) ?? null;
}

export async function upsertJobCoachingLog(
  log: JobCoachingLog,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const existing = store.data.jobCoachingLogs.find((j) => j.id === log.id);
    if (existing) {
      const old = { ...existing };
      Object.assign(existing, log);
      store.audit("job_coaching_logs", "UPDATE", log.id, old, { ...existing }, ctx);
    } else {
      store.data.jobCoachingLogs.push({ ...log });
      store.audit("job_coaching_logs", "INSERT", log.id, null, { ...log }, ctx);
    }
    return { ok: true };
  }
  const { error } = await createDataClient().from("job_coaching_logs").upsert(log, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ eMAR ════════════════════════════════════════════════════════════════

export interface MedWithClient extends MedicationLog {
  client_name: string;
}

export async function listMedications(filter: {
  from?: string; to?: string; status?: string; clientIds?: string[];
} = {}): Promise<MedWithClient[]> {
  if (isDemoMode()) {
    const { medicationLogs, clients } = getDemoStore().data;
    return medicationLogs
      .filter((m) => {
        const d = m.scheduled_time.slice(0, 10);
        if (filter.from && d < filter.from) return false;
        if (filter.to && d > filter.to) return false;
        if (filter.status && m.status !== filter.status) return false;
        if (filter.clientIds && !filter.clientIds.includes(m.client_id)) return false;
        return true;
      })
      .map((m) => {
        const c = clients.find((x) => x.id === m.client_id);
        return { ...m, client_name: c ? `${c.first_name} ${c.last_name}` : "—" };
      })
      .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  }
  let q = createDataClient()
    .from("medication_logs")
    .select("*, clients(first_name,last_name)")
    .order("scheduled_time")
    .limit(300);
  if (filter.from) q = q.gte("scheduled_time", `${filter.from}T00:00:00`);
  if (filter.to) q = q.lte("scheduled_time", `${filter.to}T23:59:59`);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.clientIds) q = q.in("client_id", filter.clientIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const c = row.clients as { first_name?: string; last_name?: string } | null;
    return {
      ...(row as unknown as MedicationLog),
      client_name: c ? `${c.first_name} ${c.last_name}` : "—"
    };
  });
}

export async function updateMedication(
  med: MedicationLog,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    try {
      getDemoStore().updateMedication({ ...med }, ctx);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }
  const { error } = await createDataClient().from("medication_logs").upsert(med, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ NMT trips ═══════════════════════════════════════════════════════════

export async function listNmtTripsForClientWeek(clientId: string, dateInWeek: string): Promise<NmtTrip[]> {
  const d = new Date(`${dateInWeek}T12:00:00`);
  const sunday = new Date(d);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(saturday.getDate() + 6);
  const from = sunday.toISOString().slice(0, 10);
  const to = saturday.toISOString().slice(0, 10);

  if (isDemoMode()) {
    return getDemoStore().data.nmtTrips.filter(
      (t) => t.client_id === clientId && t.trip_date >= from && t.trip_date <= to
    );
  }
  const { data, error } = await createDataClient()
    .from("nmt_trips").select("*")
    .eq("client_id", clientId).gte("trip_date", from).lte("trip_date", to);
  if (error) throw new Error(error.message);
  return (data ?? []) as NmtTrip[];
}

/** Log an NMT trip. The per-client weekly cap is enforced by the DB trigger
 *  (fn_enforce_nmt_weekly_cap) / demo rule — NMT_AUTHORIZATION_EXHAUSTED. */
export async function createNmtTrip(
  trip: Omit<NmtTrip, "id"> & { id?: string },
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  const full: NmtTrip = { ...trip, id: trip.id ?? crypto.randomUUID() };
  if (isDemoMode()) {
    try {
      getDemoStore().insertNmtTrip(full, ctx);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }
  const { error } = await createDataClient().from("nmt_trips").insert(full);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ documents / uploads ══════════════════════════════════════════════════

export async function listDocuments(filter: {
  kind?: string; clientId?: string; uploadedBy?: string;
} = {}): Promise<(DocumentRow & { client_name: string | null; uploader_name: string | null })[]> {
  if (isDemoMode()) {
    const { documents, clients, users } = getDemoStore().data;
    return documents
      .filter((d) => {
        if (filter.kind && d.kind !== filter.kind) return false;
        if (filter.clientId && d.client_id !== filter.clientId) return false;
        if (filter.uploadedBy && d.uploaded_by !== filter.uploadedBy) return false;
        return true;
      })
      .map((d) => {
        const c = clients.find((x) => x.id === d.client_id);
        const u = users.find((x) => x.id === d.uploaded_by);
        return {
          ...d,
          client_name: c ? `${c.first_name} ${c.last_name}` : null,
          uploader_name: u?.full_name ?? null
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  let q = createDataClient()
    .from("documents")
    .select("*, clients(first_name,last_name), uploader:users!documents_uploaded_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  if (filter.uploadedBy) q = q.eq("uploaded_by", filter.uploadedBy);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const c = row.clients as { first_name?: string; last_name?: string } | null;
    const u = row.uploader as { full_name?: string } | null;
    return {
      ...(row as unknown as DocumentRow),
      client_name: c ? `${c.first_name} ${c.last_name}` : null,
      uploader_name: u?.full_name ?? null
    };
  });
}

export async function createDocument(
  doc: Omit<DocumentRow, "id" | "created_at"> & { id?: string },
  ctx: AuditContext
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const full: DocumentRow = {
    ...doc,
    id: doc.id ?? crypto.randomUUID(),
    created_at: new Date().toISOString()
  };
  if (isDemoMode()) {
    const store = getDemoStore();
    store.data.documents.push(full);
    store.audit("documents", "INSERT", full.id, null, { ...full }, ctx);
    return { ok: true, id: full.id };
  }
  const { created_at, ...payload } = full;
  void created_at;
  const { error } = await createDataClient().from("documents").insert(payload);
  return error ? { ok: false, error: error.message } : { ok: true, id: full.id };
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentRow["status"],
  ctx: AuditContext,
  storageKey?: string
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const d = store.data.documents.find((x) => x.id === id);
    if (!d) return { ok: false, error: "Document not found." };
    const old = { ...d };
    d.status = status;
    if (storageKey) d.storage_key = storageKey;
    store.audit("documents", "UPDATE", id, old, { ...d }, ctx);
    return { ok: true };
  }
  const patch: Record<string, unknown> = { status };
  if (storageKey) patch.storage_key = storageKey;
  const { error } = await createDataClient().from("documents").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ timesheets (route record) ════════════════════════════════════════════

export async function getOrCreateTimesheet(
  staffId: string,
  weekMondayIso: string,
  ctx: AuditContext
): Promise<Timesheet> {
  const periodEnd = addDaysIso(weekMondayIso, 6);
  if (isDemoMode()) {
    const store = getDemoStore();
    let ts = store.data.timesheets.find((t) => t.staff_id === staffId && t.period_start === weekMondayIso);
    if (!ts) {
      ts = {
        id: crypto.randomUUID(), staff_id: staffId,
        period_start: weekMondayIso, period_end: periodEnd,
        status: "open", submitted_at: null
      };
      store.data.timesheets.push(ts);
      store.audit("timesheets", "INSERT", ts.id, null, { ...ts }, ctx);
    }
    return ts;
  }
  const db = createDataClient();
  const { data: existing } = await db
    .from("timesheets").select("*")
    .eq("staff_id", staffId).eq("period_start", weekMondayIso).maybeSingle();
  if (existing) return existing as Timesheet;
  const row = {
    id: crypto.randomUUID(), staff_id: staffId,
    period_start: weekMondayIso, period_end: periodEnd, status: "open" as const, submitted_at: null
  };
  const { error } = await db.from("timesheets").insert(row);
  if (error) throw new Error(error.message);
  return row;
}

export async function listTimesheetEntries(timesheetId: string): Promise<TimesheetEntry[]> {
  if (isDemoMode()) {
    return getDemoStore().data.timesheetEntries
      .filter((e) => e.timesheet_id === timesheetId)
      .sort((a, b) => a.work_date.localeCompare(b.work_date));
  }
  const { data, error } = await createDataClient()
    .from("timesheet_entries").select("*").eq("timesheet_id", timesheetId).order("work_date");
  if (error) throw new Error(error.message);
  return (data ?? []) as TimesheetEntry[];
}

export async function listTimesheets(filter: {
  staffId?: string; periodStartFrom?: string; periodStartTo?: string;
} = {}): Promise<Timesheet[]> {
  if (isDemoMode()) {
    return getDemoStore().data.timesheets.filter((t) => {
      if (filter.staffId && t.staff_id !== filter.staffId) return false;
      if (filter.periodStartFrom && t.period_start < filter.periodStartFrom) return false;
      if (filter.periodStartTo && t.period_start > filter.periodStartTo) return false;
      return true;
    });
  }
  let q = createDataClient().from("timesheets").select("*");
  if (filter.staffId) q = q.eq("staff_id", filter.staffId);
  if (filter.periodStartFrom) q = q.gte("period_start", filter.periodStartFrom);
  if (filter.periodStartTo) q = q.lte("period_start", filter.periodStartTo);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Timesheet[];
}

/** Append a route-record row (from an EVV clock-out, an NMT trip, or manual).
 *  Idempotent per source record (uq_ts_entries_source). */
export async function appendTimesheetEntry(
  entry: Omit<TimesheetEntry, "id"> & { id?: string },
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  const full: TimesheetEntry = { ...entry, id: entry.id ?? crypto.randomUUID() };
  if (isDemoMode()) {
    const store = getDemoStore();
    if (
      full.source_id &&
      store.data.timesheetEntries.some((e) => e.source === full.source && e.source_id === full.source_id)
    ) {
      return { ok: true }; // already appended from this source — idempotent
    }
    store.data.timesheetEntries.push(full);
    store.audit("timesheet_entries", "INSERT", full.id, null, { ...full }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient()
    .from("timesheet_entries")
    .upsert(full, { onConflict: "source,source_id", ignoreDuplicates: true });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Submit the route record — flips the payroll "all notes in?" input. */
export async function submitTimesheet(
  timesheetId: string,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const ts = store.data.timesheets.find((t) => t.id === timesheetId);
    if (!ts) return { ok: false, error: "Timesheet not found." };
    const old = { ...ts };
    ts.status = "submitted";
    ts.submitted_at = new Date().toISOString();
    store.audit("timesheets", "UPDATE", timesheetId, old, { ...ts }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient()
    .from("timesheets")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", timesheetId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ user preferences ═════════════════════════════════════════════════════

export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  if (isDemoMode()) {
    return (
      getDemoStore().data.userPrefs.find((p) => p.user_id === userId) ??
      { user_id: userId, field_home: "visits", prefs: {} }
    );
  }
  const { data } = await createDataClient().from("user_prefs").select("*").eq("user_id", userId).maybeSingle();
  return (data as UserPrefs) ?? { user_id: userId, field_home: "visits", prefs: {} };
}

export async function setFieldHomePref(
  userId: string,
  fieldHome: "visits" | "dashboard"
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const existing = store.data.userPrefs.find((p) => p.user_id === userId);
    if (existing) existing.field_home = fieldHome;
    else store.data.userPrefs.push({ user_id: userId, field_home: fieldHome, prefs: {} });
    return { ok: true };
  }
  const { error } = await createDataClient()
    .from("user_prefs")
    .upsert({ user_id: userId, field_home: fieldHome }, { onConflict: "user_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ helpers ══════════════════════════════════════════════════════════════

export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

export function serviceCodeForVisitType(visitType: string): ServiceCode {
  switch (visitType) {
    case "Job_Coaching": return "JC";
    case "Day_Habilitation": return "DH";
    default: return "SCC";
  }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export { DemoRuleError };
