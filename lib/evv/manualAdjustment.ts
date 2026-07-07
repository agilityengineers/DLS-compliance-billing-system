// lib/evv/manualAdjustment.ts — ADMIN-ONLY manual EVV path (server action).
"use server";

import { requireRole } from "@/lib/rbac/roles";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Admin manual adjustment: requires a non-empty reason (also enforced by a
 * DB CHECK constraint on evv_logs).
 */
export async function manualEvvAdjustment(input: {
  visitId: string;
  clockInTime: string;
  clockOutTime: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireRole("Admin");

  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, error: "manual_adjustment_reason is required for manual EVV entries." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("evv_logs").insert({
    visit_id: input.visitId,
    clock_in_time: input.clockInTime,
    clock_out_time: input.clockOutTime,
    verification_method: "Manual",
    manual_adjustment_reason: `${input.reason.trim()} (adjusted by ${userId})`,
    offline_locked: true
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
