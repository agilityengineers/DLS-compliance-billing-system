// components/impersonation-banner.tsx — REQUIRED by the impersonation spec:
// a visible banner during impersonation with one-tap exit. Server component;
// exit posts the stopImpersonation server action.
import { getSessionContext } from "@/lib/auth/session";
import { ClientExitButton } from "@/components/client-exit-button";
import { ROLE_LABELS } from "@workspace/features";

export async function ImpersonationBanner() {
  const ctx = await getSessionContext();
  if (!ctx.impersonating || !ctx.effectiveUser || !ctx.realUser) return null;

  const targetRole = ROLE_LABELS[ctx.effectiveUser.role] || ctx.effectiveUser.role;
  const targetOrg = ctx.org?.name || "Platform";

  return (
    <div className="sticky top-0 z-[100] flex flex-wrap items-center justify-between gap-3 bg-pill-warning px-4 py-2.5 shadow-md sm:justify-center">
      <div className="flex-1 text-sm font-medium leading-tight text-pill-warning-fg sm:flex-none">
        <strong className="font-bold">Viewing as {ctx.effectiveUser.full_name}</strong>
        <span className="opacity-80"> ({targetRole} · {targetOrg})</span>
        <span className="hidden sm:inline">
          {" · "}every action is logged under your identity ({ctx.realUser.full_name})
        </span>
        <div className="mt-0.5 text-xs opacity-80 sm:hidden">
          Logged under {ctx.realUser.full_name}
        </div>
      </div>
      <div className="shrink-0">
        <ClientExitButton />
      </div>
    </div>
  );
}
