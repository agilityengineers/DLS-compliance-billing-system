// lib/auth/actions.ts — sign-in/out server actions (demo + real).
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode, DEMO_USER_COOKIE, DEMO_IMPERSONATE_COOKIE, IMPERSONATION_JWT_COOKIE } from "@/lib/demo/mode";
import { getDemoStore } from "@/lib/data/demo/store";
import { createClient } from "@/lib/supabase/server";

/**
 * DEMO: role-picker sign-in. Exists so the client can tour all three roles
 * with zero auth setup. Must never be reachable outside demo mode
 * (PRODUCTION-READINESS.md §4.1).
 */
export async function demoSignIn(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isDemoMode()) return { ok: false, error: "Demo sign-in is disabled outside demo mode." };
  const store = getDemoStore();
  const user = store.data.users.find((u) => u.id === userId && u.status === "Active");
  if (!user) return { ok: false, error: "Unknown demo user." };

  cookies().set(DEMO_USER_COOKIE, user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8
  });
  store.audit("auth", "INSERT", user.id, null, { event: "demo_sign_in", user: user.full_name },
    { performedBy: user.id, impersonating: null });
  redirect(user.role === "Field_Staff" ? "/field" : "/admin");
}

/** Signs out of everything: demo cookies, impersonation, Supabase session. */
export async function signOut(): Promise<never> {
  const jar = cookies();
  jar.delete(DEMO_USER_COOKIE);
  jar.delete(DEMO_IMPERSONATE_COOKIE);
  jar.delete(IMPERSONATION_JWT_COOKIE);
  if (!isDemoMode()) {
    const supabase = createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
