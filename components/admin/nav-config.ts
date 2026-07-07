// components/admin/nav-config.ts — the role-adaptive menu structure.
// Section visibility for Scheduler/Field Staff comes from menu_config
// (Settings → Menu configuration); Billing, Payroll, Staff & credentials,
// and Settings are ALWAYS Admin-only. Billing is special: visible to the
// Scheduler when BUSINESS is enabled, but locked with an explanation card.
import type { Role } from "@/lib/supabase/types";

export type SectionKey = "CORE" | "COMPLIANCE" | "BUSINESS" | "TRAINING" | "SYSTEM";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name (resolved in the sidebar component)
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
      { href: "/admin/clients", label: "Clients", icon: "Users" },
      { href: "/admin/schedule", label: "Schedule", icon: "CalendarDays" },
      { href: "/admin/staff", label: "Staff & credentials", icon: "UserCog", adminOnly: true }
    ]
  },
  {
    key: "COMPLIANCE",
    label: "Compliance",
    items: [
      { href: "/admin/qa", label: "QA", icon: "ShieldCheck" },
      { href: "/admin/evv", label: "EVV review", icon: "MapPin" },
      { href: "/admin/emar", label: "eMAR oversight", icon: "Pill" },
      { href: "/admin/audit", label: "Audit trail", icon: "ScrollText", adminOnly: true }
    ]
  },
  {
    key: "BUSINESS",
    label: "Business",
    items: [
      { href: "/admin/billing", label: "Billing", icon: "Receipt", lockedForNonAdmin: true },
      { href: "/admin/payroll", label: "Payroll", icon: "Banknote", adminOnly: true },
      { href: "/admin/reports", label: "Reports", icon: "BarChart3" },
      { href: "/admin/documents", label: "Documents & notices", icon: "FolderOpen" }
    ]
  },
  {
    key: "TRAINING",
    label: "Training & Learning",
    items: [{ href: "/admin/relias", label: "Relias", icon: "GraduationCap" }]
  },
  {
    key: "SYSTEM",
    label: "System",
    items: [{ href: "/admin/settings", label: "Settings & users", icon: "Settings", adminOnly: true }]
  }
];

/** Sections/items the given role may see (menu_config already applied). */
export function navForRole(role: Role, enabledSections: Record<string, boolean>): NavSection[] {
  if (role === "Admin") return ADMIN_NAV;
  return ADMIN_NAV
    .filter((s) => enabledSections[s.key] === true)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.adminOnly) }))
    .filter((s) => s.items.length > 0);
}
