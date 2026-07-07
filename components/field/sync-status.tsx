// components/field/sync-status.tsx — visible sync indicator for the field app
"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Check } from "lucide-react";
import { SyncEngine, type SyncState } from "@/lib/offline/syncEngine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncStatus() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    SyncEngine.start();
    return SyncEngine.subscribe(setState);
  }, []);

  if (!state) return null;
  const { online, syncing, pendingCount, lastSyncAt, lastError } = state;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
        !online ? "border-amber-300 bg-amber-50 text-amber-900"
        : pendingCount > 0 ? "border-blue-200 bg-blue-50 text-blue-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900"
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
      {(pendingCount > 0 || lastError) && online && !syncing && (
        <Button variant="ghost" size="sm" className="h-6 min-h-0 px-2 text-xs" onClick={() => void SyncEngine.drain()}>
          Retry
        </Button>
      )}
    </div>
  );
}
