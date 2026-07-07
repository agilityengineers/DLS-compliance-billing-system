// lib/evv/manualAdjustment.ts — ADMIN-ONLY manual EVV path (server action).
// A non-empty reason is required here, by the DB CHECK constraint, and by
// the demo-store rule; field sessions can't reach Manual at all (RLS).
"use server";

import { requireRole } from "@/lib/auth/session";
import { upsertEvvLog } from "@/lib/data/repo-field";
import type { EvvLog } from "@/lib/supabase/types";

export async function manualEvvAdjustment(input: {
  visitId: string;
  clockInTime: string;
  clockOutTime: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireRole("Admin");

  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, error: "manual_adjustment_reason is required for manual EVV entries." };
  }

  const log: EvvLog = {
    id: crypto.randomUUID(),
    visit_id: input.visitId,
    clock_in_time: input.clockInTime,
    clock_out_time: input.clockOutTime,
    clock_in_gps: null,
    clock_out_gps: null,
    verification_method: "Manual",
    offline_locked: true,
    manual_adjustment_reason: `${input.reason.trim()} (adjusted by ${ctx.realUser!.full_name})`
  };
  return upsertEvvLog(log, ctx.auditCtx, { isAdmin: true });
}
