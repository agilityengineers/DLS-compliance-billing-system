// lib/credentialing/src/engine.ts — the credentialing engine.
//
// A pure function over the requirements registry: no I/O, no framework, no
// database. The same evaluation runs in claim readiness, on the staff screen,
// in the API server and in tests, which is what stops those surfaces drifting.
//
// BACKWARD COMPATIBILITY. Each requirement names where its evidence lives
// (`source`), so data predating the registry keeps working: licence
// requirements read the licence column, training requirements read training
// records and LMS completions by course name. An explicit credential record
// always wins over the fallback.
import type {
  CredentialState, CredentialStatus, CredentialSubject, CredentialSummary,
  Requirement, Role, StaffCredentialRecord, TrainingCompletion, TrainingCourse
} from "./types";

/** Statuses that mean the subject currently holds the credential. */
const SATISFIED: ReadonlySet<CredentialStatus> = new Set<CredentialStatus>([
  "verified", "expiring", "waived"
]);

export interface EvaluateOptions {
  requirements: Requirement[];
  staff: CredentialSubject;
  credentials?: StaffCredentialRecord[];
  /** LMS course catalogue (Relias), used to resolve completions by name. */
  courses?: TrainingCourse[];
  completions?: TrainingCompletion[];
  /** Agency-local today, YYYY-MM-DD. */
  today: string;
  /** A held credential inside this window is flagged `expiring` (warning only). */
  expiringWithinDays?: number;
  /**
   * Treat a gating requirement with NO evidence at all as a claim blocker.
   *
   * Defaults to FALSE, which preserves the behaviour this engine replaced: a
   * staff member who never took a required course was never blocked, only one
   * whose record had lapsed. Turning this on is roadmap Phase 2.8 ("training
   * overdue blocking that also catches staff who never took a required
   * course") and is a deliberate billing-behaviour change — it will stop
   * claims that go out today.
   */
  blockOnMissing?: boolean;
}

const DEFAULT_EXPIRING_DAYS = 45;

