// components/field/sync-status.tsx — visible sync indicator for the field app.
// Surfaces PARKED writes (server rule rejections and exhausted retries) from
// the durable sync_failed list so offline-authored work never fails silently
// — with Retry and Dismiss per item — and the paused state after a 401.
"use client";

import { useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, Check, AlertTriangle, X, LogIn } from "lucide-react";
import { SyncEngine, type SyncState } from "@/lib/offline/syncEngine";
import { cn } from "@/lib/utils";

export function SyncStatus() {
  const [state, setState] = useState<SyncState | null>(null);
  const [open, setOpen] = useState(false);
  const seen = useRef(0);

  useEffect(() => {
    SyncEngine.start();
    return SyncEngine.subscribe(setState);
  }, []);

  // A newly parked item opens the list so the user sees it right away.
  useEffect(() => {
    const n = state?.failed.length ?? 0;
    if (n > seen.current) setOpen(true);
    seen.current = n;
  }, [state?.failed.length]);

  if (!state) return null;
  const { online, syncing, pendingCount, lastSyncAt, failed, authRequired } = state;

  const label = authRequired
    ? `Sign in to sync${pendingCount > 0 ? ` — ${pendingCount} waiting` : ""}`
    : !online
      ? `Offline — ${pendingCount} pending`
      : syncing
        ? "Syncing…"
        : pendingCount > 0
          ? `${pendingCount} pending`
          : `Synced${lastSyncAt ? ` · ${lastSyncAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs",
          authRequired || !online
            ? "border-pill-warning bg-pill-warning text-pill-warning-fg"
            : pendingCount > 0
              ? "border-plum-soft bg-plum-soft text-plum"
              : "border-pill-success bg-pill-success text-pill-success-fg"
        )}
        role="status"
        aria-live="polite"
      >
        {authRequired ? <LogIn className="h-3.5 w-3.5" /> : !online ? <CloudOff className="h-3.5 w-3.5" /> : syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        <span>{label}</span>
        {authRequired ? (
          <a href="/login?error=session_expired" className="font-semibold underline">Sign in</a>
        ) : (
          pendingCount > 0 && online && !syncing && (
            <button className="font-semibold underline" onClick={() => void SyncEngine.drain({ force: true })}>
              Retry
            </button>
          )
        )}
      </div>

      {failed.length > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-pill border border-pill-danger bg-pill-danger px-2.5 py-1.5 text-xs font-semibold text-pill-danger-fg"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {failed.length} need{failed.length === 1 ? "s" : ""} attention
        </button>
      )}

      {open && failed.length > 0 && (
        <div className="fixed inset-x-3 top-16 z-50 mx-auto max-w-md space-y-2" role="region" aria-label="Sync problems">
          {failed.map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-2 rounded-card-m border border-pill-danger bg-pill-danger p-3 text-sm text-pill-danger-fg shadow-lg"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">
                <strong className="font-semibold">
                  {f.kind === "rejected" ? "Rejected" : "Could not reach the server"} ({f.table.replace(/_/g, " ")}):
                </strong>{" "}
                {f.error}
                <span className="mt-1 block text-xs opacity-80">
                  {new Date(f.failed_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {f.kind === "exhausted" ? ` · ${f.attempts} attempts` : ""}
                </span>
              </span>
              <button className="text-xs font-semibold underline" onClick={() => void SyncEngine.retryFailed(f.id!)}>
                Retry
              </button>
              <button aria-label="Dismiss" onClick={() => void SyncEngine.dismissFailed(f.id!)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-card-m border border-border bg-card p-2 text-xs text-muted-foreground shadow-lg">
            <span>Dismissing removes an item from this list only; the record stays on this device marked unsynced.</span>
            <button className="ml-2 shrink-0 font-semibold text-foreground underline" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
