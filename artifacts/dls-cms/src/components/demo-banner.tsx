// components/demo-banner.tsx — always-visible strip while demo mode is active.
// The client asked that the demo be explicit about what's simulated: this
// banner + PRODUCTION-READINESS.md §4 are that contract.
import { isDemoMode } from "@/lib/demo/mode";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-foreground px-3 py-1 text-center">
      <span className="label-caps text-amber-300">Demo mode</span>
      <span className="text-xs text-white/80">
        Synthetic data only — no PHI. Resets on restart. See PRODUCTION-READINESS.md before go-live.
      </span>
    </div>
  );
}
