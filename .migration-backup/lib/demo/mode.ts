// lib/demo/mode.ts — single source of truth for demo mode.
// Safe on both server and client (NEXT_PUBLIC_ vars are inlined at build).
//
// DEMO MODE = deterministic in-memory synthetic dataset, no PHI, no external
// services. Active when explicitly enabled OR when Supabase isn't configured,
// so a fresh clone / Replit import always boots into a working, clearly
// labeled demo. Every demo-only compromise is tracked in
// PRODUCTION-READINESS.md §4.

export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return false;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** Cookie carrying the signed-in demo user's id (httpOnly, server-set). */
export const DEMO_USER_COOKIE = "dls_demo_user";
/** Cookie carrying the impersonation target's id in demo mode (httpOnly). */
export const DEMO_IMPERSONATE_COOKIE = "dls_demo_impersonate";
/** Cookie carrying the signed impersonation JWT in real (Supabase) mode. */
export const IMPERSONATION_JWT_COOKIE = "dls_imp_jwt";
