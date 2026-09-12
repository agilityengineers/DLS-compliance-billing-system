"use client";

import { useState } from "react";
import { stopImpersonation } from "@/lib/auth/impersonation";

export function ClientExitButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {error && <span role="alert" className="text-xs font-bold text-destructive">{error}</span>}
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await stopImpersonation();
            if (!res.ok) {
              setError(res.error || "Failed to exit session.");
              setPending(false);
              return;
            }
            // Force full navigation to wipe memory, React Query cache, and reset router state
            window.location.href = "/";
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to exit session.");
            setPending(false);
          }
        }}
        className="rounded-full bg-pill-warning-fg/10 px-4 py-1 text-xs font-bold text-pill-warning-fg transition-colors hover:bg-pill-warning-fg/20 disabled:opacity-50"
      >
        {pending ? "Exiting..." : error ? "Retry exit" : "Exit session"}
      </button>
    </div>
  );
}
