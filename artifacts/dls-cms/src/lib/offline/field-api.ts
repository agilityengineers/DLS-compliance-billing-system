// lib/offline/field-api.ts — in-process replacement for the deleted Next API
// routes (/api/field/bootstrap, /api/sync, /api/uploads). In this client-only
// demo build the "server" runs in the browser: session is resolved from the
// demo cookie and writes go through the same repo layer + demo-store rules.
import { getSessionContext } from "@/lib/auth/session";
import { listVisits, getClient, getVisit, updateVisitStatus } from "@/lib/data/repo-core";
import {
  appendTimesheetEntry, createDocument, createNmtTrip, getEvvLogForVisit,
  getMedicationLog, getNoteForVisit, getOrCreateTimesheet, getProgressNote, getUserPrefs,
  isClientAssignedToStaff, listMedications, listNmtTripsForClientWeek, listNotes, serviceCodeForVisitType,
  updateDocumentStatus, updateMedication, upsertEvvLog, upsertJobCoachingLog,
  upsertProgressNote,
} from "@/lib/data/repo-field";
import { getStorageAdapter } from "@/lib/integrations/storage";
import type {
  EvvLog, JobCoachingLog, MedicationLog, NmtTrip, ProgressNote, VisitStatus,
} from "@/lib/supabase/types";
import type { AuditContext } from "@/lib/data/demo/store";
import type { FeatureKey } from "@workspace/features";
import {
  agencyAddDays,
  agencyMondayOf,
  agencyTodayIso,
  hoursBetweenUtc,
  utcIsoToAgencyDate,
  utcIsoToAgencyTime,
} from "@workspace/time";
import { SyncBody, describeIssues } from "@/lib/api/sync-schemas";
import { toPublicError } from "@/lib/api/errors";

