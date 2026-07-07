// lib/auth/session.ts — the ONE way to resolve "who is acting" on the server.
//
// Returns both identities:
//   realUser      — the authenticated account (always the audit identity)
//   effectiveUser — who the UI renders as (impersonation target, else realUser)
//
// Impersonation is Admin-only. While impersonating, authorization for what
// the UI can DO follows the effective user (the admin sees exactly what the
// target sees), but every mutation is audit-attributed to the REAL admin
// with `impersonating` set — via the JWT claim in real mode (DB trigger reads
// it) and via auditCtx in demo mode.
import "server-only";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { isDemoMode, DEMO_USER_COOKIE, DEMO_IMPERSONATE_COOKIE, IMPERSONATION_JWT_COOKIE } from "@/lib/demo/mode";
import { getDemoStore, type AuditContext } from "@/lib/data/demo/store";
import { createClient } from "@/lib/supabase/server";
import type { Role, StaffUser } from "@/lib/supabase/types";

export interface SessionContext {
  demo: boolean;
  realUser: StaffUser | null;
  effectiveUser: StaffUser | null;
  impersonating: boolean;
  auditCtx: AuditContext;
}

const ANON: SessionContext = {
  demo: false,
  realUser: null,
  effectiveUser: null,
  impersonating: false,
  auditCtx: { performedBy: null, impersonating: null }
};

export async function getSessionContext(): Promise<SessionContext> {
  if (isDemoMode()) return demoSession();
  return supabaseSession();
}

function demoSession(): SessionContext {
  const store = getDemoStore();
  const jar = cookies();
  const userId = jar.get(DEMO_USER_COOKIE)?.value;
  const realUser = store.data.users.find((u) => u.id === userId && u.status === "Active") ?? null;
  if (!realUser) return { ...ANON, demo: true };

  let effectiveUser = realUser;
  let impersonating = false;
  // Impersonation cookie is honored ONLY for a real Admin session.
  const targetId = jar.get(DEMO_IMPERSONATE_COOKIE)?.value;
  if (targetId && realUser.role === "Admin" && targetId !== realUser.id) {
    const target = store.data.users.find((u) => u.id === targetId && u.status === "Active");
    if (target) {
      effectiveUser = target;
      impersonating = true;
    }
  }
  return {
    demo: true,
    realUser,
    effectiveUser,
    impersonating,
    auditCtx: { performedBy: realUser.id, impersonating: impersonating ? effectiveUser.id : null }
  };
}

async function supabaseSession(): Promise<SessionContext> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return ANON;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status !== "Active") return ANON;
  const realUser = profile as StaffUser;

  let effectiveUser = realUser;
  let impersonating = false;

  const token = cookies().get(IMPERSONATION_JWT_COOKIE)?.value;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (token && secret && realUser.role === "Admin") {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      const targetId = payload.impersonating as string | undefined;
      // The token must have been minted for THIS admin (sub = admin id).
      if (payload.sub === realUser.id && targetId && targetId !== realUser.id) {
        const { data: target } = await supabase
          .from("users").select("*").eq("id", targetId).single();
        if (target && target.status === "Active") {
          effectiveUser = target as StaffUser;
          impersonating = true;
        }
      }
    } catch {
      // expired/invalid token → fail closed to the real identity
    }
  }

  return {
    demo: false,
    realUser,
    effectiveUser,
    impersonating,
    auditCtx: { performedBy: realUser.id, impersonating: impersonating ? effectiveUser.id : null }
  };
}

/** Throws unless signed in; returns the session context. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx.realUser || !ctx.effectiveUser) throw new Error("UNAUTHENTICATED");
  return ctx;
}

/**
 * Role gate for pages/actions. Checks the EFFECTIVE role — impersonation
 * shows the admin exactly what the target can see/do; attribution stays real.
 */
export async function requireRole(...allowed: Role[]): Promise<SessionContext> {
  const ctx = await requireSession();
  if (allowed.length > 0 && !allowed.includes(ctx.effectiveUser!.role)) {
    throw new Error("FORBIDDEN");
  }
  return ctx;
}

/** Impersonation control itself requires the REAL identity to be Admin. */
export async function requireRealAdmin(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (ctx.realUser!.role !== "Admin") throw new Error("FORBIDDEN");
  return ctx;
}
