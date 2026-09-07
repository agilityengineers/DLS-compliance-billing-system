// app/auth/reset/page.tsx — set a new password after a recovery or invite
// link. The link lands on /auth/callback, which exchanges the code for a
// session and hops here; updateUser() then changes the password.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isDemoMode } from "@/lib/demo/mode";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const demo = isDemoMode();

  useEffect(() => {
    if (demo) return;
    createClient().auth.getSession().then(({ data }) => {
      if (!data.session) setError("This reset link has expired or was already used. Request a new one from the sign-in page.");
      setReady(true);
    });
  }, [demo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) { setError("Use at least 10 characters."); return; }
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) { setError("Could not set the password. Request a new reset link and try again."); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-card border border-border bg-card p-5 shadow-sm">
        <h1 className="font-serif text-xl font-semibold text-plum">Set your password</h1>
        {demo ? (
          <p className="text-sm text-muted-foreground">Password reset is not available in demo mode.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !ready}>{busy ? "Saving…" : "Save password"}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
