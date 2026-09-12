// lib/rbac/roles.ts — role constants + the permission matrix shown in
// Settings. Roles and the feature catalog come from @workspace/features (one
// source shared with the API server); enforcement lives in the API server
// (accounts, features) and lib/auth/session.ts (page/action gates).
import { ROLES as ALL_ROLES, ROLE_LABELS as LABELS, type Role } from "@workspace/features";

export const ROLES: Role[] = [...ALL_ROLES];
export const ROLE_LABELS: Record<Role, string> = LABELS;

/**
 * Hierarchy at a glance. The provider roles configure the platform and never
 * touch client records; everything below them is per organization and
 * additionally subject to the feature switches in Settings. "Client records
 * (PHI)" is the row that matters most: no provider role holds it, and the
 * only way in is an audited support session inside a window the organization
 * has granted.
 */
export interface PermissionRow {
  capability: string;
  /** Roles that hold it. Everything else is a dash. */
  roles: Role[];
}

export const PERMISSION_MATRIX: PermissionRow[] = [
  { capability: "Platform console: make features available, create organizations & their Admins", roles: ["Super_Admin"] },
  { capability: "Platform console: read the overview, sessions, audit log and system status", roles: ["Super_Admin", "Platform_Support"] },
  { capability: "Cut and revoke provider support accounts", roles: ["Super_Admin"] },
  { capability: "Turn features on/off for the organization and grant them to roles", roles: ["Admin"] },
  { capability: "Create employee accounts, reset passwords, suspend", roles: ["Super_Admin", "Admin"] },
  { capability: "Grant the provider a time-boxed support window", roles: ["Admin"] },
  { capability: "View own visits & write progress notes", roles: ["Admin", "Field_Staff"] },
  { capability: "View all clients", roles: ["Admin", "Scheduler"] },
  { capability: "View assigned clients only", roles: ["Field_Staff"] },
  { capability: "Schedule / reassign visits", roles: ["Admin", "Scheduler"] },
  { capability: "Manage physician orders", roles: ["Admin", "Scheduler"] },
  { capability: "eMAR administration (own clients) — when enabled", roles: ["Admin", "Field_Staff"] },
  { capability: "QA review & flag resolution — when enabled", roles: ["Admin"] },
  { capability: "EVV review & manual adjustment (reason required) — when enabled", roles: ["Admin"] },
  { capability: "Billing & 837P export", roles: ["Admin"] },
  { capability: "Payroll transmittal — when enabled", roles: ["Admin"] },
  { capability: "Staff & credentials management", roles: ["Admin"] },
  { capability: "View as user (impersonation), always audited", roles: ["Super_Admin", "Platform_Support", "Admin"] },
  { capability: "Audit trail (read-only)", roles: ["Super_Admin", "Platform_Support", "Admin"] },
  { capability: "Client records (PHI)", roles: ["Admin", "Scheduler", "Field_Staff"] },
];

// Back-compat re-exports: the session module owns auth gating now.
export { requireRole, requireSession, requireRealAdmin, requireFeature, hasFeature } from "@/lib/auth/session";
