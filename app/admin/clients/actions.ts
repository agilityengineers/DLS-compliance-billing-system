// app/admin/clients/actions.ts — client intake server action
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/rbac/roles";
import { createClient } from "@/lib/supabase/server";

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
  active_diagnoses: z.array(z.object({ code: z.string(), description: z.string() }))
});

export async function createClientRecord(input: unknown): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requireRole("Admin", "Scheduler");
  const parsed = ClientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

  const supabase = createClient(); // RLS-enforced
  const { data, error } = await supabase.from("clients").insert({
    ...parsed.data,
    service_plan_start: parsed.data.service_plan_start || null,
    service_plan_end: parsed.data.service_plan_end || null,
    insurance_provider: parsed.data.insurance_provider || null
  }).select("id").single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/clients");
  return { ok: true, id: data.id };
}
