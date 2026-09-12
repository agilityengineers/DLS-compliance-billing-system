// components/auth/credentials-form.tsx — email + password sign-in, and the
// second step when the account has a second factor.
//
// The API server verifies both and sets the httpOnly session cookie; this form
// only carries the result to the right home screen. Nothing is signed in
// between the two steps: the handle the server returns is short-lived, single
// use, and is not a session.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeMfaSignIn, requestPasswordReset, signInWithPassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "password" | "code" | "forgot";

export function CredentialsForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function finish(next: string | undefined) {
    router.replace(next ?? "/");
    router.refresh();
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signInWithPassword(email, password);
    setLoading(false);
    if (!res.ok) return setError(res.error ?? "Sign-in failed. Try again.");
    if (res.mfaRequired && res.mfaToken) {
      setMfaToken(res.mfaToken);
      setPassword("");
      setStep("code");
      return;
    }
    finish(res.next);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await completeMfaSignIn({
      mfaToken,
      ...(useRecoveryCode ? { recoveryCode: code } : { code }),
    });
    setLoading(false);
    if (!res.ok) {
      setCode("");
      // An expired handle means starting over rather than retyping the code.
      if (res.code === "MFA_EXPIRED") {
        setStep("password");
        return setError("That sign-in timed out. Enter your password again.");
      }
      return setError(res.error ?? "That code is not valid.");
    }
    finish(res.next);
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    await requestPasswordReset(email);
    setLoading(false);
    setStep("password");
    setNotice("If that address has an account, a reset link is on its way. The link expires shortly.");
  }

  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="space-y-3.5" noValidate>
        <div>
          <h2 className="font-medium">Enter your code</h2>
          <p className="text-sm text-muted-foreground">
            {useRecoveryCode
              ? "Type one of the recovery codes you saved when you set this up."
              : "Open your authenticator app and type the six-digit code for the DLS Portal."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mfa-code">{useRecoveryCode ? "Recovery code" : "Six-digit code"}</Label>
          <Input
            id="mfa-code"
            name="code"
            inputMode={useRecoveryCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={useRecoveryCode ? "ABCDE-FGHIJ" : "123456"}
            className={useRecoveryCode ? undefined : "tracking-[0.4em]"}
          />
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
          {loading ? "Checking…" : "Sign in"}
        </Button>
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setUseRecoveryCode((r) => !r);
              setCode("");
              setError(null);
            }}
            className="text-muted-foreground underline hover:text-foreground"
          >
            {useRecoveryCode ? "Use the app instead" : "Lost your phone?"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("password");
              setCode("");
              setError(null);
            }}
            className="text-muted-foreground underline hover:text-foreground"
          >
            Start again
          </button>
        </div>
      </form>
    );
  }

  if (step === "forgot") {
    return (
      <form onSubmit={submitForgot} className="space-y-3.5" noValidate>
        <div>
          <h2 className="font-medium">Reset your password</h2>
          <p className="text-sm text-muted-foreground">
            We will send a single-use link to your work address. Your administrator can also issue one.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !email}>
          {loading ? "Sending…" : "Send the link"}
        </Button>
        <button
          type="button"
          onClick={() => setStep("password")}
          className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="space-y-3.5" noValidate>
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
      {notice && <p className="rounded-btn bg-pill-success px-3 py-2 text-sm text-pill-success-fg" role="status">{notice}</p>}
      <Button type="submit" className="w-full" disabled={loading || !email || !password}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setStep("forgot");
          setError(null);
          setNotice(null);
        }}
        className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground"
      >
        Forgot password?
      </button>
    </form>
  );
}
