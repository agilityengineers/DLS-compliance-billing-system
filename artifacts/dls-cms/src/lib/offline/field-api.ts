// lib/offline/field-api.ts — in-process replacement for the deleted Next API
// routes (/api/field/bootstrap, /api/sync, /api/uploads). In this client-only
// demo build the "server" runs in the browser: session is resolved from the
// demo cookie and writes go through the same repo layer + demo-store rules.
import { getSessionContext } from "@/lib/auth/session";
import { listVisits, getClient, getVisit, updateVisitStatus } from "@/lib/data/repo-core";
import {
  appendTimesheetEntry, createDocument, createNmtTrip, getEvvLogForVisit,
  getNoteForVisit, getOrCreateTimesheet, getUserPrefs, hoursBetween,
  listMedications, listNmtTripsForClientWeek, listNotes, serviceCodeForVisitType,
  updateDocumentStatus, updateMedication, upsertEvvLog, upsertJobCoachingLog,
  upsertProgressNote,
} from "@/lib/data/repo-field";
import { getStorageAdapter } from "@/lib/integrations/storage";
import type {
  EvvLog, JobCoachingLog, MedicationLog, NmtTrip, ProgressNote, VisitStatus,
} from "@/lib/supabase/types";
import type { AuditContext } from "@/lib/data/demo/store";

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

// ── bootstrap (mirrors /api/field/bootstrap GET) ──────────────────────────
export async function bootstrap() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) return null;
  const staffId = ctx.effectiveUser.id;
  const today = new Date();
  const from = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7));
  const to = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14));

  const visits = await listVisits({ staffId, from, to });
  const clientIds = Array.from(new Set(visits.map((v) => v.client_id)));
  const clients = (await Promise.all(clientIds.map((id) => getClient(id)))).filter(Boolean);
  const evvLogs = (await Promise.all(visits.map((v) => getEvvLogForVisit(v.id)))).filter(Boolean);
  const notes = await listNotes({ staffId, from, to });
  const meds = await listMedications({
    from: iso(new Date(today.getTime() - 86400000)),
    to: iso(today),
    clientIds,
  });
  const nmtTrips = (
    await Promise.all(clientIds.map((id) => listNmtTripsForClientWeek(id, iso(today))))
  ).flat();
  const prefs = await getUserPrefs(staffId);

  return { visits, clients, evvLogs, notes, meds, nmtTrips, prefs, generated_at: new Date().toISOString() };
}

// ── sync push (mirrors /api/sync POST) ────────────────────────────────────
export type PushOutcome =
  | { kind: "ok" }
  | { kind: "rejected"; error: string }
  | { kind: "transient"; error: string }
  | { kind: "unauthenticated" };

const RULE_CODES = [
  "EVV_GEOFENCE", "NMT_AUTHORIZATION_EXHAUSTED", "NMT_NOT_AUTHORIZED",
  "PHYSICIAN_ORDER_REQUIRED", "PHYSICIAN_ORDER_INACTIVE",
  "CHECK_VIOLATION", "UNIQUE_VIOLATION", "RLS_DENIED",
];

function isRuleError(error: string | undefined): boolean {
  if (!error) return false;
  if (RULE_CODES.some((c) => error.includes(c))) return true;
  return /violates row-level security|check constraint|duplicate key|new row violates/i.test(error);
}

