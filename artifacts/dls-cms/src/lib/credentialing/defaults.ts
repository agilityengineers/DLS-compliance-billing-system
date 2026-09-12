// lib/credentialing/defaults.ts — the seed requirements registry.
//
// This is a STARTING POINT, not a statement of Colorado law. Every row is
// admin-editable at /admin/requirements; the point of the registry is that
// policy changes are row updates, not deploys.
//
// ASSUMPTIONS (flagged for DLS review — roadmap "What we need from DLS"):
//  - The training rows mirror the courses the agency already tracks in Relias
//    and in users.training_completed[]; their `courseNames` must keep matching
//    those names or the evidence will not be found.
//  - Renewal intervals for the background, CAPS and I-9 rows are left null
//    (verify against current Colorado HCPCS/DBHDD provider requirements before
//    relying on them for renewal reminders).
//  - The driving rows ship OPTIONAL because only NMT transport staff need
//    them. Toggle Required on if that changes.
import type { Requirement } from "./registry";

export const CATEGORY_ORDER = [
  "Background & eligibility",
  "Licensure",
  "Training",
  "Driving"
] as const;

const ALL_ROLES = ["Admin", "Scheduler", "Field_Staff"] as const;

export const DEFAULT_REQUIREMENTS: Requirement[] = [
  // ── Background & eligibility ────────────────────────────────────────────
  {
    id: "background_check",
    label: "Criminal background check",
    category: "Background & eligibility",
    required: true, gating: true, automated: false, vendor: null,
    appliesTo: [...ALL_ROLES], renewsMonths: null,
    source: { kind: "manual" },
    note: "Cleared report on file before any client contact.",
    sortOrder: 10
  },
  {
    id: "caps_check",
    label: "Adult protective services registry check",
    category: "Background & eligibility",
    required: true, gating: true, automated: false, vendor: null,
    appliesTo: ["Field_Staff"], renewsMonths: null,
    source: { kind: "manual" },
    note: "Screens state abuse and exclusion lists. Renewal cadence to be confirmed.",
    sortOrder: 20
  },
  {
    id: "work_eligibility",
    label: "Work eligibility (I-9)",
    category: "Background & eligibility",
    required: true, gating: true, automated: false, vendor: null,
    appliesTo: [...ALL_ROLES], renewsMonths: null,
    source: { kind: "manual" },
    note: "Federal employment eligibility verification.",
    sortOrder: 30
  },

  // ── Licensure ───────────────────────────────────────────────────────────
  {
    id: "dsp_license",
    label: "DSP license",
    category: "Licensure",
    required: true, gating: true, automated: false, vendor: null,
    appliesTo: ["Field_Staff"], renewsMonths: null,
    source: { kind: "license" },
    note: "Reads the licence number and expiry on the staff record.",
    sortOrder: 40
  },

  // ── Training ────────────────────────────────────────────────────────────
  // courseNames must match users.training_completed[].course and the Relias
  // course names exactly (case-insensitive) or the evidence is not found.
  {
    id: "qmap",
    label: "QMAP medication administration",
    category: "Training",
    required: true, gating: true, automated: false, vendor: "Relias",
    appliesTo: ["Field_Staff"], renewsMonths: 12,
    source: { kind: "training", courseNames: ["QMAP Medication Administration"] },
    note: "Required before administering medication (eMAR).",
    sortOrder: 50
  },
  {
    id: "cpr_first_aid",
    label: "CPR / First Aid",
    category: "Training",
    required: true, gating: true, automated: false, vendor: "Relias",
    appliesTo: ["Field_Staff"], renewsMonths: 24,
    source: { kind: "training", courseNames: ["CPR / First Aid", "CPR/First Aid"] },
    note: "Certificate and expiry tracked.",
    sortOrder: 60
  },
  {
    id: "abuse_neglect",
    label: "Abuse & neglect prevention",
    category: "Training",
    required: true, gating: true, automated: false, vendor: "Relias",
    appliesTo: ["Admin", "Field_Staff"], renewsMonths: 12,
    source: { kind: "training", courseNames: ["Abuse & Neglect Prevention"] },
    note: "Mandated reporter training.",
    sortOrder: 70
  },
  {
    id: "hipaa",
    label: "HIPAA privacy & security",
    category: "Training",
    required: true, gating: true, automated: false, vendor: "Relias",
    appliesTo: [...ALL_ROLES], renewsMonths: 12,
    source: { kind: "training", courseNames: ["HIPAA Privacy & Security"] },
    note: "Required before any PHI access.",
    sortOrder: 80
  },
  {
    id: "person_centered_planning",
    label: "Person-centered planning",
    category: "Training",
    required: false, gating: false, automated: false, vendor: "Relias",
    appliesTo: ["Field_Staff"], renewsMonths: null,
    source: { kind: "training", courseNames: ["Person-Centered Planning"] },
    note: "Recommended, not required.",
    sortOrder: 90
  },

  // ── Driving (NMT transport only) ────────────────────────────────────────
  {
    id: "drivers_license",
    label: "Driver's license",
    category: "Driving",
    required: false, gating: false, automated: false, vendor: null,
    appliesTo: ["Field_Staff"], renewsMonths: null,
    source: { kind: "manual" },
    note: "Only staff providing NMT transport need this.",
    sortOrder: 100
  },
  {
    id: "auto_insurance",
    label: "Auto insurance (current)",
    category: "Driving",
    required: false, gating: false, automated: false, vendor: null,
    appliesTo: ["Field_Staff"], renewsMonths: 6,
    source: { kind: "manual" },
    note: "Proof of coverage for NMT transport.",
    sortOrder: 110
  }
];

/** Registry order for display: by category, then sortOrder. */
export function byCategory(requirements: Requirement[]): { category: string; items: Requirement[] }[] {
  const known = new Map<string, Requirement[]>(CATEGORY_ORDER.map((c) => [c, []]));
  for (const r of [...requirements].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const bucket = known.get(r.category);
    if (bucket) bucket.push(r);
    else known.set(r.category, [r]); // an admin-added category sorts last
  }
  return [...known.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([category, items]) => ({ category, items }));
}
