// lib/supabase/server.ts — STUB for the client-only demo build.
//
// The migrated app runs entirely in demo mode (in-memory store, no Supabase).
// These functions are imported statically by the repo layer but are only ever
// invoked on the non-demo (real Supabase) code path, which is unreachable in
// this build. If real mode is wired up, restore the user/data clients plus
// the narrowly-scoped service client used only for admin invites and
// impersonation audit events. Never expose its service-role key to Vite.

function unavailable(): never {
  throw new Error(
    "Supabase is not available in this build — the app runs in demo mode only.",
  );
}

export function createClient(): any {
  return new Proxy({}, {
    get() {
      return unavailable();
    },
  });
}

export function createDataClient(): any {
  return new Proxy({}, {
    get() {
      return unavailable();
    },
  });
}

export function createServiceClient(): any {
  return new Proxy({}, {
    get() {
      return unavailable();
    },
  });
}
