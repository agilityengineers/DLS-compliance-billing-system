// lib/supabase/client.ts — STUB for the client-only demo build.
"use client";

export function createClient(): any {
  return new Proxy({}, {
    get() {
      throw new Error(
        "Supabase is not available in this build — the app runs in demo mode only.",
      );
    },
  });
}
