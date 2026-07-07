// lib/rbac/roles.ts — role constants + the permission matrix shown in
// Settings. Enforcement lives in RLS (supabase/policies) and
// lib/auth/session.ts (requireRole/requireRealAdmin); this matrix mirrors it
// for UI gating and the Settings → permission matrix screen.
import type { Role } from "@/lib/supabase/types";

export const ROLES: Role[] = ["Admin", "Scheduler", "Field_Staff"];

export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Admin",
  Scheduler: "Scheduler",
  Field_Staff: "Field Staff"
};

/** UI mirror of the RLS matrix — the database is the source of truth. */
export const PERMISSION_MATRIX: {
  capability: string;
  Admin: boolean;
  Scheduler: boolean;
  Field_Staff: boolean;
}[] = [
  { capability: "View own visits & write progress notes", Admin: true, Scheduler: false, Field_Staff: true },
  { capability: "View all clients", Admin: true, Scheduler: true, Field_Staff: false },
  { capability: "View assigned clients only", Admin: false, Scheduler: false, Field_Staff: true },
  { capability: "Schedule / reassign visits", Admin: true, Scheduler: true, Field_Staff: false },
  { capability: "Manage physician orders", Admin: true, Scheduler: true, Field_Staff: false },
  { capability: "eMAR administration (own clients)", Admin: true, Scheduler: false, Field_Staff: true },
  { capability: "QA review & flag resolution", Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "EVV review & manual adjustment (reason required)", Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Billing & 837P export", Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Payroll transmittal", Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Staff & credentials management", Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Settings, users & menu configuration", Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Impersonation (view as user)", Admin: true, Scheduler: false, Field_Staff: false },
  { capability: "Audit trail (read-only)", Admin: true, Scheduler: false, Field_Staff: false }
];

// Back-compat re-exports: the session module owns auth gating now.
export { requireRole, requireSession, requireRealAdmin } from "@/lib/auth/session";
