// app/auth/reset/page.tsx — choose a new password (after a temporary one, or
// any time from the account menu). The API server checks the current
// password, stores the new hash, and signs out every other device.
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isApiAuth } from "@/lib/auth/mode";
import { apiFetch, errorMessage } from "@/lib/api/client";
import { invalidateSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const apiAuth = isApiAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      await apiFetch("/auth/change-password", { method: "POST", json: { currentPassword: current, newPassword: password } });
    } catch (e) {
      setBusy(false);
      return setError(errorMessage(e, "Could not set the password. Try again."));
    }
    setBusy(false);
    invalidateSession();
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-card border border-border bg-card p-5 shadow-sm">
        <div>
          <h1 className="font-serif text-xl font-semibold text-plum">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">At least 10 characters with a letter and a number.</p>
        </div>
        {!apiAuth ? (
          <p className="text-sm text-muted-foreground">Password changes are available only with real accounts.</p>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current (or temporary) password</Label>
              <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !current || !password || !confirm}>
              {busy ? "Saving…" : "Set password"}
            </Button>
            <button type="button" onClick={() => router.push(next)} className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground">
              Not now
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
