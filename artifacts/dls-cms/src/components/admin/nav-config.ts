// components/admin/nav-config.ts — the role-adaptive menu structure.
//
// Every entry that belongs to a switchable capability names its feature key.
// A link appears only when the feature is usable by the signed-in role
// (provider switch ∧ organization switch ∧ role grant — see
// @workspace/features). Billing is special: a Scheduler sees it locked (with
// an explanation card) whenever the organization has billing switched on.
import type { FeatureKey, Role } from "@workspace/features";

export type SectionKey = "CORE" | "COMPLIANCE" | "BUSINESS" | "TRAINING" | "SYSTEM" | "PLATFORM";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name (resolved in the sidebar component)
  /** Capability this screen belongs to; hidden when it is off for the viewer. */
  feature?: FeatureKey;
  adminOnly?: boolean;
  /** Visible to non-admins but locked (Scheduler's Billing). */
  lockedForNonAdmin?: boolean;
}

export interface NavSection {
  key: SectionKey;
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavSection[] = [
  {
    key: "CORE",
    label: "Core",
    items: [
      { href: "/admin", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/admin/clients", label: "Clients", icon: "Users", feature: "clients.core" },
      { href: "/admin/schedule", label: "Schedule", icon: "CalendarDays", feature: "schedule.board" },
      { href: "/admin/staff", label: "Staff & credentials", icon: "UserCog", feature: "staff.credentials", adminOnly: true },
      // The registry configures staff.credentials rather than being a
      // capability of its own, so it rides that feature's switch.
      { href: "/admin/requirements", label: "Requirements", icon: "ListChecks", feature: "staff.credentials", adminOnly: true }
    ]
  },
  {
    key: "COMPLIANCE",
    label: "Compliance",
    items: [
      { href: "/admin/qa", label: "QA", icon: "ShieldCheck", feature: "qa.flags" },
      { href: "/admin/evv", label: "EVV review", icon: "MapPin", feature: "evv.clock" },
      { href: "/admin/emar", label: "eMAR oversight", icon: "Pill", feature: "emar.medications" },
      { href: "/admin/incidents", label: "Incidents", icon: "AlertTriangle", feature: "incidents.reporting", adminOnly: true },
      { href: "/admin/audit", label: "Audit trail", icon: "ScrollText", feature: "audit.trail", adminOnly: true }
    ]
  },
  {
    key: "BUSINESS",
    label: "Business",
    items: [
      { href: "/admin/billing", label: "Billing", icon: "Receipt", feature: "billing.claims", lockedForNonAdmin: true },
      { href: "/admin/payroll", label: "Payroll", icon: "Banknote", feature: "payroll.transmittal", adminOnly: true },
      { href: "/admin/reports", label: "Reports", icon: "BarChart3", feature: "reports.utilization" },
      { href: "/admin/documents", label: "Documents & notices", icon: "FolderOpen", feature: "documents.files" }
    ]
  },
  {
    key: "TRAINING",
    label: "Training & Learning",
    items: [{ href: "/admin/relias", label: "Relias", icon: "GraduationCap", feature: "relias.training" }]
  },
  {
    key: "SYSTEM",
    label: "System",
    items: [{ href: "/admin/settings", label: "Settings & users", icon: "Settings", adminOnly: true }]
  }
];

/** The provider's menu — platform configuration only, no client records. */
export const PLATFORM_NAV: NavSection[] = [
  {
    key: "PLATFORM",
    label: "Platform",
    items: [
      { href: "/admin/platform", label: "Platform console", icon: "SlidersHorizontal" }
    ]
  }
];

/**
 * Sections/items the given role may see.
 *   features     — keys usable by the viewer (their own role)
 *   orgFeatures  — keys usable by the organization's Admin (both tiers on),
 *                  used only for the "visible but locked" Billing entry
 */
export function navForRole(
  role: Role,
  features: ReadonlySet<FeatureKey>,
  orgFeatures: ReadonlySet<FeatureKey> = features
): NavSection[] {
  if (role === "Super_Admin") return PLATFORM_NAV;
  const isAdmin = role === "Admin";
  return ADMIN_NAV
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        if (i.adminOnly && !isAdmin) return false;
        if (!i.feature) return true;
        if (features.has(i.feature)) return true;
        return Boolean(i.lockedForNonAdmin && !isAdmin && orgFeatures.has(i.feature));
      })
    }))
    .filter((s) => s.items.length > 0);
}
