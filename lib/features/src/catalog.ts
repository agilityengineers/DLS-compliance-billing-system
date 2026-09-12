// The feature catalog — the single source of truth for every switchable
// capability in the system. Both the API server (enforcement) and the web
// app (navigation, gates, settings screens) read this list, and the database
// is seeded from it, so adding a feature means adding ONE entry here.
//
// Two tiers of switches sit on top of the catalog (see permissions.ts):
//   tier 1 — the provider (Super Admin) makes a feature AVAILABLE to an org
//   tier 2 — the org's Admin turns it ON for the org and picks which employee
//            roles may use it
// A feature is usable only when BOTH tiers say yes.

import type { EmployeeRole } from "./roles";

export type FeatureCategory =
  | "Client care"
  | "Scheduling & documentation"
  | "Staff & training"
  | "Compliance"
  | "Business"
  | "Platform";

export const FEATURE_CATEGORIES: readonly FeatureCategory[] = [
  "Client care",
  "Scheduling & documentation",
  "Staff & training",
  "Compliance",
  "Business",
  "Platform",
];

/**
 * ready           — built and verified; safe to switch on
 * preview         — built, but still being hardened (see docs/review); switch on with care
 * in_development  — no screens yet; the switch reserves the capability so it can
 *                   light up without a new deployment once the screens land
 */
export type FeatureStatus = "ready" | "preview" | "in_development";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  category: FeatureCategory;
  status: FeatureStatus;
  /** Provider default: available to every organization until switched off. */
  launchDefault: boolean;
  /**
   * May the organization's Admin switch it off? `false` marks the "spine" —
   * capabilities other launch features depend on (e.g. notes need visits, so
   * the schedule board cannot be switched off by the org).
   */
  adminConfigurable: boolean;
  /** Employee roles that can EVER be granted this feature. Admin is implicit. */
  employeeRoles: readonly EmployeeRole[];
  /** Employee roles granted automatically when the org first turns it on. */
  defaultEmployeeRoles: readonly EmployeeRole[];
}

