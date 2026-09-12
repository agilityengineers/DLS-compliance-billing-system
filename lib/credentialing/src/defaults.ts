// lib/credentialing/src/defaults.ts — the seed requirements registry (Colorado).
//
// ─────────────────────────────────────────────────────────────────────────────
// READ THIS BEFORE RELYING ON A CITATION.
//
// Every row carries the rule it rests on and HOW FAR THAT RULE HAS BEEN
// CHECKED (`verificationStatus`). Nothing here ships as "confirmed":
//
//   reported      — citation gathered from secondary sources. Plausible and
//                   consistently reported, but nobody has read the primary
//                   text and signed off. TREAT AS A PROMPT, NOT AS LAW.
//   agency_policy — DLS's own rule, not a state or federal mandate. The
//                   interval is an agency choice and can be changed freely.
//
// A requirement becomes `confirmed` only when a named person checks the
// primary source and records the sign-off (/admin/requirements → Mark
// verified). The admin screen counts what is still outstanding, so this can
// be worked down rather than forgotten in a comment.
//
// Intervals below are the RENEWAL cadence for the credential, not the review
// cadence for the rule.
// ─────────────────────────────────────────────────────────────────────────────
import type { Requirement } from "./types";

export const CATEGORY_ORDER = [
  "Background & eligibility",
  "Health & safety",
  "Training",
  "Licensure",
  "Driving"
] as const;

const ALL_ROLES = ["Admin", "Scheduler", "Field_Staff"];
const FIELD = ["Field_Staff"];

/** Shared shape; every row overrides what it needs. */
function req(over: Partial<Requirement> & Pick<Requirement, "id" | "label" | "category" | "sortOrder" | "source">): Requirement {
  return {
    required: true, gating: true, automated: false, vendor: null,
    appliesTo: FIELD, renewsMonths: null, note: "",
    authorityCitation: null, authorityUrl: null,
    verificationStatus: "unverified", verifiedOn: null, verifiedBy: null,
    verificationNote: null,
    ...over
  };
}