// ── bootstrap (mirrors /api/field/bootstrap GET) ──────────────────────────
export async function bootstrap() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) return null;
  const staffId = ctx.effectiveUser.id;
  const today = agencyTodayIso();
  const from = agencyAddDays(today, -7);
  const to = agencyAddDays(today, 14);

  const visits = await listVisits({ staffId, from, to });
  const clientIds = Array.from(new Set(visits.map((v) => v.client_id)));
  const clients = (await Promise.all(clientIds.map((id) => getClient(id)))).filter(Boolean);
  const evvLogs = (await Promise.all(visits.map((v) => getEvvLogForVisit(v.id)))).filter(Boolean);
  const notes = await listNotes({ staffId, from, to });
  const meds = await listMedications({
    from: agencyAddDays(today, -1),
    to: today,
    clientIds,
  });
  const nmtTrips = (
    await Promise.all(clientIds.map((id) => listNmtTripsForClientWeek(id, today)))
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

export async function pushMutation(input: {
  table: string;
  op: "insert" | "update";
  payload: Record<string, unknown> & { id: string };
  client_created_at?: string;
}): Promise<PushOutcome> {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) return { kind: "unauthenticated" };
  const parsed = SyncBody.safeParse(input);
  if (!parsed.success) {
    return { kind: "rejected", error: `INVALID_PAYLOAD: ${describeIssues(parsed.error)}` };
  }
  const { table, payload, client_created_at } = parsed.data;
  const me = ctx.effectiveUser.id;
  const isAdmin = ctx.effectiveUser.role === "Admin";
  const isField = ctx.effectiveUser.role === "Field_Staff";

  // Feature switches are enforced HERE too, not only in the UI: a queued
  // write for a capability that is off for this role is rejected (terminal),
  // exactly as the production sync route returns 403.
  const gate: Partial<Record<typeof table, FeatureKey>> = {
    evv_logs: "evv.clock",
    medication_logs: "emar.medications",
    nmt_trips: "field.nmt",
    progress_notes: "notes.progress",
  };
  const required = gate[table];
  if (required && !ctx.features.has(required)) {
    return { kind: "rejected", error: `FEATURE_DISABLED: ${required} is not enabled for your role` };
  }

  try {
    let result: { ok: boolean; error?: string } = { ok: true };

    switch (table) {
      case "evv_logs": {
        const log = payload as unknown as EvvLog;
        const server = await getEvvLogForVisit(log.visit_id);
        if (server && server.id === log.id && server.offline_locked && client_created_at) {
          return { kind: "ok" };
        }
        if (isField) {
          const visit = await getVisit(log.visit_id);
          if (!visit || visit.staff_id !== me) {
            return { kind: "rejected", error: "RLS_DENIED: this visit is not assigned to you" };
          }
        }
        result = await upsertEvvLog(log, ctx.auditCtx, { isAdmin });
        if (result.ok && log.clock_out_time && log.clock_in_time) {
          const routeRow = await appendRouteRow(log, ctx.auditCtx);
          if (!routeRow.ok) {
            return { kind: "transient", error: `TIMESHEET_APPEND_FAILED: ${routeRow.error}` };
          }
        }
        break;
      }
      case "progress_notes": {
        if (payload.staff_id && payload.staff_id !== me) {
          return { kind: "rejected", error: "RLS_DENIED: note names another staff member" };
        }
        const visit = await getVisit(payload.visit_id);
        if (!visit) return { kind: "rejected", error: "RLS_DENIED: visit not found" };
        if (isField && visit.staff_id !== me) {
          return { kind: "rejected", error: "RLS_DENIED: this visit is not assigned to you" };
        }
        if (visit.client_id !== payload.client_id) {
          return { kind: "rejected", error: "RLS_DENIED: client does not match the visit" };
        }
        const note = { ...payload, staff_id: me } as unknown as ProgressNote;
        const server = await getNoteForVisit(note.visit_id);
        const serverClosed =
          server && server.id === note.id &&
          server.caregiver_signature_data && server.client_signature_data;
        if (serverClosed) return { kind: "ok" };
        result = await upsertProgressNote(note, ctx.auditCtx);
        // With EVV clock-in switched off there is no clock-out to complete the
        // visit, so a signed note completes it instead.
        if (
          result.ok && !ctx.features.has("evv.clock") &&
          note.caregiver_signature_data && note.client_signature_data &&
          (visit.status === "Scheduled" || visit.status === "In_Progress")
        ) {
          const flipped = await updateVisitStatus(visit.id, "Completed", ctx.auditCtx);
          if (!flipped.ok) return { kind: "transient", error: flipped.error ?? "could not mark the visit Completed" };
        }
        break;
      }
      case "medication_logs": {
        const current = await getMedicationLog(payload.id);
        if (!current) return { kind: "rejected", error: "RLS_DENIED: medication record not found" };
        if (isField && !(await isClientAssignedToStaff(current.client_id, me))) {
          return { kind: "rejected", error: "RLS_DENIED: this client is not assigned to you" };
        }
        const med: MedicationLog = {
          ...current,
          status: payload.status,
          administered_time: payload.administered_time,
          notes: payload.notes === undefined ? current.notes : payload.notes,
          administered_by: payload.status === "Missed" ? null : me,
        };
        result = await updateMedication(med, ctx.auditCtx);
        break;
      }
      case "job_coaching_logs": {
        if (isField) {
          const parent = await getProgressNote(payload.progress_note_id);
          if (!parent || parent.staff_id !== me) {
            return { kind: "rejected", error: "RLS_DENIED: the parent note is not yours" };
          }
        }
        result = await upsertJobCoachingLog(payload as unknown as JobCoachingLog, ctx.auditCtx);
        break;
      }
      case "visits": {
        if (isField) {
          const visit = await getVisit(payload.id);
          if (!visit || visit.staff_id !== me) {
            return { kind: "rejected", error: "RLS_DENIED: this visit is not assigned to you" };
          }
        }
        const status = payload.status as VisitStatus;
        if (status === "Cancelled" && !(payload.cancellation_reason as string | undefined)?.trim()) {
          return { kind: "rejected", error: "CHECK_VIOLATION: cancellation requires a reason" };
        }
        result = await updateVisitStatus(
          payload.id, status, ctx.auditCtx, payload.cancellation_reason as string | undefined,
        );
        break;
      }
      case "nmt_trips": {
        if (payload.staff_id && payload.staff_id !== me) {
          return { kind: "rejected", error: "RLS_DENIED: trip names another staff member" };
        }
        if (isField && !(await isClientAssignedToStaff(payload.client_id, me))) {
          return { kind: "rejected", error: "RLS_DENIED: this client is not assigned to you" };
        }
        const trip = { ...payload, staff_id: me } as unknown as NmtTrip;
        result = await createNmtTrip(trip, ctx.auditCtx);
        if (result.ok) {
          const monday = agencyMondayOf(trip.trip_date);
          const ts = await getOrCreateTimesheet(trip.staff_id, monday, ctx.auditCtx);
          const appended = await appendTimesheetEntry(
            {
              timesheet_id: ts.id, work_date: trip.trip_date, service_code: "T",
              client_id: trip.client_id, start_time: null, end_time: null,
              hours: 0.5, source: "nmt", source_id: trip.id, notes: `NMT: ${trip.destination}`,
            },
            ctx.auditCtx,
          );
          if (!appended.ok) {
            return { kind: "transient", error: `TIMESHEET_APPEND_FAILED: ${appended.error}` };
          }
        }
        break;
      }
      default:
        return { kind: "rejected", error: `Unknown table: ${table}` };
    }

    if (!result.ok) {
      const pub = toPublicError(result.error);
      return pub.status < 500
        ? { kind: "rejected", error: pub.error }
        : { kind: "transient", error: pub.error };
    }
    return { kind: "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pub = toPublicError(msg);
    return pub.status < 500
      ? { kind: "rejected", error: pub.error }
      : { kind: "transient", error: pub.error };
  }
}

async function appendRouteRow(
  log: EvvLog,
  auditCtx: AuditContext,
): Promise<{ ok: boolean; error?: string }> {
  const visit = await getVisit(log.visit_id);
  if (!visit) return { ok: false, error: `visit ${log.visit_id} not found` };
  if (visit.status === "Scheduled" || visit.status === "In_Progress") {
    const flipped = await updateVisitStatus(visit.id, "Completed", auditCtx);
    if (!flipped.ok) {
      return { ok: false, error: flipped.error ?? "could not mark the visit Completed" };
    }
  }
  const workDate = utcIsoToAgencyDate(log.clock_in_time ?? visit.scheduled_start);
  const start = log.clock_in_time ? utcIsoToAgencyTime(log.clock_in_time) : null;
  const end = log.clock_out_time ? utcIsoToAgencyTime(log.clock_out_time) : null;
  const monday = agencyMondayOf(workDate);
  const ts = await getOrCreateTimesheet(visit.staff_id, monday, auditCtx);
  return appendTimesheetEntry(
    {
      timesheet_id: ts.id, work_date: workDate,
      service_code: serviceCodeForVisitType(visit.visit_type),
      client_id: visit.client_id, start_time: start, end_time: end,
      hours: log.clock_in_time && log.clock_out_time
        ? Math.round(hoursBetweenUtc(log.clock_in_time, log.clock_out_time) * 4) / 4
        : 0,
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
  if (!res.ok) throw new Error(toPublicError(res.error).error);

  return { documentId, uploadUrl: target.uploadUrl, provider: target.provider };
}

export async function confirmUpload(documentId: string, status: "synced" | "error"): Promise<void> {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) throw new Error("UNAUTHENTICATED");
  const res = await updateDocumentStatus(documentId, status, ctx.auditCtx);
  if (!res.ok) throw new Error(toPublicError(res.error).error);
}
