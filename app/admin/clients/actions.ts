// app/admin/clients/actions.ts — client intake server action (repo-backed).
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClientRecord as repoCreateClient } from "@/lib/data/repo-core";

const ClientSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  medicaid_id: z.string().min(1),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  insurance_provider: z.string().optional(),
  service_plan_start: z.string().optional(),
  service_plan_end: z.string().optional(),
  authorized_scc_hours_per_week: z.coerce.number().min(0),
  authorized_nmt_trips_per_week: z.coerce.number().int().min(0),
  case_manager_name: z.string().optional(),
  ccb_name: z.string().optional(),
  active_diagnoses: z.array(z.object({ code: z.string(), description: z.string() }))
});

export async function createClientRecord(input: unknown): Promise<{ ok: boolean; error?: string; id?: string }> {
  const ctx = await requireRole("Admin", "Scheduler");
  const parsed = ClientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const d = parsed.data;

  const res = await repoCreateClient(
    {
      first_name: d.first_name,
      last_name: d.last_name,
      medicaid_id: d.medicaid_id,
      date_of_birth: d.date_of_birth,
      active_diagnoses: d.active_diagnoses,
      insurance_provider: d.insurance_provider || null,
      service_plan_start: d.service_plan_start || null,
      service_plan_end: d.service_plan_end || null,
      authorized_scc_hours_per_week: d.authorized_scc_hours_per_week,
      authorized_nmt_trips_per_week: d.authorized_nmt_trips_per_week,
      authorized_jc_hours_per_week: 0,
      authorized_dh_hours_per_week: 0,
      authorized_ei_hours_per_week: 0,
      case_manager_name: d.case_manager_name || null,
      ccb_name: d.ccb_name || null,
      residence_gps: null
    },
    ctx.auditCtx
  );
  if (res.ok) revalidatePath("/admin/clients");
  return res;
}
