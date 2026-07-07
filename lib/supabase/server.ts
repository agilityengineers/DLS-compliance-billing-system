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
 * Service-role client. BYPASSES RLS — server-only, never import from client code.
 * Used for: audit queries, billing exports, admin manual EVV adjustments.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
