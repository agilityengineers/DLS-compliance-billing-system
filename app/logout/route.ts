// app/logout/route.ts — link/redirect-friendly sign-out (idle timeout lands
// here). Clears demo + impersonation cookies and the Supabase session.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isDemoMode, DEMO_USER_COOKIE, DEMO_IMPERSONATE_COOKIE, IMPERSONATION_JWT_COOKIE } from "@/lib/demo/mode";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const jar = cookies();
  jar.delete(DEMO_USER_COOKIE);
  jar.delete(DEMO_IMPERSONATE_COOKIE);
  jar.delete(IMPERSONATION_JWT_COOKIE);
  if (!isDemoMode()) {
    await createClient().auth.signOut();
  }
  const url = new URL(request.url);
  const reason = url.searchParams.get("reason");
  return NextResponse.redirect(
    `${url.origin}/login${reason === "idle" ? "?error=idle_timeout" : ""}`
  );
}