export const DEFAULT_REQUIREMENTS: Requirement[] = [
  // ── Background & eligibility ────────────────────────────────────────────
  req({
    id: "background_check",
    label: "Criminal background check",
    category: "Background & eligibility",
    appliesTo: ALL_ROLES,
    source: { kind: "manual" },
    note: "Cleared report on file before any client contact.",
    authorityCitation: "10 CCR 2505-10 § 8.7409 (HCBS provider agency personnel)",
    authorityUrl: "https://cbi.colorado.gov/sections/biometric-identification-and-records-unit/employment-and-background-checks",
    verificationStatus: "reported",
    verificationNote:
      "Which roles need a fingerprint-based CBI check, and whether it recurs, was not confirmed against the rule text. Confirm scope and cadence with HCPF before relying on this.",
    sortOrder: 10
  }),
  req({
    id: "caps_check",
    label: "CAPS check (adult protective services registry)",
    category: "Background & eligibility",
    source: { kind: "manual" },
    note: "Flags a substantiated finding of mistreatment of an at-risk adult.",
    authorityCitation: "C.R.S. 26-3.1-111",
    authorityUrl: "https://ccu.colorado.gov/statute-and-rule-requirements",
    verificationStatus: "reported",
    verificationNote:
      "Statute requires a CAPS check for staff in positions providing direct care to at-risk adults (in force since January 2019). Modelled as one-time pre-employment; confirm with the CAPS Check Unit whether DLS must re-check periodically.",
    sortOrder: 20
  }),
  req({
    id: "work_eligibility",
    label: "Work eligibility (Form I-9)",
    category: "Background & eligibility",
    appliesTo: ALL_ROLES,
    source: { kind: "manual" },
    note: "Federal employment eligibility verification, completed at hire.",
    authorityCitation: "8 U.S.C. § 1324a; 8 CFR § 274a.2",
    authorityUrl: "https://www.uscis.gov/i-9",
    verificationStatus: "reported",
    verificationNote: "Federal requirement for all US employers. Re-verification applies only to limited categories of work authorisation.",
    sortOrder: 30
  }),

  // ── Health & safety ─────────────────────────────────────────────────────
  req({
    id: "tb_screening",
    label: "TB screening",
    category: "Health & safety",
    renewsMonths: 12,
    source: { kind: "manual" },
    note: "Clearance on file before client contact; annual risk assessment thereafter.",
    authorityCitation: "Colorado provider-agency health screening requirements",
    authorityUrl: null,
    verificationStatus: "reported",
    verificationNote:
      "Reported as required for Colorado personal-care and HCBS direct-care staff, with an annual risk assessment. The exact rule and whether a skin test or risk assessment satisfies it each year is UNCONFIRMED — verify before enforcing the 12-month renewal.",
    sortOrder: 40
  }),
  req({
    id: "cpr_first_aid",
    label: "CPR / First Aid",
    category: "Health & safety",
    renewsMonths: 24,
    vendor: "Relias",
    source: { kind: "training", courseNames: ["CPR / First Aid", "CPR/First Aid"] },
    note: "Certificate and expiry tracked; two-year certification cycle.",
    authorityCitation: "American Heart Association certification cycle (agency requirement)",
    authorityUrl: null,
    verificationStatus: "reported",
    verificationNote:
      "The two-year renewal is the standard AHA/Red Cross certification period rather than a Colorado mandate. Confirm whether DLS's waiver contracts require CPR for every field role or only some.",
    sortOrder: 50
  }),

  // ── Training ────────────────────────────────────────────────────────────
  // courseNames must match the training record and LMS course names exactly
  // (case-insensitive) or the evidence is not found.
  req({
    id: "qmap",
    label: "QMAP medication administration",
    category: "Training",
    // DOES NOT RENEW. QMAPs are entered on the CDPHE register and, since
    // 1 July 2017, that registration does not expire. An earlier version of
    // this registry carried a 12-month renewal, which would have raised false
    // expiry warnings on every QMAP in the agency.
    renewsMonths: null,
    vendor: "Relias",
    source: { kind: "training", courseNames: ["QMAP Medication Administration"] },
    note: "Required before administering medication (eMAR). Registration does not expire.",
    authorityCitation: "6 CCR 1011-1 Chapter 24 (Medication Administration)",
    authorityUrl: "https://cdphe.colorado.gov/health-facilities/medication-administration/qmap",
    verificationStatus: "reported",
    verificationNote:
      "CDPHE registration has not required renewal since 1 July 2017. A 2025 change re-qualifies QMAPs working in assisted-living residences; confirm with CDPHE whether it reaches DLS's HCBS settings — if it does, this row needs a renewal interval again.",
    sortOrder: 60
  }),
  req({
    id: "abuse_neglect",
    label: "Abuse, neglect & exploitation (mandated reporter)",
    category: "Training",
    appliesTo: ["Admin", "Field_Staff"],
    renewsMonths: 12,
    vendor: "Relias",
    source: { kind: "training", courseNames: ["Abuse & Neglect Prevention"] },
    note: "Mistreatment of an at-risk adult must be reported to law enforcement within 24 hours.",
    authorityCitation: "C.R.S. 26-3.1-102 (mandatory reporting of at-risk adult mistreatment)",
    authorityUrl: "https://cdhs.colorado.gov/mandatory-reporting-of-adult-mistreatment",
    verificationStatus: "reported",
    verificationNote:
      "The reporting DUTY is statutory. The annual refresher interval is an agency choice — the statute imposes the duty, not a training cadence.",
    sortOrder: 70
  }),
  req({
    id: "hipaa",
    label: "HIPAA privacy & security",
    category: "Training",
    appliesTo: ALL_ROLES,
    renewsMonths: 12,
    vendor: "Relias",
    source: { kind: "training", courseNames: ["HIPAA Privacy & Security"] },
    note: "Required before any PHI access; annual refresher is agency policy.",
    authorityCitation: "45 CFR § 164.530(b)(1)",
    authorityUrl: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164",
    verificationStatus: "agency_policy",
    verificationNote:
      "The Privacy Rule requires training of workforce members but sets no fixed interval. The annual cadence is DLS's own policy and can be changed here without any regulatory consequence.",
    sortOrder: 80
  }),
  req({
    id: "person_centered_planning",
    label: "Person-centered planning",
    category: "Training",
    required: false, gating: false,
    vendor: "Relias",
    source: { kind: "training", courseNames: ["Person-Centered Planning"] },
    note: "Recommended, not required.",
    authorityCitation: null,
    verificationStatus: "agency_policy",
    verificationNote: "Professional development. Turn Required on if a waiver contract starts to require it.",
    sortOrder: 90
  }),

  // ── Licensure ───────────────────────────────────────────────────────────
  req({
    id: "professional_license",
    label: "Professional license",
    category: "Licensure",
    source: { kind: "license" },
    note: "Reads the licence number and expiry on the staff record.",
    authorityCitation: null,
    verificationStatus: "agency_policy",
    verificationNote:
      "COLORADO DOES NOT LICENSE DIRECT SUPPORT PROFESSIONALS. This row exists because the agency records a licence number and expiry per field staff member and has always treated a lapse as a claim blocker — it is kept Required to preserve that behaviour, NOT because a rule demands it. If DLS only tracks licences for clinically licensed roles (nursing, therapy), narrow `appliesTo` or turn Required off.",
    sortOrder: 100
  }),

  // ── Driving (NMT transport only) ────────────────────────────────────────
  req({
    id: "drivers_license",
    label: "Driver's license",
    category: "Driving",
    required: false, gating: false,
    source: { kind: "manual" },
    note: "Only staff providing NMT transport need this.",
    verificationStatus: "agency_policy",
    verificationNote: "Agency requirement for transport roles.",
    sortOrder: 110
  }),
  req({
    id: "auto_insurance",
    label: "Auto insurance (current)",
    category: "Driving",
    required: false, gating: false,
    renewsMonths: 6,
    source: { kind: "manual" },
    note: "Proof of coverage for NMT transport.",
    verificationStatus: "agency_policy",
    verificationNote: "Agency requirement for transport roles; six-month cadence matches a typical policy term.",
    sortOrder: 120
  })
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
