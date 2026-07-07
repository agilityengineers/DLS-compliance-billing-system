// lib/supabase/server.ts — server clients for RSC / server actions / routes
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** RLS-enforced server client bound to the signed-in user's session. */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all: { name: string; value: string; options?: CookieOptions }[]) => {
          try {
            all.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* called from a Server Component — middleware refreshes sessions */
          }
        }
      }
    }
  );
}

/**
 * Data client for server actions/pages: same as createClient(), but when an
 * impersonation JWT cookie is present (Admin "view as user"), PostgREST
 * requests carry that token instead of the session token. The JWT keeps
 * sub = the ADMIN (auth.uid() unchanged for RLS + audit) and adds the
 * `impersonating` claim that the audit trigger records (migration 0002).
 */
export function createDataClient() {
  const impJwt = cookies().get("dls_imp_jwt")?.value;
  if (!impJwt) return createClient();
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${impJwt}` } },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          /* data client never mutates auth cookies */
        }
      }
    }
  );
}

/**
 * Service-role client. BYPASSES RLS — server-only, never import from client
 * code. Restricted to call sites that CANNOT run as the user (audit queries
 * across users, claim export ledger, payroll snapshot, notification job,
 * OAuth first-profile insert). Every other admin write goes through
 * createDataClient() so RLS + audit attribution hold
 * (PRODUCTION-READINESS.md §4.2).
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
