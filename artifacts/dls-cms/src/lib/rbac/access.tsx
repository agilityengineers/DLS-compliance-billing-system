// lib/rbac/access.tsx — the page gate. One call at the top of every screen:
//
//   const { ctx, denied } = await checkAccess({ feature: "qa.flags", roles: ["Admin", "Scheduler"] });
//   if (denied) return denied;
//
// Unauthenticated → /login. Wrong role, or a feature that is off at either
// tier / not granted to the role → a friendly explanation card instead of a
// redirect loop or a 500.
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getFeature, type FeatureKey, type Role } from "@workspace/features";
import { getSessionContext, type SessionContext } from "@/lib/auth/session";
import { AccessDenied } from "@/components/access-denied";

export interface AccessCheck {
  feature?: FeatureKey;
  /** Effective roles allowed. Defaults to Admin + Scheduler (the desktop console). */
  roles?: Role[];
}

export async function checkAccess(check: AccessCheck = {}): Promise<{ ctx: SessionContext; denied: ReactNode | null }> {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  const role = ctx.effectiveUser.role;
  const allowed = check.roles ?? ["Admin", "Scheduler"];
  if (!allowed.includes(role)) {
    return { ctx, denied: <AccessDenied reason={{ kind: "role", allowed, viewerRole: role }} /> };
  }
  if (check.feature && !ctx.features.has(check.feature)) {
    const state = ctx.featureStates.find((s) => s.key === check.feature);
    return {
      ctx,
      denied: (
        <AccessDenied
          reason={{ kind: "feature_off", def: getFeature(check.feature), platformEnabled: state?.platformEnabled ?? false, viewerRole: role }}
        />
      ),
    };
  }
  return { ctx, denied: null };
}
