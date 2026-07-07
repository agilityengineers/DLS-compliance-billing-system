// lib/billing/guardrails.ts — claim generation pre-flight checks.
// Server-only (reads across tables with the service client).
import { createServiceClient } from "@/lib/supabase/server";
import type { TrainingRecord } from "@/lib/supabase/types";

export interface ClaimCheck {
  ok: boolean;
  blockers: string[];
}

/**
 * canGenerateClaim — returns blockers when:
 *  1. staff license_expiration_date is past, or a required training course is expired
 *  2. either signature is missing on the progress note
 *  3. cumulative billed units in the client's authorization week would exceed
 *     authorized_scc_hours_per_week (4 units/hour)
 */
export async function canGenerateClaim(progressNoteId: string): Promise<ClaimCheck> {
  const supabase = createServiceClient();
  const blockers: string[] = [];

  const { data: note, error } = await supabase
    .from("progress_notes")
    .select("*, visits(visit_type,status), users:staff_id(full_name,license_expiration_date,training_completed), clients:client_id(authorized_scc_hours_per_week,first_name,last_name)")
    .eq("id", progressNoteId)
    .single();
  if (error || !note) return { ok: false, blockers: [`Progress note not found: ${error?.message ?? progressNoteId}`] };

  const today = new Date().toISOString().slice(0, 10);

  // 1a. License expiration
  const staff = note.users as { full_name: string; license_expiration_date: string | null; training_completed: TrainingRecord[] };
  if (staff.license_expiration_date && staff.license_expiration_date < today) {
    blockers.push(`Staff license expired ${staff.license_expiration_date} (${staff.full_name}).`);
  }
  // 1b. Required training expiration
  for (const t of staff.training_completed ?? []) {
    if (t.required !== false && t.expires_on && t.expires_on < today) {
      blockers.push(`Required training "${t.course}" expired ${t.expires_on}.`);
    }
  }

  // 2. Signatures
  if (!note.caregiver_signature_data) blockers.push("Missing caregiver signature.");
  if (!note.client_signature_data) blockers.push("Missing client signature.");

  // 3. Authorization-window units (SCC weekly authorization, Sunday-based week)
  const client = note.clients as { authorized_scc_hours_per_week: number; first_name: string; last_name: string };
  const noteDate = new Date(note.date as string);
  const weekStart = new Date(noteDate);
  weekStart.setDate(noteDate.getDate() - noteDate.getDay()); // Sunday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data: weekNotes } = await supabase
    .from("progress_notes")
    .select("id,calculated_billing_units")
    .eq("client_id", note.client_id)
    .gte("date", iso(weekStart))
    .lte("date", iso(weekEnd));

  const cumulativeUnits = (weekNotes ?? []).reduce(
    (sum, n) => sum + (n.calculated_billing_units ?? 0), 0);
  const authorizedUnits = Math.round((client.authorized_scc_hours_per_week ?? 0) * 4);
  if (authorizedUnits > 0 && cumulativeUnits > authorizedUnits) {
    blockers.push(
      `Cumulative units this week (${cumulativeUnits}) exceed authorization ` +
      `(${authorizedUnits} units = ${client.authorized_scc_hours_per_week} hrs/wk).`
    );
  }

  return { ok: blockers.length === 0, blockers };
}
