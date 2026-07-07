// app/field/actions.ts — server actions for the field surface.
"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { setFieldHomePref, submitTimesheet as repoSubmitTimesheet } from "@/lib/data/repo-field";

/** Persist the Today-home style (Visits default / Dashboard) per user. */
export async function setFieldHome(style: "visits" | "dashboard") {
  const ctx = await requireSession();
  await setFieldHomePref(ctx.effectiveUser!.id, style);
  return { ok: true as const };
}

/** Submit the weekly route record — flips payroll "all notes in?". */
export async function submitTimesheet(timesheetId: string) {
  const ctx = await requireSession();
  const res = await repoSubmitTimesheet(timesheetId, ctx.auditCtx);
  revalidatePath("/field/timesheet");
  return res;
}
