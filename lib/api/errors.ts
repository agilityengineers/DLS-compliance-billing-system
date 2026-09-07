// lib/api/errors.ts — what an API route may say about a failure.
//
// Database error text can echo row values ("Key (medicaid_id)=(…) already
// exists"), and the field app logs and displays what it receives. Only
// messages authored by OUR rule triggers/demo store (they start with a rule
// code and carry no PHI) are echoed verbatim; everything else collapses to a
// code. Full text is logged server-side only when LOG_SENSITIVE_ERRORS=true.

export const RULE_CODES = [
  "EVV_GEOFENCE", "NMT_AUTHORIZATION_EXHAUSTED", "NMT_NOT_AUTHORIZED",
  "PHYSICIAN_ORDER_REQUIRED", "PHYSICIAN_ORDER_INACTIVE",
  "CHECK_VIOLATION", "UNIQUE_VIOLATION", "RLS_DENIED", "INCIDENT_CLOSED", "NOTE_LOCKED"
] as const;

export interface PublicError { error: string; status: number }

export function toPublicError(raw: string | undefined | null, fallbackStatus = 500): PublicError {
  const msg = raw ?? "";
  const rule = RULE_CODES.find((c) => msg.startsWith(c) || msg.includes(`${c}:`));
  if (rule) {
    // Our own rule text: safe to show (distances, counts, dates — never rows).
    const idx = msg.indexOf(rule);
    return { error: msg.slice(idx), status: 409 };
  }
  if (/row-level security/i.test(msg)) return { error: "RLS_DENIED", status: 409 };
  if (/check constraint|new row violates/i.test(msg)) return { error: "CHECK_VIOLATION", status: 409 };
  if (/duplicate key/i.test(msg)) return { error: "UNIQUE_VIOLATION", status: 409 };
  if (msg.startsWith("TIMESHEET_APPEND_FAILED")) return { error: "TIMESHEET_APPEND_FAILED", status: 500 };
  return { error: "SERVER_ERROR", status: fallbackStatus };
}

/** Server-side log line with no row data unless explicitly enabled. */
export function logApiError(scope: string, raw: string | undefined | null, publicCode: string): void {
  if (process.env.LOG_SENSITIVE_ERRORS === "true") {
    console.error(`[${scope}] ${publicCode}: ${raw}`);
  } else {
    console.error(`[${scope}] ${publicCode}`);
  }
}
