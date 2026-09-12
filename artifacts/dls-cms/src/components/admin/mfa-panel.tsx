// components/admin/mfa-panel.tsx — the signed-in person's own second factor.
//
// Enrolment is deliberately three small steps with the secret visible as text:
// there is no QR code here, because rendering one would mean pulling in an
// image library for a screen that is used once per account. Every
// authenticator app accepts a typed key, and the key is shown in groups of
// four so it can be read aloud or copied.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { mfaApi } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function grouped(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(" ");
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          /* clipboard blocked — the value is on screen to copy by hand */
        }
      }}
      className="inline-flex items-center gap-1 rounded-btn border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function MfaPanel({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // ── freshly enrolled: show the recovery codes exactly once ──────────────
  if (recoveryCodes) {
    return (
      <section className="space-y-3 rounded-card border border-pill-success-fg/30 bg-pill-success p-4 text-pill-success-fg">
        <h3 className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4" /> Two-factor sign-in is on
        </h3>
        <p className="text-sm">
          Save these recovery codes somewhere you can reach without your phone. Each one works once, and they are
          shown only now.
        </p>
        <ul className="grid grid-cols-2 gap-1.5 rounded-btn bg-white p-3 font-mono text-sm text-foreground sm:grid-cols-3">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={recoveryCodes.join("\n")} label="Copy all" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRecoveryCodes(null);
              router.refresh();
            }}
          >
            I have saved them
          </Button>
        </div>
      </section>
    );
  }

  // ── already enrolled ────────────────────────────────────────────────────
  if (enabled) {
    return (
      <section className="space-y-3 rounded-card border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4 text-pill-success-fg" /> Two-factor sign-in
          </h3>
          <Badge variant="success">On</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Signing in asks for a six-digit code from your authenticator app after your password.
          {required && " This deployment requires it on provider accounts, so it cannot be turned off here."}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="mfa-password">Your password</Label>
            <Input
              id="mfa-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-56"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !password}
            onClick={() =>
              void run(async () => {
                const r = await mfaApi.regenerateRecoveryCodes(password);
                setPassword("");
                setRecoveryCodes(r.recoveryCodes);
              })
            }
          >
            New recovery codes
          </Button>
          {!required && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !password}
              onClick={() =>
                void run(async () => {
                  await mfaApi.disable(password);
                  setPassword("");
                  setNotice("Two-factor sign-in is off for your account.");
                  router.refresh();
                })
              }
            >
              Turn off
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}
      </section>
    );
  }

  // ── not enrolled ────────────────────────────────────────────────────────
  return (
    <section className={`space-y-3 rounded-card border p-4 ${required ? "border-pill-warning-fg/40 bg-pill-warning" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Two-factor sign-in</h3>
        <Badge variant={required ? "destructive" : "muted"}>{required ? "Required" : "Off"}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {required
          ? "This deployment requires a second factor on provider accounts. Until you enrol, the console is closed to you."
          : "Add a six-digit code from an authenticator app to your password. It is the difference between one lost secret and two."}
      </p>

      {!secret && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await mfaApi.setup();
              setSecret(r.secret);
              setUri(r.uri);
            })
          }
        >
          {busy ? "Preparing…" : "Set it up"}
        </Button>
      )}

      {secret && (
        <div className="space-y-3">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Open your authenticator app and add an account by entering a key.
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="rounded-btn bg-muted px-3 py-1.5 font-mono text-sm tracking-wider">{grouped(secret)}</code>
                <CopyButton value={secret} label="Copy key" />
                {uri && <CopyButton value={uri} label="Copy setup link" />}
              </div>
            </li>
            <li>
              Type the six-digit code it shows.
              <form
                className="mt-1.5 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const r = await mfaApi.enable(code);
                    setCode("");
                    setSecret(null);
                    setRecoveryCodes(r.recoveryCodes);
                  });
                }}
              >
                <Input
                  aria-label="Six-digit code"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  className="w-32 tracking-[0.3em]"
                />
                <Button type="submit" size="sm" disabled={busy || code.length < 6}>
                  {busy ? "Checking…" : "Turn on"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSecret(null)}>
                  Cancel
                </Button>
              </form>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            The key is shown as text rather than a QR code; every authenticator app accepts a typed key.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </section>
  );
}
