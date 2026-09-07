// SPA equivalent of the Next OAuth/invite callback. It rejects unprovisioned
// accounts instead of silently self-registering them.
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/demo/mode";

function safeNext(raw: string | null): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}

export default function AuthCallbackPage() {
  useEffect(() => {
    if (isDemoMode()) {
      window.location.replace("/login?error=oauth_failed");
      return;
    }
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (!code) return window.location.replace("/login?error=missing_code");
      const supabase = createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) return window.location.replace("/login?error=oauth_failed");
      const { data: profile } = await supabase
        .from("users").select("role,status").eq("id", data.user.id).maybeSingle();
      if (!profile) {
        await supabase.auth.signOut();
        return window.location.replace("/login?error=not_provisioned");
      }
      if (profile.status !== "Active") {
        await supabase.auth.signOut();
        return window.location.replace("/login?error=suspended");
      }
      const next = safeNext(params.get("next"));
      window.location.replace(next ?? (profile.role === "Field_Staff" ? "/field" : "/admin"));
    })();
  }, []);
  return <p className="p-6 text-sm text-muted-foreground">Completing sign in…</p>;
}