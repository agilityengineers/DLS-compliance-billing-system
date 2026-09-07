// Password setup after an invite/recovery callback. Demo mode deliberately
// cannot exercise this real-Supabase flow.
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
  const demo = isDemoMode();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    void createClient().auth.getSession().then(({ data }: any) => {
      if (!data.session) {
        setError("This reset link has expired or was already used. Request a new one from sign in.");
      }
      setReady(true);
    });
  }, [demo]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError("Could not set the password. Request a new reset link and try again.");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-card border border-border bg-card p-5 shadow-sm">
        <h1 className="font-serif text-xl font-semibold text-plum">Set your password</h1>
        {demo ? (
          <p className="text-sm text-muted-foreground">Password setup is available only in real mode.</p>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">Checking your link…</p>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Set password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}