export const FEATURE_KEYS = [
  "clients.core",
  "clients.paperwork",
  "clients.attendance",
  "clients.profile",
  "schedule.board",
  "schedule.recurring",
  "notes.progress",
  "notes.oversight",
  "incidents.reporting",
  "staff.credentials",
  "relias.training",
  "relias.sso",
  "qa.flags",
  "evv.clock",
  "evv.aggregator",
  "emar.medications",
  "field.nmt",
  "audit.trail",
  "billing.claims",
  "reports.utilization",
  "reports.monthly",
  "documents.files",
  "documents.dvr_notices",
  "payroll.transmittal",
  "timesheets.route_record",
  "platform.impersonation",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const BOTH: readonly EmployeeRole[] = ["Scheduler", "Field_Staff"];
const SCHED: readonly EmployeeRole[] = ["Scheduler"];
const FIELD: readonly EmployeeRole[] = ["Field_Staff"];
const NONE: readonly EmployeeRole[] = [];

export const FEATURE_CATALOG: readonly FeatureDef[] = [
  // ── Client care ─────────────────────────────────────────────────────────
  {
    key: "clients.core",
    label: "Client records",
    description: "Client roster, intake and demographics. Required by scheduling, notes and billing.",
    category: "Client care",
    status: "ready",
    launchDefault: true,
    adminConfigurable: false,
    employeeRoles: SCHED,
    defaultEmployeeRoles: SCHED,
  },
  {
    key: "clients.paperwork",
    label: "Intake & renewal paperwork",
    description: "Required-document checklist per client with due dates, reminders and yearly renewals.",
    category: "Client care",
    status: "in_development",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: SCHED,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "clients.attendance",
    label: "Attendance records",
    description: "Per-client attendance that fills itself from completed visits; monthly export.",
    category: "Client care",
    status: "in_development",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: SCHED,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "clients.profile",
    label: "Person-centered profiles",
    description: "About-me profile and goals per client, read by field staff at the door.",
    category: "Client care",
    status: "in_development",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: BOTH,
    defaultEmployeeRoles: NONE,
  },

  // ── Scheduling & documentation ──────────────────────────────────────────
  {
    key: "schedule.board",
    label: "Schedule board & physician orders",
    description: "Staff × weekday visit grid. Notes attach to visits and visits need an active physician order, so this stays on.",
    category: "Scheduling & documentation",
    status: "ready",
    launchDefault: true,
    adminConfigurable: false,
    employeeRoles: SCHED,
    defaultEmployeeRoles: SCHED,
  },
  {
    key: "schedule.recurring",
    label: "Recurring visit templates",
    description: "Generate the week's visits from standing weekly templates.",
    category: "Scheduling & documentation",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: SCHED,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "notes.progress",
    label: "Progress notes (field app)",
    description: "Offline-first progress notes with live unit math and dual signatures.",
    category: "Scheduling & documentation",
    status: "ready",
    launchDefault: true,
    adminConfigurable: false,
    employeeRoles: FIELD,
    defaultEmployeeRoles: FIELD,
  },
  {
    key: "notes.oversight",
    label: "Notes oversight & addenda",
    description: "Management note viewer, lock after billing, dated addenda.",
    category: "Scheduling & documentation",
    status: "in_development",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: SCHED,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "incidents.reporting",
    label: "Incident reporting",
    description: "Abuse/neglect and critical-incident reports from the field, reviewed by management.",
    category: "Scheduling & documentation",
    status: "ready",
    launchDefault: true,
    adminConfigurable: true,
    employeeRoles: FIELD,
    defaultEmployeeRoles: FIELD,
  },

  // ── Staff & training ────────────────────────────────────────────────────
  {
    key: "staff.credentials",
    label: "Staff & credentials",
    description: "Licenses, required trainings, renewals and offboarding. Expired credentials block claims.",
    category: "Staff & training",
    status: "ready",
    launchDefault: true,
    adminConfigurable: false,
    employeeRoles: NONE,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "relias.training",
    label: "Training & Learning (Relias)",
    description: "Course matrix, completion sync and the field Training screen.",
    category: "Staff & training",
    status: "ready",
    launchDefault: true,
    adminConfigurable: true,
    employeeRoles: BOTH,
    defaultEmployeeRoles: BOTH,
  },
  {
    key: "relias.sso",
    label: "Relias single sign-on",
    description: "Launch Relias without a second login. Off until Relias supplies real SSO settings.",
    category: "Staff & training",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: BOTH,
    defaultEmployeeRoles: NONE,
  },

  // ── Compliance ──────────────────────────────────────────────────────────
  {
    key: "qa.flags",
    label: "QA review queue",
    description: "Flagged inconsistencies (missing signatures, expired authorizations) with resolution notes.",
    category: "Compliance",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: SCHED,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "evv.clock",
    label: "EVV clock-in / clock-out (GPS)",
    description: "Geofenced clock-in on the field app plus the EVV review workspace.",
    category: "Compliance",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: BOTH,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "evv.aggregator",
    label: "EVV aggregator submission (Sandata)",
    description: "Sends verified visits to Colorado's EVV aggregator.",
    category: "Compliance",
    status: "in_development",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: NONE,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "emar.medications",
    label: "eMAR medication administration",
    description: "Medication list on the field app and the eMAR oversight screen.",
    category: "Compliance",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: BOTH,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "field.nmt",
    label: "Non-medical transportation trips",
    description: "NMT trip logging against each client's weekly authorization.",
    category: "Compliance",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: FIELD,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "audit.trail",
    label: "Audit trail",
    description: "Read-only log of every change, with impersonation attribution.",
    category: "Compliance",
    status: "ready",
    launchDefault: true,
    adminConfigurable: false,
    employeeRoles: NONE,
    defaultEmployeeRoles: NONE,
  },

  // ── Business ────────────────────────────────────────────────────────────
  {
    key: "billing.claims",
    label: "Billing & 837P claims",
    description: "Claim readiness with named blockers and 837P export. Admin-only.",
    category: "Business",
    status: "ready",
    launchDefault: true,
    adminConfigurable: true,
    employeeRoles: NONE,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "reports.utilization",
    label: "Utilization reports",
    description: "Units delivered versus authorized, per client and service.",
    category: "Business",
    status: "ready",
    launchDefault: true,
    adminConfigurable: true,
    employeeRoles: SCHED,
    defaultEmployeeRoles: SCHED,
  },
  {
    key: "reports.monthly",
    label: "Monthly report generation",
    description: "State SLS billing note and DVR monthly progress report documents.",
    category: "Business",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: SCHED,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "documents.files",
    label: "Documents & uploads",
    description: "Field photo/document uploads and the desktop Documents screen.",
    category: "Business",
    status: "ready",
    launchDefault: true,
    adminConfigurable: true,
    employeeRoles: BOTH,
    defaultEmployeeRoles: BOTH,
  },
  {
    key: "documents.dvr_notices",
    label: "DVR employment notices",
    description: "Generate DVR notices from the Documents screen.",
    category: "Business",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: SCHED,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "payroll.transmittal",
    label: "Payroll transmittal",
    description: "Per-employee hours, overtime and certification for the pay period. Admin-only.",
    category: "Business",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: NONE,
    defaultEmployeeRoles: NONE,
  },
  {
    key: "timesheets.route_record",
    label: "Weekly timesheets (route record)",
    description: "Field staff route record that feeds payroll.",
    category: "Business",
    status: "preview",
    launchDefault: false,
    adminConfigurable: true,
    employeeRoles: FIELD,
    defaultEmployeeRoles: NONE,
  },

  // ── Platform ────────────────────────────────────────────────────────────
  {
    key: "platform.impersonation",
    label: "View as user (impersonation)",
    description: "Admins see the app exactly as one of their users; every action is logged under the admin's identity.",
    category: "Platform",
    status: "ready",
    launchDefault: true,
    adminConfigurable: false,
    employeeRoles: NONE,
    defaultEmployeeRoles: NONE,
  },
];

const BY_KEY: ReadonlyMap<FeatureKey, FeatureDef> = new Map(FEATURE_CATALOG.map((f) => [f.key, f]));

export function getFeature(key: FeatureKey): FeatureDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown feature key: ${key}`);
  return def;
}

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && BY_KEY.has(value as FeatureKey);
}

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  ready: "Ready",
  preview: "Preview",
  in_development: "In development",
};
