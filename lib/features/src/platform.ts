// What each provider role may do in the platform console.
//
// The feature catalog answers "may this ORGANIZATION use this capability".
// This answers a different question: "may this PROVIDER OPERATOR touch this
// part of the platform". Keeping them apart is what lets a support engineer
// work an incident without also holding the switchboard.
//
// One list, read by the API's route gates, the page gates and the menu, so a
// screen a role cannot use is never offered to it.

import { isPlatformRole, type PlatformRole, type Role } from "./roles";

export const PLATFORM_CAPABILITIES = [
  /** Read the console at all: overview, organizations, accounts, adoption. */
  "platform.view",
  /** Flip tier-1 switches. */
  "platform.features",
  /** Create, rename, suspend, decommission and export an organization. */
  "platform.organizations",
  /** Create accounts, change roles, reset passwords, suspend. */
  "platform.accounts",
  /** Cut and revoke provider support accounts. */
  "platform.provider_accounts",
  /** Open an audited view-as session (still needs a granted support window). */
  "platform.support",
  /** End someone else's session. */
  "platform.sessions",
  /** Read the audit log and verify its chain. */
  "platform.audit",
  /** Read system status and run a maintenance job by hand. */
  "platform.system",
] as const;

export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

/**
 * Support deliberately gets the read-and-respond set and nothing that changes
 * configuration: it can see the console, open a granted support session, end a
 * session, read the audit log and read system status. Everything that changes
 * what an organization may do, or who may sign in, stays with the Super Admin.
 */
const SUPPORT_CAPABILITIES: readonly PlatformCapability[] = [
  "platform.view",
  "platform.support",
  "platform.sessions",
  "platform.audit",
  "platform.system",
];

export function platformCapabilitiesFor(role: Role): readonly PlatformCapability[] {
  if (role === "Super_Admin") return PLATFORM_CAPABILITIES;
  if (role === "Platform_Support") return SUPPORT_CAPABILITIES;
  return [];
}

export function hasPlatformCapability(role: Role, capability: PlatformCapability): boolean {
  return platformCapabilitiesFor(role).includes(capability);
}

/** Roles that may reach the console at all. */
export function canOpenPlatformConsole(role: Role): role is PlatformRole {
  return isPlatformRole(role) && hasPlatformCapability(role, "platform.view");
}

export const PLATFORM_CAPABILITY_LABELS: Record<PlatformCapability, string> = {
  "platform.view": "Open the platform console",
  "platform.features": "Make capabilities available to organizations (tier 1)",
  "platform.organizations": "Create, rename, suspend, decommission and export organizations",
  "platform.accounts": "Create accounts, change roles, reset passwords, suspend",
  "platform.provider_accounts": "Cut and revoke provider support accounts",
  "platform.support": "Open an audited support session inside a granted window",
  "platform.sessions": "End another person's session",
  "platform.audit": "Read the audit log and verify its chain",
  "platform.system": "Read system status and run a maintenance job",
};
