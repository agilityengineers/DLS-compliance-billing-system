// app/admin/billing/actions.ts — bulk 837P export (Admin only)
"use server";

import { requireRole } from "@/lib/rbac/roles";
import { createServiceClient } from "@/lib/supabase/server";
import { canGenerateClaim } from "@/lib/billing/guardrails";
import { exportClaim837P, submitterFromEnv, type ClaimInput } from "@/lib/billing/x12-837p";

// TODO: pull rate + procedure code from a fee schedule table per visit_type.
const PLACEHOLDER_RATE_PER_UNIT = 15.5;
const PROCEDURE_BY_TYPE: Record<string, string> = {
  SCC: "T2021", Job_Coaching: "H2023", Day_Habilitation: "T2021", Early_Intervention: "T1027"
};

export async function checkClaim(progressNoteId: string) {
  await requireRole("Admin");
  return canGenerateClaim(progressNoteId);
}

export async function bulkExport837P(noteIds: string[]): Promise<{ ok: boolean; file?: string; error?: string; blocked?: Record<string, string[]> }> {
  await requireRole("Admin");
  const supabase = createServiceClient();

  const blocked: Record<string, string[]> = {};
  const claims: ClaimInput[] = [];

  for (const id of noteIds) {
    const check = await canGenerateClaim(id);
    if (!check.ok) { blocked[id] = check.blockers; continue; }

    const { data: note } = await supabase
      .from("progress_notes")
      .select("*, visits(visit_type), clients:client_id(first_name,last_name,medicaid_id,date_of_birth,active_diagnoses)")
      .eq("id", id).single();
    if (!note) { blocked[id] = ["Note not found"]; continue; }

    const client = note.clients as { first_name: string; last_name: string; medicaid_id: string; date_of_birth: string; active_diagnoses: { code: string }[] };
    const visitType = (note.visits as { visit_type: string }).visit_type;
    const units = note.calculated_billing_units ?? 0;

    claims.push({
      claimId: `PN-${id.slice(0, 8).toUpperCase()}`,
      client: {
        lastName: client.last_name.toUpperCase(),
        firstName: client.first_name.toUpperCase(),
        medicaidId: client.medicaid_id,
        dob: client.date_of_birth.replace(/-/g, "")
      },
      diagnosisCodes: (client.active_diagnoses ?? []).map((d) => d.code.replace(".", "")),
      lines: [{
        procedureCode: PROCEDURE_BY_TYPE[visitType] ?? "T2021",
        units,
        chargeAmount: units * PLACEHOLDER_RATE_PER_UNIT,
        serviceDate: (note.date as string).replace(/-/g, "")
      }]
    });
  }

  if (claims.length === 0) return { ok: false, error: "No claim-ready notes in selection.", blocked };

  const file = exportClaim837P(claims, submitterFromEnv(), Date.now() % 1_000_000_000);

  // Mark exported visits as Billed
  const exportedIds = noteIds.filter((id) => !blocked[id]);
  const { data: exportedNotes } = await supabase.from("progress_notes").select("visit_id").in("id", exportedIds);
  if (exportedNotes?.length) {
    await supabase.from("visits").update({ status: "Billed" }).in("id", exportedNotes.map((n) => n.visit_id));
  }

  return { ok: true, file, blocked };
}