export async function pushMutation(input: {
  table: string;
  op: "insert" | "update";
  payload: Record<string, unknown> & { id: string };
  client_created_at?: string;
}): Promise<PushOutcome> {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) return { kind: "unauthenticated" };
  const { table, payload, client_created_at } = input;
  const isAdmin = ctx.effectiveUser.role === "Admin";

  try {
    let result: { ok: boolean; error?: string } = { ok: true };

    switch (table) {
      case "evv_logs": {
        const log = payload as unknown as EvvLog;
        const server = await getEvvLogForVisit(log.visit_id);
        if (server && server.id === log.id && server.offline_locked && client_created_at) {
          return { kind: "ok" };
        }
        result = await upsertEvvLog(log, ctx.auditCtx, { isAdmin });
        if (result.ok && log.clock_out_time && log.clock_in_time) {
          await appendRouteRow(log, ctx.auditCtx);
        }
        break;
      }
      case "progress_notes": {
        const note = payload as unknown as ProgressNote;
        const server = await getNoteForVisit(note.visit_id);
        const serverClosed =
          server && server.id === note.id &&
          server.caregiver_signature_data && server.client_signature_data;
        if (serverClosed) return { kind: "ok" };
        result = await upsertProgressNote(note, ctx.auditCtx);
        break;
      }
      case "medication_logs": {
        const med = payload as unknown as MedicationLog;
        if (med.status !== "Missed" && !med.administered_by) {
          med.administered_by = ctx.effectiveUser.id;
        }
        result = await updateMedication(med, ctx.auditCtx);
        break;
      }
      case "job_coaching_logs": {
        result = await upsertJobCoachingLog(payload as unknown as JobCoachingLog, ctx.auditCtx);
        break;
      }
      case "visits": {
        const status = payload.status as VisitStatus;
        if (status !== "Cancelled" && status !== "Completed") {
          return { kind: "rejected", error: "Field sync may only cancel or complete visits" };
        }
        if (status === "Cancelled" && !(payload.cancellation_reason as string | undefined)?.trim()) {
          return { kind: "rejected", error: "CHECK_VIOLATION: cancellation requires a reason" };
        }
        result = await updateVisitStatus(
          payload.id, status, ctx.auditCtx, payload.cancellation_reason as string | undefined,
        );
        break;
      }
      case "nmt_trips": {
        const trip = payload as unknown as NmtTrip;
        result = await createNmtTrip(trip, ctx.auditCtx);
        if (result.ok) {
          const monday = mondayOf(trip.trip_date);
          const ts = await getOrCreateTimesheet(trip.staff_id, monday, ctx.auditCtx);
          await appendTimesheetEntry(
            {
              timesheet_id: ts.id, work_date: trip.trip_date, service_code: "T",
              client_id: trip.client_id, start_time: null, end_time: null,
              hours: 0.5, source: "nmt", source_id: trip.id, notes: `NMT: ${trip.destination}`,
            },
            ctx.auditCtx,
          );
        }
        break;
      }
      default:
        return { kind: "rejected", error: `Unknown table: ${table}` };
    }

    if (!result.ok) {
      return isRuleError(result.error)
        ? { kind: "rejected", error: result.error ?? "Rejected" }
        : { kind: "transient", error: result.error ?? "Sync failed" };
    }
    return { kind: "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return isRuleError(msg) ? { kind: "rejected", error: msg } : { kind: "transient", error: msg };
  }
}

async function appendRouteRow(log: EvvLog, auditCtx: AuditContext) {
  const visit = await getVisit(log.visit_id);
  if (!visit) return;
  if (visit.status === "Scheduled" || visit.status === "In_Progress") {
    await updateVisitStatus(visit.id, "Completed", auditCtx);
  }
  const workDate = (log.clock_in_time ?? visit.scheduled_start).slice(0, 10);
  const start = (log.clock_in_time ?? "").slice(11, 16) || null;
  const end = (log.clock_out_time ?? "").slice(11, 16) || null;
  const monday = mondayOf(workDate);
  const ts = await getOrCreateTimesheet(visit.staff_id, monday, auditCtx);
  await appendTimesheetEntry(
    {
      timesheet_id: ts.id, work_date: workDate,
      service_code: serviceCodeForVisitType(visit.visit_type),
      client_id: visit.client_id, start_time: start, end_time: end,
      hours: start && end ? Math.round(hoursBetween(start, end) * 4) / 4 : 0,
      source: "evv", source_id: log.id, notes: null,
    },
    auditCtx,
  );
}

// ── uploads (mirrors /api/uploads POST + PATCH) ───────────────────────────
export async function createUpload(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  clientId?: string | null;
  visitId?: string | null;
}): Promise<{ documentId: string; uploadUrl: string | null; provider: string }> {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) throw new Error("UNAUTHENTICATED");

  const documentId = crypto.randomUUID();
  const adapter = getStorageAdapter();
  const target = await adapter.getUploadTarget({
    fileName: input.fileName,
    contentType: input.contentType,
    documentId,
  });

  const res = await createDocument(
    {
      id: documentId,
      kind: "field_upload",
      client_id: input.clientId ?? null,
      visit_id: input.visitId ?? null,
      uploaded_by: ctx.effectiveUser.id,
      file_name: input.fileName,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      storage_provider: target.provider,
      storage_key: target.storageKey,
      status: "uploading",
      metadata: {},
    },
    ctx.auditCtx,
  );
  if (!res.ok) throw new Error(res.error ?? "Failed to create document");

  return { documentId, uploadUrl: target.uploadUrl, provider: target.provider };
}

export async function confirmUpload(documentId: string, status: "synced" | "error"): Promise<void> {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) throw new Error("UNAUTHENTICATED");
  const res = await updateDocumentStatus(documentId, status, ctx.auditCtx);
  if (!res.ok) throw new Error(res.error ?? "Failed to confirm upload");
}
