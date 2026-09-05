// app/auth/callback/route.ts — OAuth / magic-link code exchange.
// Supabase redirects here after Google Sign-In, an invite link, or a
// password-recovery link. We exchange the code for a session cookie, require
// a PROVISIONED profile (invite-only — no self-registration into a PHI
// system), then route by role or to the `next` hop (e.g. /auth/reset).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only same-origin relative paths may be used as a post-login hop. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;
  const next = safeNext(url.searchParams.get("next"));

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  const { data: profile } = await supabase
    .from("users").select("role,status").eq("id", data.user.id).maybeSingle();

  if (!profile) {
    // No provisioned profile: the account was never invited by an Admin.
    // Sign the session out again so the token cannot be used for anything.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_provisioned`);
  }
  if (profile.status !== "Active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=suspended`);
  }

  if (next) return NextResponse.redirect(`${origin}${next}`);
  return NextResponse.redirect(`${origin}${profile.role === "Field_Staff" ? "/field" : "/admin"}`);
}
