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

/**
 * Production tripwire — call from a SERVER entry point (the root layout).
 *
 * NEXT_PUBLIC_* values are inlined at BUILD time, so a build that ran without
 * the Supabase settings compiles isDemoMode() to `true` for good, even if
 * the running process later receives real credentials. That deployment would
 * serve the in-memory demo store and the password-free role picker as
 * "production". Demo mode must therefore never coexist with production-only
 * secrets: refuse to serve rather than fail open (PRODUCTION-READINESS.md §1).
 */
export function assertDemoModeIsIntentional(): void {
  if (!isDemoMode()) return;
  const signals: string[] = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) signals.push("SUPABASE_SERVICE_ROLE_KEY is set");
  if (process.env.BAA_SIGNED_ALL_VENDORS === "true") signals.push("BAA_SIGNED_ALL_VENDORS=true");
  if (signals.length === 0) return;
  throw new Error(
    `DEMO_MODE_MISCONFIGURED: demo mode is active but ${signals.join(" and ")}. ` +
      "Either remove the production secrets from this environment, or rebuild with " +
      "NEXT_PUBLIC_DEMO_MODE=false and the NEXT_PUBLIC_SUPABASE_* settings present at BUILD time."
  );
}

/** Cookie carrying the signed-in demo user's id (httpOnly, server-set). */
export const DEMO_USER_COOKIE = "dls_demo_user";
/** Cookie carrying the impersonation target's id in demo mode (httpOnly). */
export const DEMO_IMPERSONATE_COOKIE = "dls_demo_impersonate";
/** Cookie carrying the signed impersonation JWT in real (Supabase) mode. */
export const IMPERSONATION_JWT_COOKIE = "dls_imp_jwt";
