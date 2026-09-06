// lib/api/sync-schemas.ts — what a field device may send to /api/sync, per
// table (review #19). Unknown keys are STRIPPED (zod's default), so a device
// can never set billing, generated or audit columns (billed_at,
// claim_export_id, calculated_*, clock_*_distance_m), and display fields
// carried by a local mirror row (client_name, synced) never reach PostgREST.
// Identity columns (staff_id, administered_by) are decided by the route from
// the session, never by the payload.
import { z, type ZodError } from "zod";

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "expected HH:MM");
const gps = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const text = (max: number) => z.string().max(max);
const optText = (max: number) => text(max).nullable().default(null);

export const EvvLogSync = z.object({
  id: uuid,
  visit_id: uuid,
  clock_in_time: instant.nullable().default(null),
  clock_out_time: instant.nullable().default(null),
  clock_in_gps: gps.nullable().default(null),
  clock_out_gps: gps.nullable().default(null),
  verification_method: z.enum(["GPS", "Telephony", "Manual"]),
  offline_locked: z.boolean().default(false),
  manual_adjustment_reason: optText(500)
});

export const ProgressNoteSync = z.object({
  id: uuid,
  visit_id: uuid,
  client_id: uuid,
  /** Must be the session user when present; the route sets it either way. */
  staff_id: uuid.optional(),
  date: isoDate,
  start_time: hhmm,
  end_time: hhmm,
  specific_services_provided: optText(20_000),
  caregiver_signature_data: optText(500_000), // PNG data URL
  client_signature_data: optText(500_000),
  client_redirection_logged: z.boolean().default(false),
  goals_addressed: z.array(z.object({ goal: text(500), progress: text(2_000) })).max(50).default([]),
  cancellation_reason: optText(500)
});

/** A field device records only the OUTCOME of a scheduled dose — never the MAR itself. */
export const MedicationSync = z.object({
  id: uuid,
  status: z.enum(["Administered", "Refused", "Missed"]),
  administered_time: instant.nullable().default(null),
  notes: text(2_000).nullable().optional()
});

export const JobCoachingSync = z.object({
  id: uuid,
  progress_note_id: uuid,
  employer_name: text(200),
  job_title: optText(200),
  supervisor_name: optText(200),
  supervisor_phone: optText(50),
  milestone_number: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null),
  job_duties_completed: optText(5_000),
  upc_rotation_prompted: z.boolean().default(false),
  employer_contact_count: z.number().int().min(0).max(1_000).default(0),
  dvr_authorization_number: optText(100),
  dvr_cumulative_hours: z.number().min(0).max(10_000).nullable().default(null)
});

export const NmtTripSync = z.object({
  id: uuid,
  visit_id: uuid.nullable().default(null),
  client_id: uuid,
  staff_id: uuid.optional(),
  trip_date: isoDate,
  destination: text(200).min(1),
  purpose: optText(500),
  miles: z.number().min(0).max(1_000).nullable().default(null)
});

/** Field devices may only flip status — never re-schedule offline. */
export const VisitStatusSync = z.object({
  id: uuid,
  status: z.enum(["Cancelled", "Completed"]),
  cancellation_reason: optText(500)
});

const op = z.enum(["insert", "update"]);
const clientCreatedAt = z.string().optional();
const envelope = <K extends string, T extends z.ZodTypeAny>(table: K, payload: T) =>
  z.object({ table: z.literal(table), op, payload, client_created_at: clientCreatedAt });

export const SyncBody = z.discriminatedUnion("table", [
  envelope("evv_logs", EvvLogSync),
  envelope("progress_notes", ProgressNoteSync),
  envelope("medication_logs", MedicationSync),
  envelope("job_coaching_logs", JobCoachingSync),
  envelope("nmt_trips", NmtTripSync),
  envelope("visits", VisitStatusSync)
]);
export type SyncBody = z.infer<typeof SyncBody>;

/** Issue paths only — never the received values, which can be PHI. */
export function describeIssues(err: ZodError): string {
  const paths = [...new Set(err.issues.map((i) => i.path.join(".") || "body"))];
  return paths.slice(0, 8).join(", ");
}
