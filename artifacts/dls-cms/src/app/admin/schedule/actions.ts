// app/admin/schedule/actions.ts — scheduling server actions.
// Business Rule #3 is enforced by the DB trigger (fn_visit_requires_active_
// order) / demo rule — the action surfaces the rejection verbatim so the
// UI shows the red "cannot be saved" state.
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { activeOrderForClient, generateVisitsFromTemplates, saveVisit } from "@/lib/data/repo-core";

const VisitSchema = z.object({
  id: z.string().uuid().optional(), // present = reschedule/update
  client_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  visit_type: z.enum(["SCC", "Job_Coaching", "Day_Habilitation", "Early_Intervention"]),
  scheduled_start: z.string(),
  scheduled_end: z.string(),
  physician_order_id: z.string().uuid().nullable(),
  status: z.enum(["Scheduled", "In_Progress", "Completed", "Cancelled", "Billed"]).default("Scheduled")
});

export async function upsertVisit(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireRole("Admin", "Scheduler");
  const parsed = VisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const res = await saveVisit(parsed.data, ctx.auditCtx);
  if (res.ok) revalidatePath("/admin/schedule");
  return res;
}

/** Resolve the client's active order for a service date (schedule UI helper). */
export async function findActiveOrder(clientId: string, dateIso: string) {
  await requireRole("Admin", "Scheduler");
  const order = await activeOrderForClient(clientId, dateIso);
  return order ? { id: order.id, label: `${order.order_number} · ${order.ordering_physician}` } : null;
}

/** Generate this week's visits from active recurring templates (idempotent). */
export async function generateRecurringVisits(weekMondayIso: string) {
  const ctx = await requireRole("Admin", "Scheduler");
  const res = await generateVisitsFromTemplates(weekMondayIso, ctx.auditCtx);
  revalidatePath("/admin/schedule");
  return res;
}
