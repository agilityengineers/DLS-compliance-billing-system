// components/session-context.tsx — the signed-in user's role and feature set,
// handed from the async layouts to client components (tab bars, panels) that
// need to hide controls for switched-off features.
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { hasPlatformCapability, type FeatureKey, type PlatformCapability, type Role } from "@workspace/features";

export interface SessionInfo {
  features: FeatureKey[];
  role: Role | null;
  realRole: Role | null;
  impersonating: boolean;
  userName: string;
  orgName: string | null;
  /** Second factor state for the real account, for the nudges that ask for it. */
  mfa?: { enabled: boolean; required: boolean };
}

const EMPTY: SessionInfo = {
  features: [],
  role: null,
  realRole: null,
  impersonating: false,
  userName: "",
  orgName: null,
  mfa: { enabled: false, required: false },
};

const SessionContext = createContext<SessionInfo>(EMPTY);

export function SessionProvider({ value, children }: { value: SessionInfo; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionInfo(): SessionInfo {
  return useContext(SessionContext);
}

export function useFeature(key: FeatureKey): boolean {
  return useContext(SessionContext).features.includes(key);
}

/** What this provider role may do in the console. False for everyone else. */
export function usePlatformCapability(capability: PlatformCapability): boolean {
  const role = useContext(SessionContext).role;
  return role ? hasPlatformCapability(role, capability) : false;
}
