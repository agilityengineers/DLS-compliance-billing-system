// lib/auth/actions.ts — sign-in/out actions (API accounts + demo picker).
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { homePathForRole, type Role } from "@workspace/features";
import { isDemoMode, DEMO_USER_COOKIE, DEMO_IMPERSONATE_COOKIE, IMPERSONATION_JWT_COOKIE } from "@/lib/demo/mode";
import { isApiAuth } from "@/lib/auth/mode";
import { apiFetch, errorMessage, isApiClientError } from "@/lib/api/client";
import { invalidateSession, type ApiUser } from "@/lib/auth/session";
import { getDemoStore } from "@/lib/data/demo/store";

export interface SignInResult {
  ok: boolean;
  error?: string;
  code?: string;
  /** Where to send the user next. */
  next?: string;
}

/** Real sign-in: the API server verifies the password and sets the session cookie. */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  if (!isApiAuth()) return { ok: false, error: "Password sign-in is not available in demo mode." };
  try {
    const res = await apiFetch<{ user: ApiUser; mustChangePassword: boolean }>("/auth/login", {
      method: "POST",
      json: { email, password },
    });
    invalidateSession();
    const home = homePathForRole(res.user.role as Role);
    return { ok: true, next: res.mustChangePassword ? `/auth/reset?next=${encodeURIComponent(home)}` : home };
  } catch (e) {
    if (isApiClientError(e)) return { ok: false, error: e.message, code: e.code };
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * DEMO: role-picker sign-in. Exists so a reviewer can tour all three roles
 * with zero setup. Never reachable when real accounts are in use.
 */
export async function demoSignIn(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (isApiAuth() || !isDemoMode()) return { ok: false, error: "Demo sign-in is disabled: sign in with your email and password." };
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
  redirect(homePathForRole(user.role));
}

/** Signs out of everything: API session, demo cookies, impersonation. */
export async function signOut(): Promise<never> {
  const jar = cookies();
  jar.delete(DEMO_USER_COOKIE);
  jar.delete(DEMO_IMPERSONATE_COOKIE);
  jar.delete(IMPERSONATION_JWT_COOKIE);
  if (isApiAuth()) {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // already signed out or the API is unreachable — the cookie is gone either way
    }
  }
  invalidateSession();
  redirect("/login");
}
