// app/api/sync/route.ts — THE server-side enforcement point for offline-
// authored field writes. The SyncEngine posts every queued mutation here.
//
// - Auth: session required (demo cookie or Supabase). 401 → client wipes.
// - Writes go through the repo: in real mode the DATABASE triggers/RLS
//   enforce geofence/NMT/order/manual rules; in demo mode the demo store
//   enforces identical rules. Rule rejections return 409 with the rule code.
// - Conflict rule: server wins for CLOSED records (both-signature notes,
//   locked EVV, administered meds) when the server copy is newer.
// - Side effect: EVV clock-outs and NMT trips append route-record rows to
//   the staff member's weekly timesheet (source-idempotent).
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import {
  appendTimesheetEntry, getEvvLogForVisit, getNoteForVisit, getOrCreateTimesheet,
  createNmtTrip, serviceCodeForVisitType, updateMedication, upsertEvvLog,
  upsertJobCoachingLog, upsertProgressNote, hoursBetween
} from "@/lib/data/repo-field";
import { getVisit, updateVisitStatus } from "@/lib/data/repo-core";
import type { EvvLog, JobCoachingLog, MedicationLog, NmtTrip, ProgressNote, VisitStatus } from "@/lib/supabase/types";

const BodySchema = z.object({
  table: z.enum(["progress_notes", "evv_logs", "medication_logs", "job_coaching_logs", "nmt_trips", "visits"]),
  op: z.enum(["insert", "update"]),
  payload: z.record(z.unknown()).and(z.object({ id: z.string().uuid() })),
  client_created_at: z.string().optional()
});

const RULE_CODES = [
  "EVV_GEOFENCE", "NMT_AUTHORIZATION_EXHAUSTED", "NMT_NOT_AUTHORIZED",
  "PHYSICIAN_ORDER_REQUIRED", "PHYSICIAN_ORDER_INACTIVE",
  "CHECK_VIOLATION", "UNIQUE_VIOLATION", "RLS_DENIED"
];

function ruleStatus(error: string | undefined): number | null {
  if (!error) return null;
  if (RULE_CODES.some((c) => error.includes(c))) return 409;
  // Postgres codes surfaced by PostgREST for our constraints/policies
  if (/violates row-level security|check constraint|duplicate key|new row violates/i.test(error)) return 409;
  return null;
}

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { table, op, payload }" }, { status: 400 });
  }
  const { table, payload, client_created_at } = parsed.data;
  const isAdmin = ctx.effectiveUser.role === "Admin";

  try {
    let result: { ok: boolean; error?: string };

    switch (table) {
      case "evv_logs": {
        const log = payload as unknown as EvvLog;
        // Server-wins for locked logs when the server copy is newer.
        const server = await getEvvLogForVisit(log.visit_id);
        if (server && server.id === log.id && server.offline_locked && client_created_at) {
          return NextResponse.json({ ok: true, dropped: "server-wins (locked EVV record)" });
        }
        result = await upsertEvvLog(log, ctx.auditCtx, { isAdmin });
        if (result.ok && log.clock_out_time && log.clock_in_time) {
          await appendRouteRow(log, ctx.auditCtx);
          // Submit the completed, verified visit to the EVV aggregator
          // (Sandata in Colorado). Fire-and-forget: aggregator hiccups must
          // never fail the field sync; failures land in server logs for the
          // EVV review queue.
          void submitToAggregator(log);
        }
        break;
      }
      case "progress_notes": {
        const note = payload as unknown as ProgressNote;
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
        const med = payload as unknown as MedicationLog;
        // The acting (effective) user is the administrator of record; audit
        // attribution separately records the real identity when impersonating.
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
        // Field devices may only flip status (Cancelled with a reason, or
        // Completed after clock-out) — never re-schedule offline.
        const status = payload.status as VisitStatus;
        if (status !== "Cancelled" && status !== "Completed") {
          return NextResponse.json({ error: "Field sync may only cancel or complete visits" }, { status: 403 });
        }
        if (status === "Cancelled" && !(payload.cancellation_reason as string | undefined)?.trim()) {
          return NextResponse.json({ error: "CHECK_VIOLATION: cancellation requires a reason" }, { status: 409 });
        }
        result = await updateVisitStatus(
          payload.id as string, status, ctx.auditCtx,
          payload.cancellation_reason as string | undefined
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
              hours: 0.5, // NMT default; adjust on the route record if needed
              source: "nmt", source_id: trip.id, notes: `NMT: ${trip.destination}`
            },
            ctx.auditCtx
          );
        }
        break;
      }
    }

    if (!result.ok) {
      const status = ruleStatus(result.error) ?? 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: ruleStatus(msg) ?? 500 });
  }
}

/** EVV clock-out → route-record row (codes SCC/JC/DH) + visit → Completed. */
async function appendRouteRow(log: EvvLog, auditCtx: { performedBy: string | null; impersonating: string | null }) {
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

function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
