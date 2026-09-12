// app/auth/set-password/page.tsx — the other end of an invitation or a
// password-reset link.
//
// The link carries a single-use token. The page checks it before showing a
// form, so somebody clicking an expired link is told why rather than typing a
// password into something that will fail. Setting the password signs every
// other device out and signs this one in.
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/api/client";
import { redeemPasswordLink } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TokenState {
  ok: boolean;
  fullName?: string;
  email?: string;
  message?: string;
}

export default function SetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const purpose = params.get("reset") ? "password_reset" : "invite";

  const [state, setState] = useState<TokenState | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ ok: false, message: "That link is incomplete. Ask for a new one." });
      return;
    }
    void apiFetch<{ ok: true; fullName: string; email: string }>(`/auth/token/${purpose}/${token}`)
      .then((r) => setState({ ok: true, fullName: r.fullName, email: r.email }))
      .catch((e) => setState({ ok: false, message: errorMessage(e, "That link is not valid. Ask for a new one.") }));
  }, [token, purpose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return setError("Use at least one letter and one number.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    const res = await redeemPasswordLink({ token, password, purpose });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Could not set the password. Ask for a new link.");
    router.replace(res.next ?? "/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-card border border-border bg-card p-5 shadow-sm">
        <div>
          <h1 className="font-serif text-xl font-semibold text-plum">
            {purpose === "invite" ? "Set up your account" : "Choose a new password"}
          </h1>
          {state?.ok && (
            <p className="text-sm text-muted-foreground">
              {state.fullName} · {state.email}
            </p>
          )}
        </div>

        {!state && <p className="text-sm text-muted-foreground">Checking your link…</p>}

        {state && !state.ok && (
          <div className="space-y-3">
            <p className="rounded-btn bg-pill-warning px-3 py-2 text-sm text-pill-warning-fg" role="alert">
              {state.message}
            </p>
            <Button variant="outline" className="w-full" onClick={() => router.replace("/login")}>
              Back to sign in
            </Button>
          </div>
        )}

        {state?.ok && (
          <form className="space-y-3" onSubmit={submit}>
            <p className="text-sm text-muted-foreground">At least 10 characters with a letter and a number.</p>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
              {busy ? "Saving…" : purpose === "invite" ? "Set password and sign in" : "Set password"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Setting a password signs out every other device on this account.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
