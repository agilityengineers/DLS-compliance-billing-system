// lib/auth/impersonation.ts — "view as user" (Admin, and the provider for support).
//
// The acting identity is PRESERVED: every action is audit-attributed to the
// real user with the target recorded.
//  - Real accounts: the API server stores the target on the session
//    (POST/DELETE /api/auth/impersonate) and audits start/stop.
//  - DEMO staff (synthetic, no account): an Admin's target id lives in the
//    cookie shim and the demo store audits it, exactly as before.
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode, DEMO_IMPERSONATE_COOKIE, IMPERSONATION_JWT_COOKIE } from "@/lib/demo/mode";
import { isApiAuth } from "@/lib/auth/mode";
import { apiFetch, errorMessage } from "@/lib/api/client";
import { getSessionContext, invalidateSession, requireRealAdmin } from "@/lib/auth/session";
import { getDemoStore } from "@/lib/data/demo/store";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 // 1 hour — impersonation sessions are deliberately short
};

export async function startImpersonation(targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireRealAdmin();
  if (targetUserId === ctx.realUser!.id) {
    return { ok: false, error: "You are already yourself." };
  }
  if (!ctx.features.has("platform.impersonation") && ctx.realUser!.role !== "Super_Admin") {
    return { ok: false, error: "Impersonation is not enabled for your organization." };
  }

  const demoTarget = isDemoMode()
    ? getDemoStore().data.users.find((u) => u.id === targetUserId && u.status === "Active")
    : undefined;

  if (demoTarget && (!isApiAuth() || !demoTarget.is_account)) {
    if (ctx.realUser!.role !== "Admin") return { ok: false, error: "Only an organization Admin can view as demo staff." };
    cookies().set(DEMO_IMPERSONATE_COOKIE, targetUserId, COOKIE_OPTS);
    getDemoStore().audit("impersonation", "INSERT", targetUserId, null,
      { event: "impersonation_started", target: demoTarget.full_name }, ctx.auditCtx);
    invalidateSession();
    revalidatePath("/", "layout");
    return { ok: true };
  }

  if (!isApiAuth()) return { ok: false, error: "User not found or suspended." };
  try {
    await apiFetch("/auth/impersonate", { method: "POST", json: { userId: targetUserId } });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not start viewing as that user.") };
  }
  invalidateSession();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopImpersonation(): Promise<{ ok: boolean }> {
  const ctx = await getSessionContext();
  const jar = cookies();
  const demoTargetId = jar.get(DEMO_IMPERSONATE_COOKIE)?.value;
  if (demoTargetId && ctx.impersonating && ctx.realUser && ctx.effectiveUser && !ctx.effectiveUser.is_account) {
    getDemoStore().audit(
      "impersonation", "INSERT", ctx.effectiveUser.id, null,
      { event: "impersonation_stopped", target: ctx.effectiveUser.full_name }, ctx.auditCtx,
    );
  }
  jar.delete(DEMO_IMPERSONATE_COOKIE);
  jar.delete(IMPERSONATION_JWT_COOKIE);
  if (isApiAuth() && ctx.realUser) {
    try {
      await apiFetch("/auth/impersonate", { method: "DELETE" });
    } catch {
      // nothing to stop, or the API is unreachable — the local state is cleared regardless
    }
  }
  invalidateSession();
  revalidatePath("/", "layout");
  return { ok: true };
}
