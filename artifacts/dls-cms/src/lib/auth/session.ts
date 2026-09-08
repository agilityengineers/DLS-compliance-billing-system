// lib/auth/session.ts — the ONE way to resolve "who is acting".
//
// Returns both identities:
//   realUser      — the authenticated account (always the audit identity)
//   effectiveUser — who the UI renders as (impersonation target, else realUser)
// plus the feature set the effective user may use (see @workspace/features):
// provider switch ∧ organization switch ∧ role grant.
//
// Two sign-in modes (lib/auth/mode.ts):
//   api  — the API server owns the session (httpOnly cookie); this module
//          reads /api/auth/me once per navigation/revalidation and caches it.
//   demo — the synthetic role picker; session lives in the localStorage-backed
//          cookie shim (see .agents/memory/iframe-session-storage.md).
import "server-only";
import { cookies } from "next/headers";
import {
  effectiveFeatureKeys,
  resolveFeatureStates,
  type FeatureKey,
  type FeatureState,
  type Role,
} from "@workspace/features";
import { isDemoMode, DEMO_USER_COOKIE, DEMO_IMPERSONATE_COOKIE } from "@/lib/demo/mode";
import { isApiAuth } from "@/lib/auth/mode";
import { apiFetch, isApiClientError } from "@/lib/api/client";
import { getDemoStore, type AuditContext } from "@/lib/data/demo/store";
import { subscribeRevalidate } from "@/shims/nav-bridge";
import type { StaffUser } from "@/lib/supabase/types";

export interface SessionOrg {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface SessionContext {
  /** Demo DATA mode — client/visit/billing records are synthetic. */
  demo: boolean;
  realUser: StaffUser | null;
  effectiveUser: StaffUser | null;
  impersonating: boolean;
  auditCtx: AuditContext;
  /** Features the EFFECTIVE user may use right now. */
  features: Set<FeatureKey>;
  /** Both-tier state for the effective user's organization (settings screens). */
  featureStates: FeatureState[];
  org: SessionOrg | null;
  /** Set when the API could not be reached; the login screen explains it. */
  apiError: string | null;
}

/** Shape of GET /api/auth/me. */
export interface ApiUser {
  id: string;
  orgId: string | null;
  email: string;
  fullName: string;
  role: Role;
  status: "Active" | "Suspended";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface MePayload {
  realUser: ApiUser;
  effectiveUser: ApiUser;
  impersonating: boolean;
  organization: SessionOrg | null;
  features: FeatureState[];
  effectiveFeatures: FeatureKey[];
}

const ANON: SessionContext = {
  demo: false,
  realUser: null,
  effectiveUser: null,
  impersonating: false,
  auditCtx: { performedBy: null, impersonating: null },
  features: new Set(),
  featureStates: [],
  org: null,
  apiError: null,
};

export function apiUserToStaff(u: ApiUser): StaffUser {
  return {
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    role: u.role,
    status: u.status,
    license_number: null,
    license_expiration_date: null,
    training_completed: [],
    org_id: u.orgId,
    is_account: true,
    must_change_password: u.mustChangePassword,
  };
}

// ── cache: one /me per navigation; any revalidation or auth action clears it ──
let cached: Promise<SessionContext> | null = null;
subscribeRevalidate(() => {
  cached = null;
});

export function invalidateSession(): void {
  cached = null;
}

export function getSessionContext(): Promise<SessionContext> {
  if (!isApiAuth()) return Promise.resolve(demoSession());
  if (!cached) {
    cached = apiSession().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

function demoSession(): SessionContext {
  const store = getDemoStore();
  const jar = cookies();
  const userId = jar.get(DEMO_USER_COOKIE)?.value;
  const realUser = store.data.users.find((u) => u.id === userId && u.status === "Active") ?? null;
  const featureStates = resolveFeatureStates([], []);
  if (!realUser) return { ...ANON, demo: true, featureStates };

  let effectiveUser = realUser;
  let impersonating = false;
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
    auditCtx: { performedBy: realUser.id, impersonating: impersonating ? effectiveUser.id : null },
    features: new Set(effectiveFeatureKeys(featureStates, effectiveUser.role)),
    featureStates,
    org: { id: "demo", name: "Durable Life Skills, Inc.", slug: "durable-life-skills", status: "active" },
    apiError: null,
  };
}

async function apiSession(): Promise<SessionContext> {
  let me: MePayload;
  try {
    me = await apiFetch<MePayload>("/auth/me");
  } catch (e) {
    if (isApiClientError(e) && e.status === 401) return { ...ANON, demo: isDemoMode() };
    if (isApiClientError(e) && e.code === "NETWORK") return { ...ANON, demo: isDemoMode(), apiError: e.message };
    throw e;
  }
  const realUser = apiUserToStaff(me.realUser);
  let effectiveUser = me.impersonating ? apiUserToStaff(me.effectiveUser) : realUser;
  let impersonating = me.impersonating;
  let features = new Set<FeatureKey>(me.effectiveFeatures);

  // DEMO: an Admin may also "view as" one of the synthetic demo staff (who
  // have no real account). The target lives in the cookie shim; the feature
  // set is recomputed for the demo user's role from the org's real switches.
  if (!impersonating && isDemoMode() && realUser.role === "Admin") {
    const targetId = cookies().get(DEMO_IMPERSONATE_COOKIE)?.value;
    if (targetId && targetId !== realUser.id) {
      const target = getDemoStore().data.users.find((u) => u.id === targetId && u.status === "Active");
      if (target) {
        effectiveUser = target;
        impersonating = true;
        features = new Set(effectiveFeatureKeys(me.features, target.role));
      }
    }
  }

  return {
    demo: isDemoMode(),
    realUser,
    effectiveUser,
    impersonating,
    auditCtx: { performedBy: realUser.id, impersonating: impersonating ? effectiveUser.id : null },
    features,
    featureStates: me.features,
    org: me.organization,
    apiError: null,
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

/** Feature gate (both tiers ∧ role grant) — optionally combined with a role list. */
export async function requireFeature(key: FeatureKey, ...allowed: Role[]): Promise<SessionContext> {
  const ctx = await requireRole(...allowed);
  if (!ctx.features.has(key)) throw new Error(`FEATURE_DISABLED:${key}`);
  return ctx;
}

export function hasFeature(ctx: SessionContext, key: FeatureKey): boolean {
  return ctx.features.has(key);
}

/** Impersonation control itself requires the REAL identity to be an Admin or the provider. */
export async function requireRealAdmin(): Promise<SessionContext> {
  const ctx = await requireSession();
  const role = ctx.realUser!.role;
  if (role !== "Admin" && role !== "Super_Admin") throw new Error("FORBIDDEN");
  return ctx;
}
