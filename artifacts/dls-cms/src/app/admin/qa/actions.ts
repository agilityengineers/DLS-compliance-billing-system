"use server";

import { revalidatePath } from "next/cache";
import { requireFeature } from "@/lib/auth/session";
import { resolveQaFlag as repoResolve } from "@/lib/data/repo-business";

export async function resolveQaFlag(flagKey: string, note: string) {
  const ctx = await requireFeature("qa.flags", "Admin");
  const res = await repoResolve(flagKey, note, ctx.auditCtx);
  revalidatePath("/admin/qa");
  revalidatePath("/admin");
  return res;
}
