// Roles form a strict hierarchy:
//
//   Super_Admin       — the platform owner (Agility Engineers). Configures which
//                       capabilities each organization may use, creates the
//                       organizations and their administrators, and cuts support
//                       keys. Has NO standing access to client records.
//   Platform_Support  — a provider support engineer. Reads the console and works
//                       incidents (view-as inside a granted window, ending
//                       sessions), but changes no configuration and creates no
//                       accounts. Also has no standing access to client records.
//   Admin             — the organization owner (Durable Life Skills). Runs the
//                       company, creates employee accounts, and decides which of
//                       the provider-enabled capabilities each employee role gets.
//   Scheduler         — office / scheduling staff (desktop console).
//   Field_Staff       — direct-support staff (mobile field app).
//
// Everything below the platform roles belongs to exactly one organization.

export type Role = "Super_Admin" | "Platform_Support" | "Admin" | "Scheduler" | "Field_Staff";

/** Roles that belong to the provider rather than to any organization. */
export type PlatformRole = "Super_Admin" | "Platform_Support";

/** Roles that belong to an organization. */
export type OrgRole = Exclude<Role, PlatformRole>;

/** Employee roles — the ones an Admin grants features to. */
export type EmployeeRole = Exclude<OrgRole, "Admin">;

export const ROLES: readonly Role[] = ["Super_Admin", "Platform_Support", "Admin", "Scheduler", "Field_Staff"];
export const PLATFORM_ROLES: readonly PlatformRole[] = ["Super_Admin", "Platform_Support"];
export const ORG_ROLES: readonly OrgRole[] = ["Admin", "Scheduler", "Field_Staff"];
export const EMPLOYEE_ROLES: readonly EmployeeRole[] = ["Scheduler", "Field_Staff"];

export const ROLE_LABELS: Record<Role, string> = {
  Super_Admin: "Super Admin",
  Platform_Support: "Support",
  Admin: "Admin",
  Scheduler: "Scheduler",
  Field_Staff: "Field Staff",
};

/** Numeric rank — higher outranks lower. Used for "may manage" checks. */
export const ROLE_RANK: Record<Role, number> = {
  Super_Admin: 5,
  Platform_Support: 4,
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

/** A provider account (no organization of its own). */
export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

/** Where a signed-in user lands after login. */
export function homePathForRole(role: Role): string {
  switch (role) {
    case "Super_Admin":
    case "Platform_Support":
      return "/admin/platform";
    case "Field_Staff":
      return "/field";
    default:
      return "/admin";
  }
}

/**
 * May `actor` manage (create, suspend, reset, change the role of) a user with
 * `target` role?
 *
 * The Super Admin manages every role below it, support accounts included: the
 * master key comes from the deployment (SUPER_ADMIN_*), and support keys are
 * cut by the master key. No account can manage a Super Admin — not even
 * another Super Admin — so the only way to recover one is the deployment's
 * break-glass path, which leaves a trace in the environment rather than in
 * the app. An Admin manages roles inside their own organization, including
 * other Admins, but never a provider account. Support manages nobody.
 */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "Super_Admin") return target !== "Super_Admin";
  if (actor === "Admin") return isOrgRole(target);
  return false;
}
