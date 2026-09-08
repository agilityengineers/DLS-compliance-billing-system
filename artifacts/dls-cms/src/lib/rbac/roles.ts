// lib/rbac/roles.ts — role constants + the permission matrix shown in
// Settings. Roles and the feature catalog come from @workspace/features (one
// source shared with the API server); enforcement lives in the API server
// (accounts, features) and lib/auth/session.ts (page/action gates).
import { ROLES as ALL_ROLES, ROLE_LABELS as LABELS, type Role } from "@workspace/features";

export const ROLES: Role[] = [...ALL_ROLES];
export const ROLE_LABELS: Record<Role, string> = LABELS;

/**
 * Hierarchy at a glance. The provider (Super Admin) configures the platform
 * and never touches client records; everything below it is per organization
 * and additionally subject to the feature switches in Settings.
 */
export const PERMISSION_MATRIX: {
  capability: string;
  Super_Admin: boolean;
  Admin: boolean;
  Scheduler: boolean;
  Field_Staff: boolean;
}[] = [
  { capability: "Platform console: make features available, create organizations & their Admins", Super_Admin: true, Admin: false, Scheduler: false, Field_Staff: false },
  { capability: "Turn features on/off for the organization and grant them to roles", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Create employee accounts, reset passwords, suspend", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "View own visits & write progress notes", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: true },
  { capability: "View all clients", Super_Admin: false, Admin: true, Scheduler: true, Field_Staff: false },
  { capability: "View assigned clients only", Super_Admin: false, Admin: false, Scheduler: false, Field_Staff: true },
  { capability: "Schedule / reassign visits", Super_Admin: false, Admin: true, Scheduler: true, Field_Staff: false },
  { capability: "Manage physician orders", Super_Admin: false, Admin: true, Scheduler: true, Field_Staff: false },
  { capability: "eMAR administration (own clients) — when enabled", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: true },
  { capability: "QA review & flag resolution — when enabled", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "EVV review & manual adjustment (reason required) — when enabled", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Billing & 837P export", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Payroll transmittal — when enabled", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Staff & credentials management", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "View as user (impersonation), always audited", Super_Admin: true, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Audit trail (read-only)", Super_Admin: false, Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Client records (PHI)", Super_Admin: false, Admin: true, Scheduler: true, Field_Staff: true }
];

// Back-compat re-exports: the session module owns auth gating now.
export { requireRole, requireSession, requireRealAdmin, requireFeature, hasFeature } from "@/lib/auth/session";
