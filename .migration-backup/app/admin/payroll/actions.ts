"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getCurrentPayrollPeriod, submitPayroll } from "@/lib/data/repo-business";
import { computePayrollLines } from "@/lib/payroll/transmittal";

/** Certify + submit the transmittal. BLOCKED while any notes are outstanding. */
export async function certifyAndSubmitPayroll(periodId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireRole("Admin");

  const period = await getCurrentPayrollPeriod();
  if (!period || period.id !== periodId) return { ok: false, error: "Payroll period not found." };
  if (period.status === "submitted") return { ok: false, error: "This period was already submitted." };

  const lines = await computePayrollLines(period);
  const outstanding = lines.filter((l) => !l.all_notes_in);
  if (outstanding.length > 0) {
    return {
      ok: false,
      error: `Submission blocked — notes outstanding for: ${outstanding.map((l) => l.employee_name).join("; ")}.`
    };
  }

  const res = await submitPayroll(periodId, lines, ctx.auditCtx);
  revalidatePath("/admin/payroll");
  return res;
}
