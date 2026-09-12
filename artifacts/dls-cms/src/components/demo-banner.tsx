// components/demo-banner.tsx — always-visible strip while demo DATA mode is
// active. The client asked that the demo be explicit about what's simulated:
// this banner + PRODUCTION-READINESS.md §4 are that contract.
import { isDemoMode } from "@/lib/demo/mode";
import { isApiAuth } from "@/lib/auth/mode";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-foreground px-3 py-1 text-center">
      <span className="label-caps text-amber-300">Demo data</span>
      <span className="text-xs text-white/80">
        Client, visit and billing records are synthetic (no PHI) and reset on restart.
        {isApiAuth() ? " Accounts, roles and feature settings are real." : " Role-picker sign-in."}
      </span>
    </div>
  );
}
