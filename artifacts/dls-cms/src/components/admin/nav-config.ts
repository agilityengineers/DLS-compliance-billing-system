// components/admin/nav-config.ts — the role-adaptive menu structure.
//
// Every entry that belongs to a switchable capability names its feature key.
// A link appears only when the feature is usable by the signed-in role
// (provider switch ∧ organization switch ∧ role grant — see
// @workspace/features). Billing is special: a Scheduler sees it locked (with
// an explanation card) whenever the organization has billing switched on.
//
// The provider (Super Admin) gets a different menu altogether: the platform
// console, grouped by the job at hand — overview, organizations and people,
// capabilities, security and compliance, system. None of it opens client
// records.
import type { FeatureKey, Role } from "@workspace/features";

export type SectionKey =
  | "CORE"
  | "COMPLIANCE"
  | "BUSINESS"
  | "TRAINING"
  | "SYSTEM"
  | "PLATFORM_OVERVIEW"
  | "PLATFORM_ORGS"
  | "PLATFORM_CAPABILITIES"
  | "PLATFORM_SECURITY"
  | "PLATFORM_SYSTEM";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name (resolved in the sidebar component)
  /** Capability this screen belongs to; hidden when it is off for the viewer. */
  feature?: FeatureKey;
  adminOnly?: boolean;
  /** Visible to non-admins but locked (Scheduler's Billing). */
  lockedForNonAdmin?: boolean;
  /** One line for the overview's quick-links; also the collapsed-rail tooltip. */
  description?: string;
}

export interface NavSection {
  key: SectionKey;
  label: string;
  items: NavItem[];
  /** Expanded on first visit (the sidebar remembers the user's own choice afterwards). */
  defaultOpen?: boolean;
}

export const ADMIN_NAV: NavSection[] = [
  {
    key: "CORE",
    label: "Core",
    defaultOpen: true,
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

/**
 * The provider's menu — platform configuration only, no client records.
 * Every section starts expanded: the console is small enough to see whole.
 */
export const PLATFORM_NAV: NavSection[] = [
  {
    key: "PLATFORM_OVERVIEW",
    label: "Overview",
    defaultOpen: true,
    items: [
      {
        href: "/admin/platform",
        label: "Platform overview",
        icon: "LayoutDashboard",
        description: "What needs attention, activity this week and the numbers at a glance."
      }
    ]
  },
  {
    key: "PLATFORM_ORGS",
    label: "Organizations & people",
    defaultOpen: true,
    items: [
      {
        href: "/admin/platform/organizations",
        label: "Organizations",
        icon: "Building2",
        description: "Create an organization, hand it to its administrator, suspend or rename it."
      },
      {
        href: "/admin/platform/accounts",
        label: "Accounts",
        icon: "Users",
        description: "Every sign-in on the platform: search, reset a password, suspend, sign out everywhere."
      }
    ]
  },
  {
    key: "PLATFORM_CAPABILITIES",
    label: "Capabilities",
    defaultOpen: true,
    items: [
      {
        href: "/admin/platform/features",
        label: "Feature switchboard",
        icon: "SlidersHorizontal",
        description: "Tier 1: which capabilities organizations may use at all."
      },
      {
        href: "/admin/platform/adoption",
        label: "Feature adoption",
        icon: "Grid3x3",
        description: "Which organization has switched on what, and for which roles."
      }
    ]
  },
  {
    key: "PLATFORM_SECURITY",
    label: "Security & compliance",
    defaultOpen: true,
    items: [
      {
        href: "/admin/platform/support",
        label: "Support access",
        icon: "LifeBuoy",
        description: "Start an audited view-as session and review every past one."
      },
      {
        href: "/admin/platform/sessions",
        label: "Active sessions",
        icon: "MonitorSmartphone",
        description: "Who is signed in right now, from where; end a session."
      },
      {
        href: "/admin/platform/audit",
        label: "Audit log",
        icon: "ScrollText",
        description: "Every sign-in, switch flip and account change, filterable and exportable."
      }
    ]
  },
  {
    key: "PLATFORM_SYSTEM",
    label: "System",
    defaultOpen: true,
    items: [
      {
        href: "/admin/platform/system",
        label: "System status",
        icon: "Activity",
        description: "Service, database and migrations, sign-in policy, configuration warnings."
      }
    ]
  }
];

/** Every provider screen, flattened — the overview's quick links. */
export const PLATFORM_LINKS: NavItem[] = PLATFORM_NAV.flatMap((s) => s.items);

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

/**
 * The menu entry that owns `pathname`: the longest href that is the path
 * itself or one of its parents. So /admin/clients/new highlights Clients,
 * and /admin/platform/accounts highlights Accounts rather than the overview
 * that shares its prefix. Returns null when nothing matches.
 */
export function activeHref(sections: readonly NavSection[], pathname: string): string | null {
  let best: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (best === null || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}
