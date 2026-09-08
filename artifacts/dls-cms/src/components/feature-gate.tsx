// components/feature-gate.tsx — client-side gate for screens that are
// themselves client components (offline-first field screens). Mirrors
// lib/rbac/access.tsx for async pages.
"use client";

import type { ReactNode } from "react";
import { getFeature, type FeatureKey } from "@workspace/features";
import { useSessionInfo } from "@/components/session-context";
import { AccessDenied } from "@/components/access-denied";

export function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const { features, role } = useSessionInfo();
  if (features.includes(feature)) return <>{children}</>;
  return (
    <AccessDenied
      reason={{ kind: "feature_off", def: getFeature(feature), platformEnabled: true, viewerRole: role ?? "Field_Staff" }}
    />
  );
}
