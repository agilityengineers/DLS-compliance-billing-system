// components/field/sync-status.tsx — visible sync indicator for the field app.
// Also surfaces server-side RULE REJECTIONS (geofence, NMT cap, closed
// records) so offline-authored writes never fail silently.
"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Check, AlertTriangle, X } from "lucide-react";
import { SyncEngine, type SyncState } from "@/lib/offline/syncEngine";
import { cn } from "@/lib/utils";

export function SyncStatus() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    SyncEngine.start();
    return SyncEngine.subscribe(setState);
  }, []);

  if (!state) return null;
  const { online, syncing, pendingCount, lastSyncAt, rejected } = state;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs",
          !online
            ? "border-pill-warning bg-pill-warning text-pill-warning-fg"
            : pendingCount > 0
              ? "border-plum-soft bg-plum-soft text-plum"
              : "border-pill-success bg-pill-success text-pill-success-fg"
        )}
        role="status"
        aria-live="polite"
      >
        {!online ? <CloudOff className="h-3.5 w-3.5" /> : syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        <span>
          {!online
            ? `Offline — ${pendingCount} pending`
            : syncing
              ? "Syncing…"
              : pendingCount > 0
                ? `${pendingCount} pending`
                : `Synced${lastSyncAt ? ` · ${lastSyncAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`}
        </span>
        {pendingCount > 0 && online && !syncing && (
          <button className="font-semibold underline" onClick={() => void SyncEngine.drain()}>
            Retry
          </button>
        )}
      </div>

      {rejected.length > 0 && (
        <div className="fixed inset-x-3 top-16 z-50 mx-auto max-w-md space-y-2">
          {rejected.map((r, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-card-m border border-pill-danger bg-pill-danger p-3 text-sm text-pill-danger-fg shadow-lg"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">
                <strong className="font-semibold">Sync rejected ({r.table.replace(/_/g, " ")}):</strong> {r.error}
              </span>
              <button aria-label="Dismiss" onClick={() => SyncEngine.clearRejected()}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
