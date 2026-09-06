// app/api/sync/route.ts — THE server-side enforcement point for offline-
// authored field writes. The SyncEngine posts every queued mutation here.
//
// - Auth: session required (demo cookie or Supabase). 401 → the client
//   PAUSES syncing and asks for sign-in (it never wipes on a 401).
// - Payloads are validated PER TABLE (lib/api/sync-schemas.ts): unknown
//   columns are stripped, identity columns come from the session, a note
//   must agree with its visit, and a field session may only touch its own
//   visits and assigned clients — so demo mode and real mode enforce the
//   same thing before the database's RLS/triggers see the row (review #19).
// - Writes go through the repo: in real mode the DATABASE triggers/RLS
//   enforce geofence/NMT/order/manual rules; in demo mode the demo store
//   enforces identical rules. Rule rejections return 409 with the rule code.
// - Conflict rule: server wins for CLOSED records (both-signature notes,
//   locked EVV) when the server copy is newer.
// - Side effect: EVV clock-outs and NMT trips append route-record rows to
//   the staff member's weekly timesheet (source-idempotent).
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  appendTimesheetEntry, createNmtTrip, getEvvLogForVisit, getMedicationLog, getNoteForVisit,
  getOrCreateTimesheet, getProgressNote, isClientAssignedToStaff, serviceCodeForVisitType,
  updateMedication, upsertEvvLog, upsertJobCoachingLog, upsertProgressNote
} from "@/lib/data/repo-field";
import { agencyMondayOf, hoursBetweenUtc, utcIsoToAgencyDate, utcIsoToAgencyTime } from "@/lib/time/agency";
import { logApiError, toPublicError } from "@/lib/api/errors";
import { describeIssues, SyncBody } from "@/lib/api/sync-schemas";
import { getVisit, updateVisitStatus } from "@/lib/data/repo-core";
import type { EvvLog, JobCoachingLog, MedicationLog, NmtTrip, ProgressNote } from "@/lib/supabase/types";

