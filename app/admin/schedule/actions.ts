// app/admin/schedule/actions.ts — visit assignment server action.
// HARD RULE: rejects any visit without an active_physician_order_id.
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/rbac/roles";
import { createClient } from "@/lib/supabase/server";

const VisitSchema = z.object({
  id: z.string().uuid().optional(), // present = reschedule/update
  client_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  visit_type: z.enum(["SCC", "Job_Coaching", "Day_Habilitation", "Early_Intervention"]),
  scheduled_start: z.string().datetime(),
  scheduled_end: z.string().datetime(),
  active_physician_order_id: z.string().trim().min(1, "A visit cannot be scheduled without an active physician order.")
});

export async function upsertVisit(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireRole("Admin", "Scheduler");

  const parsed = VisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  // Explicit guard (belt-and-braces beyond the zod min(1)):
  if (!parsed.data.active_physician_order_id?.trim()) {
    return { ok: false, error: "REJECTED: no active physician order on file for this visit." };
  }

  const supabase = createClient();
  const { id, ...fields } = parsed.data;
  const { error } = id
    ? await supabase.from("visits").update(fields).eq("id", id)
    : await supabase.from("visits").insert({ ...fields, status: "Scheduled" });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/schedule");
  return { ok: true };
}
