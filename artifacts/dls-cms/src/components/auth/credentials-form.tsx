// components/auth/credentials-form.tsx — email + password sign-in.
// The API server verifies the password and sets the httpOnly session cookie;
// this form only carries the result to the right home screen.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CredentialsForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signInWithPassword(email, password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Sign-in failed. Try again.");
      return;
    }
    router.replace(res.next ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3.5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading || !email || !password}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={() => setShowHelp((s) => !s)}
        className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground"
      >
        Forgot password?
      </button>
      {showHelp && (
        <p className="rounded-btn bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
          Ask your administrator to reset your password. They can issue a one-time password from
          Settings &rarr; Accounts, and you will choose a new one when you sign in.
        </p>
      )}
    </form>
  );
}
