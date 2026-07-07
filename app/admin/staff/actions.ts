// app/admin/staff/actions.ts — credential renewal + offboarding (Admin-only).
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { listVisits, recordCredentialRenewal, saveVisit, updateUser } from "@/lib/data/repo-core";

export async function renewLicense(userId: string, expirationDate: string) {
  const ctx = await requireRole("Admin");
  const res = await recordCredentialRenewal(userId, { kind: "license", expiration_date: expirationDate }, ctx.auditCtx);
  revalidatePath("/admin/staff");
  return res;
}

export async function renewTraining(userId: string, course: string, completedOn: string, expiresOn: string | null) {
  const ctx = await requireRole("Admin");
  const res = await recordCredentialRenewal(
    userId,
    { kind: "training", record: { course, completed_on: completedOn, expires_on: expiresOn, required: true } },
    ctx.auditCtx
  );
  revalidatePath("/admin/staff");
  return res;
}

/**
 * Offboarding in one flow: suspend the account AND reassign upcoming visits
 * to another staff member (open documentation follows the caseload).
 */
export async function offboardStaff(userId: string, reassignToId: string): Promise<{ ok: boolean; moved?: number; error?: string }> {
  const ctx = await requireRole("Admin");
  if (userId === reassignToId) return { ok: false, error: "Cannot reassign to the same person." };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (await listVisits({ staffId: userId, from: today })).filter(
    (v) => v.status === "Scheduled" || v.status === "In_Progress"
  );

  let moved = 0;
  for (const v of upcoming) {
    const res = await saveVisit(
      {
        id: v.id, client_id: v.client_id, staff_id: reassignToId, visit_type: v.visit_type,
        scheduled_start: v.scheduled_start, scheduled_end: v.scheduled_end,
        physician_order_id: v.physician_order_id, status: v.status
      },
      ctx.auditCtx
    );
    if (res.ok) moved++;
  }

  const suspend = await updateUser(userId, { status: "Suspended" }, ctx.auditCtx);
  if (!suspend.ok) return { ok: false, error: suspend.error };
  revalidatePath("/admin/staff");
  return { ok: true, moved };
}
