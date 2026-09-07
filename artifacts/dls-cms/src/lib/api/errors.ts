// Public error sanitizer. Database text can contain PHI and must not be
// displayed or persisted by the field client.
export const RULE_CODES = [
  "EVV_GEOFENCE", "NMT_AUTHORIZATION_EXHAUSTED", "NMT_NOT_AUTHORIZED",
  "PHYSICIAN_ORDER_REQUIRED", "PHYSICIAN_ORDER_INACTIVE",
  "CHECK_VIOLATION", "UNIQUE_VIOLATION", "RLS_DENIED", "INCIDENT_CLOSED", "NOTE_LOCKED",
] as const;

export interface PublicError {
  error: string;
  status: number;
}

export function toPublicError(raw: string | undefined | null, fallbackStatus = 500): PublicError {
  const msg = raw ?? "";
  const rule = RULE_CODES.find((code) => msg.startsWith(code) || msg.includes(`${code}:`));
  if (rule) {
    return { error: msg.slice(msg.indexOf(rule)), status: 409 };
  }
  if (/row-level security/i.test(msg)) return { error: "RLS_DENIED", status: 409 };
  if (/check constraint|new row violates/i.test(msg)) return { error: "CHECK_VIOLATION", status: 409 };
  if (/duplicate key/i.test(msg)) return { error: "UNIQUE_VIOLATION", status: 409 };
  if (msg.startsWith("TIMESHEET_APPEND_FAILED")) {
    return { error: "TIMESHEET_APPEND_FAILED", status: 500 };
  }
  return { error: "SERVER_ERROR", status: fallbackStatus };
}

export function logApiError(
  scope: string,
  raw: string | undefined | null,
  publicCode: string,
): void {
  if (process.env.LOG_SENSITIVE_ERRORS === "true") {
    console.error(`[${scope}] ${publicCode}: ${raw}`);
  } else {
    console.error(`[${scope}] ${publicCode}`);
  }
}