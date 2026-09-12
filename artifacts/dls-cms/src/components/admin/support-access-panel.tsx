// components/admin/support-access-panel.tsx — the organization's side of
// provider support (Settings → Support access).
//
// This is the control that makes the promise real: the provider has no
// standing way into your records, and cannot give itself one. Opening a window
// is a deliberate act with a reason and an end time, and closing it early is
// one click. Think of it as buzzing someone through the front door rather than
// giving them a key that lives on their ring.
"use client";

import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { orgApi, type SupportWindowRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function minutesLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

export function SupportAccessPanel() {
  const [windows, setWindows] = useState<SupportWindowRow[] | null>(null);
  const [maxHours, setMaxHours] = useState(8);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await orgApi.supportWindows();
      setWindows(r.windows);
      setMaxHours(r.maxHours);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (error && !windows) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!windows) return <p className="text-sm text-muted-foreground">Loading support access…</p>;

  const open = windows.filter((w) => w.active);

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-card p-4 text-sm">
        <h3 className="flex items-center gap-2 font-medium">
          <LifeBuoy className="h-4 w-4 text-plum-accent" /> How this works
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Your provider cannot open your records. Nothing they do gives them access to them.</li>
          <li>
            When you need help, open a window. For as long as it lasts, they can see the app exactly as one of your
            people sees it — and every action is logged under their name.
          </li>
          <li>A window closes by itself at the time you set, or the moment you close it here.</li>
        </ul>
      </div>

      {open.length > 0 && (
        <div className="space-y-2 rounded-card border border-pill-warning-fg/30 bg-pill-warning p-4">
          <h3 className="font-medium text-pill-warning-fg">Support access is open</h3>
          {open.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-pill-warning-fg">
              <span>
                Closes in {minutesLeft(w.expiresAt)} minute{minutesLeft(w.expiresAt) === 1 ? "" : "s"} ({fmt(w.expiresAt)}) —
                &ldquo;{w.reason}&rdquo;
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === w.id}
                onClick={async () => {
                  setBusy(w.id);
                  setError(null);
                  try {
                    await orgApi.revokeSupportWindow(w.id);
                    await load();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Close now
              </Button>
            </div>
          ))}
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy("grant");
          setError(null);
          try {
            await orgApi.grantSupportWindow({ reason, hours });
            setReason("");
            await load();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(null);
          }
        }}
      >
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="window-reason">What do you need help with?</Label>
          <Input
            id="window-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Billing export is failing for two clients"
            required
            minLength={4}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="window-hours">For how long</Label>
          <select
            id="window-hours"
            className="h-10 w-32 rounded-btn border border-border bg-card px-3 text-sm"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            {[1, 2, 4, 8, 12, 24].filter((h) => h <= maxHours).map((h) => (
              <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={busy === "grant" || reason.trim().length < 4}>
          {busy === "grant" ? "Opening…" : "Open a window"}
        </Button>
        {error && <p className="w-full text-sm text-destructive" role="alert">{error}</p>}
      </form>

      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-9 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr><th>Opened</th><th>Reason</th><th>By</th><th>Until</th><th>State</th></tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t [&_tr]:border-border">
            {windows.map((w) => (
              <tr key={w.id}>
                <td className="whitespace-nowrap text-muted-foreground">{fmt(w.createdAt)}</td>
                <td>{w.reason}</td>
                <td className="text-muted-foreground">{w.grantedByName}</td>
                <td className="whitespace-nowrap text-muted-foreground">{fmt(w.expiresAt)}</td>
                <td>
                  {w.active ? (
                    <Badge variant="warning">Open</Badge>
                  ) : w.revokedAt ? (
                    <Badge variant="muted">Closed by {w.revokedByName ?? "an admin"}</Badge>
                  ) : (
                    <Badge variant="muted">Expired</Badge>
                  )}
                </td>
              </tr>
            ))}
            {windows.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">You have never opened a support window.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
