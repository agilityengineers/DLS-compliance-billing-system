// Effective permission = tier 1 (provider) AND tier 2 (organization) AND role.
//
//   platformEnabled  — the provider made the feature available to the org
//   orgEnabled       — the org's Admin turned it on
//   roles            — which employee roles the Admin granted it to
//
// Admins get every feature that passes both tiers. Employee roles additionally
// need the role grant, and can only ever be granted roles listed in the
// catalog entry's `employeeRoles`.

import { FEATURE_CATALOG, getFeature, type FeatureDef, type FeatureKey } from "./catalog";
import { EMPLOYEE_ROLES, isPlatformRole, type EmployeeRole, type Role } from "./roles";

export type RoleGrants = Partial<Record<EmployeeRole, boolean>>;

/** Persisted state for one feature at both tiers. */
export interface FeatureState {
  key: FeatureKey;
  platformEnabled: boolean;
  orgEnabled: boolean;
  roles: RoleGrants;
}

/** What the settings screens render: the state plus what each actor may change. */
export interface FeatureView extends FeatureState {
  def: FeatureDef;
  /** Usable by the organization's Admin (tier 1 ∧ tier 2). */
  effectiveForAdmin: boolean;
  /** Usable by each employee role (tier 1 ∧ tier 2 ∧ grant ∧ allowed). */
  effectiveByRole: Record<EmployeeRole, boolean>;
  /** The org Admin may flip `orgEnabled` (provider enabled it and the catalog allows it). */
  adminCanToggle: boolean;
  /** Why the Admin cannot toggle, when they cannot. */
  adminLockReason: "not_available" | "always_on" | null;
}

export interface PlatformRow {
  key: string;
  enabled: boolean;
}

export interface OrgRow {
  key: string;
  enabled: boolean;
  roles: RoleGrants | null | undefined;
}

/** Default org-tier state for a feature nobody has configured yet. */
export function defaultOrgState(def: FeatureDef): { enabled: boolean; roles: RoleGrants } {
  const roles: RoleGrants = {};
  for (const r of def.defaultEmployeeRoles) roles[r] = true;
  return { enabled: def.launchDefault, roles: sanitizeRoles(def, roles) };
}

/** Clamp role grants to the roles the catalog permits for this feature. */
export function sanitizeRoles(def: FeatureDef, roles: RoleGrants | null | undefined): RoleGrants {
  const out: RoleGrants = {};
  for (const r of def.employeeRoles) out[r] = roles?.[r] === true;
  return out;
}

/**
 * Merge the catalog with whatever the database holds. Missing rows fall back
 * to the catalog defaults, so a freshly created organization behaves exactly
 * like the launch configuration.
 */
export function resolveFeatureStates(platformRows: readonly PlatformRow[], orgRows: readonly OrgRow[]): FeatureState[] {
  const platform = new Map(platformRows.map((r) => [r.key, r.enabled]));
  const org = new Map(orgRows.map((r) => [r.key, r]));
  return FEATURE_CATALOG.map((def) => {
    const row = org.get(def.key);
    const defaults = defaultOrgState(def);
    return {
      key: def.key,
      platformEnabled: platform.get(def.key) ?? def.launchDefault,
      orgEnabled: row ? row.enabled : defaults.enabled,
      roles: row ? sanitizeRoles(def, row.roles) : defaults.roles,
    };
  });
}

export function isFeatureEnabledFor(state: FeatureState, role: Role): boolean {
  if (!state.platformEnabled) return false;
  // The provider's own console never depends on an organization's switches.
  if (isPlatformRole(role)) return true;
  if (!state.orgEnabled) return false;
  if (role === "Admin") return true;
  const def = getFeature(state.key);
  return def.employeeRoles.includes(role) && state.roles[role] === true;
}

/** The set of feature keys a user with `role` may use. */
export function effectiveFeatureKeys(states: readonly FeatureState[], role: Role): FeatureKey[] {
  return states.filter((s) => isFeatureEnabledFor(s, role)).map((s) => s.key);
}

export function toFeatureView(state: FeatureState): FeatureView {
  const def = getFeature(state.key);
  const effectiveByRole = {} as Record<EmployeeRole, boolean>;
  for (const r of EMPLOYEE_ROLES) effectiveByRole[r] = isFeatureEnabledFor(state, r);
  const adminCanToggle = state.platformEnabled && def.adminConfigurable;
  return {
    ...state,
    def,
    effectiveForAdmin: isFeatureEnabledFor(state, "Admin"),
    effectiveByRole,
    adminCanToggle,
    adminLockReason: !state.platformEnabled ? "not_available" : !def.adminConfigurable ? "always_on" : null,
  };
}

export type TierViolation =
  | { code: "FEATURE_NOT_AVAILABLE"; message: string }
  | { code: "FEATURE_ALWAYS_ON"; message: string }
  | { code: "ROLE_NOT_ALLOWED"; message: string };

/**
 * Validate an Admin's requested change against the tier rules. Returns the
 * clamped change to persist, or the violation. The API server calls this
 * before writing; the settings screen calls it to disable controls.
 */
export function validateOrgChange(
  current: FeatureState,
  change: { enabled?: boolean; roles?: RoleGrants }
): { ok: true; enabled: boolean; roles: RoleGrants } | { ok: false; violation: TierViolation } {
  const def = getFeature(current.key);
  if (!current.platformEnabled) {
    return {
      ok: false,
      violation: { code: "FEATURE_NOT_AVAILABLE", message: `${def.label} is not enabled by your provider.` },
    };
  }
  let enabled = current.orgEnabled;
  if (change.enabled !== undefined && change.enabled !== current.orgEnabled) {
    if (!def.adminConfigurable) {
      return {
        ok: false,
        violation: { code: "FEATURE_ALWAYS_ON", message: `${def.label} is always on for your organization.` },
      };
    }
    enabled = change.enabled;
  }
  let roles = { ...current.roles };
  if (change.roles) {
    for (const [role, granted] of Object.entries(change.roles)) {
      if (!def.employeeRoles.includes(role as EmployeeRole)) {
        if (granted) {
          return {
            ok: false,
            violation: { code: "ROLE_NOT_ALLOWED", message: `${def.label} cannot be granted to ${role.replace("_", " ")}.` },
          };
        }
        continue;
      }
      roles[role as EmployeeRole] = granted === true;
    }
  }
  roles = sanitizeRoles(def, roles);
  return { ok: true, enabled, roles };
}
