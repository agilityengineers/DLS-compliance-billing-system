// app/auth/callback/route.ts — OAuth code exchange (Google Sign-In).
// Supabase redirects here after the provider flow; we exchange the code for
// a session cookie, ensure a users-profile row exists, then route by role.
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  // First Google sign-in: create the app profile. New OAuth users default to
  // Field_Staff; an Admin promotes them in Settings & users.
  const { data: profile } = await supabase
    .from("users").select("role,status").eq("id", data.user.id).maybeSingle();

  let role = profile?.role as string | undefined;
  if (!profile) {
    const service = createServiceClient();
    const fullName =
      (data.user.user_metadata?.full_name as string | undefined) ??
      data.user.email?.split("@")[0] ??
      "New user";
    await service.from("users").insert({
      id: data.user.id,
      email: data.user.email,
      full_name: fullName,
      role: "Field_Staff",
      status: "Active"
    });
    role = "Field_Staff";
  } else if (profile.status !== "Active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=suspended`);
  }

  return NextResponse.redirect(`${origin}${role === "Field_Staff" ? "/field" : "/admin"}`);
}
