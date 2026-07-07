// lib/auth/impersonation.ts — Admin-only "view as user" (client priority).
//
// Design (see DECISIONS.md): the admin's identity is PRESERVED.
//  - Demo mode: an httpOnly cookie holds the target id; honored only for a
//    real Admin session; audit rows record performed_by=admin + impersonating.
//  - Real mode: we mint a JWT with sub = ADMIN id + an `impersonating` claim,
//    signed with SUPABASE_JWT_SECRET (1 h expiry, httpOnly cookie). Data
//    requests carry it, so auth.uid() stays the admin for RLS and the audit
//    trigger reads the claim (migration 0002). Fails closed without the secret.
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SignJWT } from "jose";
import { isDemoMode, DEMO_IMPERSONATE_COOKIE, IMPERSONATION_JWT_COOKIE } from "@/lib/demo/mode";
import { requireRealAdmin } from "@/lib/auth/session";
import { getDemoStore } from "@/lib/data/demo/store";
import { createClient } from "@/lib/supabase/server";

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

  if (isDemoMode()) {
    const target = getDemoStore().data.users.find((u) => u.id === targetUserId && u.status === "Active");
    if (!target) return { ok: false, error: "User not found or suspended." };
    cookies().set(DEMO_IMPERSONATE_COOKIE, targetUserId, COOKIE_OPTS);
    getDemoStore().audit("impersonation", "INSERT", targetUserId, null,
      { event: "impersonation_started", target: target.full_name }, ctx.auditCtx);
    revalidatePath("/", "layout");
    return { ok: true };
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return { ok: false, error: "Impersonation unavailable: SUPABASE_JWT_SECRET is not configured (see PRODUCTION-READINESS.md §2)." };
  }
  const supabase = createClient();
  const { data: target } = await supabase
    .from("users").select("id,status").eq("id", targetUserId).single();
  if (!target || target.status !== "Active") return { ok: false, error: "User not found or suspended." };

  const jwt = await new SignJWT({
    role: "authenticated",
    impersonating: targetUserId
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(ctx.realUser!.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .setAudience("authenticated")
    .sign(new TextEncoder().encode(secret));

  cookies().set(IMPERSONATION_JWT_COOKIE, jwt, COOKIE_OPTS);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopImpersonation(): Promise<{ ok: boolean }> {
  // No role check needed — exiting impersonation is always safe.
  const jar = cookies();
  jar.delete(DEMO_IMPERSONATE_COOKIE);
  jar.delete(IMPERSONATION_JWT_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true };
}
