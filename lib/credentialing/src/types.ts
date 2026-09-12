// lib/credentialing/src/types.ts — the credentialing registry's vocabulary.
//
// Deliberately dependency-free and structural. The engine runs in the browser
// build, in the API server, and in tests, so it must not reach for a database
// client, a framework, or the app's own model types.

/** A role identifier as the app defines it (e.g. "Admin", "Field_Staff"). */
export type Role = string;

/**
 * Where the engine looks for evidence that a requirement is met.
 *
 *   license  — the subject's licence number and expiry
 *   training — training records and LMS completions, matched by course name
 *   manual   — a recorded credential row only (uploads, background checks)
 */
export type CredentialSource =
  | { kind: "license" }
  | { kind: "training"; courseNames: string[] }
  | { kind: "manual" };

/**
 * How far a requirement's legal basis has actually been checked.
 *
 * A compliance registry that cannot cite its own authority is the real defect:
 * a developer's guess and a lawyer's sign-off look identical once they are in
 * the table. These statuses keep them apart, and the admin screen shows the
 * difference.
 *
 *   confirmed     — a named person checked the primary source and signed off
 *   reported      — the citation comes from secondary sources; needs checking
 *   agency_policy — the agency's own rule, not a legal mandate
 *   unverified    — a placeholder nobody has checked
 */
export type VerificationStatus = "confirmed" | "reported" | "agency_policy" | "unverified";

/** Statuses that still need a human to confirm them against the rule itself. */
export const NEEDS_REVIEW: readonly VerificationStatus[] = ["reported", "unverified"];

export interface Requirement {
  id: string;
  label: string;
  category: string;
  /** Admin toggle — on every matching subject's checklist. */
  required: boolean;
  /** Admin toggle — must be held (or waived) before the account goes Active. */
  gating: boolean;
  automated: boolean;
  vendor: string | null;
  appliesTo: Role[];
  /** Renewal interval in months; null = does not expire. */
  renewsMonths: number | null;
  source: CredentialSource;
  note: string;
  sortOrder: number;

  // ── Provenance ──────────────────────────────────────────────────────────
  /** The rule or statute this requirement rests on, e.g. "C.R.S. 26-3.1-111". */
  authorityCitation: string | null;
  authorityUrl: string | null;
  verificationStatus: VerificationStatus;
  /** YYYY-MM-DD the sign-off happened. */
  verifiedOn: string | null;
  /** Who signed off — a user id, or a free-text name for an outside reviewer. */
  verifiedBy: string | null;
  verificationNote: string | null;
}

/** A recorded credential. Absence of a row means "not started", never "held". */
export interface StaffCredentialRecord {
  staff_id: string;
  requirement_id: string;
  status: "verified" | "in_progress" | "not_started" | "failed" | "waived";
  completed_on: string | null;
  expires_on: string | null;
  note: string | null;
  waived_by: string | null;
  waive_reason: string | null;
}

// ── Structural views of the app's models ──────────────────────────────────
// The app's StaffUser, ReliasCourse and ReliasCompletion satisfy these as they
// stand; naming them here is what keeps this package free of app imports.

export interface TrainingRecord {
  course: string;
  completed_on: string;
  expires_on: string | null;
}

export interface CredentialSubject {
  id: string;
  full_name: string;
  role: Role;
  license_number: string | null;
  license_expiration_date: string | null;
  training_completed: TrainingRecord[];
}

export interface TrainingCourse {
  id: string;
  name: string;
}

export interface TrainingCompletion {
  user_id: string;
  course_id: string;
  completed_on: string;
  expires_on: string | null;
}

// ── Evaluated state ───────────────────────────────────────────────────────

/**
 * `expiring` and `expired` are derived from the date at read time — a stored
 * date cannot go stale, a stored status can.
 */
export type CredentialStatus =
  | "verified" | "expiring" | "expired"
  | "in_progress" | "not_started" | "failed" | "waived";

export interface CredentialState {
  requirement: Requirement;
  status: CredentialStatus;
  completedOn: string | null;
  expiresOn: string | null;
  /** Where the evidence came from — shown on the staff screen. */
  evidence: "credential-record" | "license" | "training-record" | "lms" | "none";
  /** One sentence, suitable for a claim blocker or a checklist row. */
  detail: string;
  /** True when this state must stop a claim going out. */
  blocksClaims: boolean;
}

export interface CredentialSummary {
  /** Gating items satisfied. */
  done: number;
  /** Gating items that apply. */
  total: number;
  /** Every gating item satisfied — the account may be activated. */
  ready: boolean;
  outstanding: CredentialState[];
  /** Held but inside the renewal window — a warning, not a block. */
  expiring: CredentialState[];
  /** Reasons a claim for this subject must not go out. */
  claimBlockers: string[];
}
