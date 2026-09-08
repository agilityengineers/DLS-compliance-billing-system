"use server";

import { revalidatePath } from "next/cache";
import { requireFeature } from "@/lib/auth/session";
import { runReliasCompletionSync } from "@/lib/integrations/relias";

/** Manual trigger for the nightly Relias completion sync (also cron-run). */
export async function runReliasSyncNow() {
  const ctx = await requireFeature("relias.training", "Admin");
  try {
    const res = await runReliasCompletionSync(ctx.auditCtx);
    revalidatePath("/admin/relias");
    revalidatePath("/admin/billing");
    return { ok: true as const, ...res };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
