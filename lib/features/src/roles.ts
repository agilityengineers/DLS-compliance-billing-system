// Roles form a strict hierarchy:
//
//   Super_Admin  — the platform provider (Agility Engineers). Configures which
//                  capabilities each organization may use and creates the
//                  organization's administrators. Has NO standing access to
//                  client records; it only sees the platform console.
//   Admin        — the organization owner (Durable Life Skills). Runs the
//                  company, creates employee accounts, and decides which of
//                  the provider-enabled capabilities each employee role gets.
//   Scheduler    — office / scheduling staff (desktop console).
//   Field_Staff  — direct-support staff (mobile field app).
//
// Everything below Super_Admin belongs to exactly one organization.

export type Role = "Super_Admin" | "Admin" | "Scheduler" | "Field_Staff";

/** Roles that belong to an organization (everything except the provider). */
export type OrgRole = Exclude<Role, "Super_Admin">;

/** Employee roles — the ones an Admin grants features to. */
export type EmployeeRole = Exclude<OrgRole, "Admin">;

export const ROLES: readonly Role[] = ["Super_Admin", "Admin", "Scheduler", "Field_Staff"];
export const ORG_ROLES: readonly OrgRole[] = ["Admin", "Scheduler", "Field_Staff"];
export const EMPLOYEE_ROLES: readonly EmployeeRole[] = ["Scheduler", "Field_Staff"];

export const ROLE_LABELS: Record<Role, string> = {
  Super_Admin: "Super Admin",
  Admin: "Admin",
  Scheduler: "Scheduler",
  Field_Staff: "Field Staff",
};

/** Numeric rank — higher outranks lower. Used for "may manage" checks. */
export const ROLE_RANK: Record<Role, number> = {
  Super_Admin: 4,
  Admin: 3,
  Scheduler: 2,
  Field_Staff: 1,
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

export function isEmployeeRole(value: unknown): value is EmployeeRole {
  return typeof value === "string" && (EMPLOYEE_ROLES as readonly string[]).includes(value);
}

/** Where a signed-in user lands after login. */
export function homePathForRole(role: Role): string {
  switch (role) {
    case "Super_Admin":
      return "/admin/platform";
    case "Field_Staff":
      return "/field";
    default:
      return "/admin";
  }
}

/**
 * May `actor` manage (create, suspend, reset, change the role of) a user with
 * `target` role? Provider manages every organization role; an Admin manages
 * roles inside their own organization, including other Admins, but never the
 * provider. Nobody manages a role above their own.
 */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "Super_Admin") return target !== "Super_Admin";
  if (actor === "Admin") return isOrgRole(target);
  return false;
}