/** A rule rejection: terminal for this payload, shown to the user verbatim (no row data). */
const deny = (text: string) => NextResponse.json({ error: text }, { status: 409 });

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = SyncBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // Paths only — the received values can be PHI.
    return NextResponse.json({ error: `INVALID_PAYLOAD: ${describeIssues(parsed.error)}` }, { status: 400 });
  }
  const body = parsed.data;
  const { table, client_created_at } = body;
  const me = ctx.effectiveUser.id;
  const isAdmin = ctx.effectiveUser.role === "Admin";
  const isField = ctx.effectiveUser.role === "Field_Staff";

  try {
    let result: { ok: boolean; error?: string };

    switch (body.table) {
      case "evv_logs": {
        const log = body.payload as EvvLog;
        // Server-wins for locked logs when the server copy is newer.
        const server = await getEvvLogForVisit(log.visit_id);
        if (server && server.id === log.id && server.offline_locked && client_created_at) {
          return NextResponse.json({ ok: true, dropped: "server-wins (locked EVV record)" });
        }
        if (isField) {
          const visit = await getVisit(log.visit_id);
          if (!visit || visit.staff_id !== me) return deny("RLS_DENIED: this visit is not assigned to you");
        }
        result = await upsertEvvLog(log, ctx.auditCtx, { isAdmin });
        if (result.ok && log.clock_out_time && log.clock_in_time) {
          // The route-record row is payroll evidence. If it cannot be written,
          // fail the mutation (500 → the client retries; the EVV upsert and the
          // append are both idempotent) instead of dropping hours silently.
          const routeRow = await appendRouteRow(log, ctx.auditCtx);
          if (!routeRow.ok) {
            logApiError("sync/evv_logs", routeRow.error, "TIMESHEET_APPEND_FAILED");
            return NextResponse.json({ error: "TIMESHEET_APPEND_FAILED" }, { status: 500 });
          }
          // Submit the completed, verified visit to the EVV aggregator
          // (Sandata in Colorado). Fire-and-forget: aggregator hiccups must
          // never fail the field sync; failures land in server logs for the
          // EVV review queue.
          void submitToAggregator(log);
        }
        break;
      }
      case "progress_notes": {
        const p = body.payload;
        // The note's author is the session user — a payload cannot name someone else.
        if (p.staff_id && p.staff_id !== me) return deny("RLS_DENIED: note names another staff member");
        // The note must agree with its visit (billing evidence).
        const visit = await getVisit(p.visit_id);
        if (!visit) return deny("RLS_DENIED: visit not found");
        if (isField && visit.staff_id !== me) return deny("RLS_DENIED: this visit is not assigned to you");
        if (visit.client_id !== p.client_id) return deny("RLS_DENIED: client does not match the visit");
        const note = { ...p, staff_id: me } as ProgressNote;
        const server = await getNoteForVisit(note.visit_id);
        const serverClosed = server && server.id === note.id &&
          server.caregiver_signature_data && server.client_signature_data;
        if (serverClosed) {
          return NextResponse.json({ ok: true, dropped: "server-wins (note already signed & closed)" });
        }
        result = await upsertProgressNote(note, ctx.auditCtx);
        break;
      }
      case "medication_logs": {
        // Only the OUTCOME of a scheduled dose comes from the device; the MAR
        // definition (drug, dose, route, time, client) stays as the server has it.
        const p = body.payload;
        const current = await getMedicationLog(p.id);
        if (!current) return deny("RLS_DENIED: medication record not found");
        if (isField && !(await isClientAssignedToStaff(current.client_id, me))) {
          return deny("RLS_DENIED: this client is not assigned to you");
        }
        const merged: MedicationLog = {
          ...current,
          status: p.status,
          administered_time: p.administered_time,
          notes: p.notes === undefined ? current.notes : p.notes,
          // The acting (effective) user is the administrator of record; audit
          // attribution separately records the real identity when impersonating.
          administered_by: p.status === "Missed" ? null : me
        };
        result = await updateMedication(merged, ctx.auditCtx);
        break;
      }
      case "job_coaching_logs": {
        const p = body.payload;
        if (isField) {
          const parent = await getProgressNote(p.progress_note_id);
          if (!parent || parent.staff_id !== me) return deny("RLS_DENIED: the parent note is not yours");
        }
        result = await upsertJobCoachingLog(p as JobCoachingLog, ctx.auditCtx);
        break;
      }
      case "visits": {
        // Field devices may only flip status (Cancelled with a reason, or
        // Completed after clock-out) — never re-schedule offline.
        const p = body.payload;
        if (isField) {
          const visit = await getVisit(p.id);
          if (!visit || visit.staff_id !== me) return deny("RLS_DENIED: this visit is not assigned to you");
        }
        if (p.status === "Cancelled" && !p.cancellation_reason?.trim()) {
          return deny("CHECK_VIOLATION: cancellation requires a reason");
        }
        result = await updateVisitStatus(p.id, p.status, ctx.auditCtx, p.cancellation_reason ?? undefined);
        break;
      }
      case "nmt_trips": {
        const p = body.payload;
        if (p.staff_id && p.staff_id !== me) return deny("RLS_DENIED: trip names another staff member");
        if (isField && !(await isClientAssignedToStaff(p.client_id, me))) {
          return deny("RLS_DENIED: this client is not assigned to you");
        }
        const trip: NmtTrip = { ...p, staff_id: me };
        result = await createNmtTrip(trip, ctx.auditCtx);
        if (result.ok) {
          const monday = agencyMondayOf(trip.trip_date);
          const ts = await getOrCreateTimesheet(trip.staff_id, monday, ctx.auditCtx);
          const appended = await appendTimesheetEntry(
            {
              timesheet_id: ts.id, work_date: trip.trip_date, service_code: "T",
              client_id: trip.client_id, start_time: null, end_time: null,
              hours: 0.5, // NMT default; adjust on the route record if needed
              source: "nmt", source_id: trip.id, notes: `NMT: ${trip.destination}`
            },
            ctx.auditCtx
          );
          if (!appended.ok) {
            logApiError("sync/nmt_trips", appended.error, "TIMESHEET_APPEND_FAILED");
            return NextResponse.json({ error: "TIMESHEET_APPEND_FAILED" }, { status: 500 });
          }
        }
        break;
      }
    }

    if (!result.ok) {
      // Never echo database text (it can contain row values): rule codes only.
      const pub = toPublicError(result.error);
      if (pub.status >= 500) logApiError(`sync/${table}`, result.error, pub.error);
      return NextResponse.json({ error: pub.error }, { status: pub.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pub = toPublicError(msg);
    if (pub.status >= 500) logApiError(`sync/${table}`, msg, pub.error);
    return NextResponse.json({ error: pub.error }, { status: pub.status });
  }
}

/** EVV clock-out → route-record row (codes SCC/JC/DH) + visit → Completed. */
async function appendRouteRow(
  log: EvvLog,
  auditCtx: { performedBy: string | null; impersonating: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const visit = await getVisit(log.visit_id);
  if (!visit) return { ok: false, error: `visit ${log.visit_id} not found` };
  if (visit.status === "Scheduled" || visit.status === "In_Progress") {
    const flipped = await updateVisitStatus(visit.id, "Completed", auditCtx);
    if (!flipped.ok) return { ok: false, error: flipped.error ?? "could not mark the visit Completed" };
  }
  // Clock times are UTC instants; the route record is kept in AGENCY days
  // and wall-clock times (an evening Denver visit is not "tomorrow").
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
      source: "evv", source_id: log.id, notes: null
    },
    auditCtx
  );
}

async function submitToAggregator(log: EvvLog) {
  try {
    const visit = await getVisit(log.visit_id);
    if (!visit) return;
    const { getEvvAggregator } = await import("@/lib/integrations/evv-aggregator");
    const res = await getEvvAggregator().submitVisit(log, visit);
    if (!res.accepted) console.error("[evv-aggregator] rejected:", res.error);
  } catch (e) {
    console.error("[evv-aggregator]", e instanceof Error ? e.message : e);
  }
}