/** Requirements that apply to a role, in registry order. */
export function requirementsForRole(requirements: Requirement[], role: Role): Requirement[] {
  return requirements
    .filter((r) => r.appliesTo.includes(role))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/** Requirements that gate activation for a role (honours the `required` toggle). */
export function gatingRequirementsForRole(requirements: Requirement[], role: Role): Requirement[] {
  return requirementsForRole(requirements, role).filter((r) => r.required && r.gating);
}

/** Whole-number days from `from` to `to`, both YYYY-MM-DD. Negative = past. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y.slice(2)}` : iso;
}

/** Latest-completed wins when several records satisfy one requirement. */
function latestBy<T>(rows: T[], key: (row: T) => string | null): T | null {
  return rows.reduce<T | null>((best, row) => {
    const v = key(row);
    if (!v) return best;
    const bv = best ? key(best) : null;
    return !bv || v > bv ? row : best;
  }, null);
}

/** Resolve `verified` against its expiry date, producing the derived states. */
function dateStatus(
  expiresOn: string | null,
  today: string,
  expiringWithinDays: number
): Extract<CredentialStatus, "verified" | "expiring" | "expired"> {
  if (!expiresOn) return "verified";
  const daysLeft = daysBetween(today, expiresOn);
  if (daysLeft < 0) return "expired";
  return daysLeft <= expiringWithinDays ? "expiring" : "verified";
}

function describe(r: Requirement, status: CredentialStatus, expiresOn: string | null): string {
  if (status === "expired" && expiresOn) return `${r.label} expired ${fmt(expiresOn)}.`;
  if (status === "expiring" && expiresOn) return `${r.label} expires ${fmt(expiresOn)} — renewal needed.`;
  return expiresOn ? `${r.label} current through ${fmt(expiresOn)}.` : `${r.label} on file.`;
}

/**
 * Evaluate every requirement that applies to this subject.
 *
 * Resolution order per requirement:
 *   1. an explicit credential record (waivers and failures included)
 *   2. the requirement's `source` — licence, training records, LMS
 *   3. nothing → not_started
 */
export function evaluateCredentials(opts: EvaluateOptions): CredentialState[] {
  const {
    requirements, staff, credentials = [], courses = [], completions = [],
    today, expiringWithinDays = DEFAULT_EXPIRING_DAYS, blockOnMissing = false
  } = opts;

  const mine = credentials.filter((c) => c.staff_id === staff.id);
  const myCompletions = completions.filter((c) => c.user_id === staff.id);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  return requirementsForRole(requirements, staff.role).map((requirement) => {
    const state = resolve(requirement);
    // Only a REQUIRED + GATING item can ever stop a claim. An optional item, or
    // one an admin has un-gated, is informational however bad it looks.
    const gates = requirement.required && requirement.gating;
    const blocksClaims =
      gates &&
      (state.status === "expired" ||
        state.status === "failed" ||
        (blockOnMissing && !SATISFIED.has(state.status)));
    return { ...state, requirement, blocksClaims };

    function resolve(r: Requirement): Omit<CredentialState, "requirement" | "blocksClaims"> {
      // 1. An explicit record always wins.
      const record = mine.find((c) => c.requirement_id === r.id);
      if (record && record.status !== "not_started") {
        if (record.status === "waived") {
          return {
            status: "waived", completedOn: record.completed_on, expiresOn: record.expires_on,
            evidence: "credential-record",
            detail: `${r.label} waived by an administrator${record.waive_reason ? ` — ${record.waive_reason}` : ""}.`
          };
        }
        if (record.status === "failed") {
          return {
            status: "failed", completedOn: record.completed_on, expiresOn: record.expires_on,
            evidence: "credential-record",
            detail: `${r.label} failed${record.note ? ` — ${record.note}` : ""}.`
          };
        }
        if (record.status === "in_progress") {
          return {
            status: "in_progress", completedOn: record.completed_on, expiresOn: record.expires_on,
            evidence: "credential-record",
            detail: `${r.label} is in progress${record.note ? ` — ${record.note}` : ""}.`
          };
        }
        const status = dateStatus(record.expires_on, today, expiringWithinDays);
        return {
          status, completedOn: record.completed_on, expiresOn: record.expires_on,
          evidence: "credential-record", detail: describe(r, status, record.expires_on)
        };
      }

      // 2. Fall back to where this requirement's evidence naturally lives.
      if (r.source.kind === "license") {
        if (!staff.license_number) {
          return { status: "not_started", completedOn: null, expiresOn: null, evidence: "none",
            detail: `No ${r.label.toLowerCase()} on file.` };
        }
        const status = dateStatus(staff.license_expiration_date, today, expiringWithinDays);
        return {
          status, completedOn: null, expiresOn: staff.license_expiration_date,
          evidence: "license", detail: describe(r, status, staff.license_expiration_date)
        };
      }

      if (r.source.kind === "training") {
        const wanted = r.source.courseNames.map((n) => n.trim().toLowerCase());
        const matches = (name: string) => wanted.includes(name.trim().toLowerCase());

        const training = latestBy(
          staff.training_completed.filter((t) => matches(t.course)),
          (t) => t.completed_on
        );
        const lms = latestBy(
          myCompletions.filter((c) => {
            const course = courseById.get(c.course_id);
            return !!course && matches(course.name);
          }),
          (c) => c.completed_on
        );

        // Either source can satisfy the requirement; take whichever is newer.
        const best =
          training && lms
            ? training.completed_on >= lms.completed_on
              ? { on: training.completed_on, exp: training.expires_on, ev: "training-record" as const }
              : { on: lms.completed_on, exp: lms.expires_on, ev: "lms" as const }
            : training
              ? { on: training.completed_on, exp: training.expires_on, ev: "training-record" as const }
              : lms
                ? { on: lms.completed_on, exp: lms.expires_on, ev: "lms" as const }
                : null;

        if (!best) {
          return { status: "not_started", completedOn: null, expiresOn: null, evidence: "none",
            detail: `No record of ${r.label} for ${staff.full_name}.` };
        }
        const status = dateStatus(best.exp, today, expiringWithinDays);
        return { status, completedOn: best.on, expiresOn: best.exp, evidence: best.ev,
          detail: describe(r, status, best.exp) };
      }

      // 3. manual — a record is the only evidence there is.
      return { status: "not_started", completedOn: null, expiresOn: null, evidence: "none",
        detail: `${r.label} has not been started.` };
    }
  });
}

export function summarize(states: CredentialState[]): CredentialSummary {
  const gating = states.filter((s) => s.requirement.required && s.requirement.gating);
  const satisfied = gating.filter((s) => SATISFIED.has(s.status));
  return {
    done: satisfied.length,
    total: gating.length,
    ready: satisfied.length === gating.length,
    outstanding: gating.filter((s) => !SATISFIED.has(s.status)),
    expiring: states.filter((s) => s.status === "expiring"),
    claimBlockers: states.filter((s) => s.blocksClaims).map((s) => s.detail)
  };
}

/** Convenience: evaluate and summarize in one call. */
export function evaluateAndSummarize(opts: EvaluateOptions): {
  states: CredentialState[];
  summary: CredentialSummary;
} {
  const states = evaluateCredentials(opts);
  return { states, summary: summarize(states) };
}
