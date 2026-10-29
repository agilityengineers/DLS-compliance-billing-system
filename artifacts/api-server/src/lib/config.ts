// Runtime configuration for the API server, read once at startup.
//
// Every value has a safe default so a fresh Replit deployment boots with only
// DATABASE_URL and PORT set. Override through the host's secret store.
//
// Two rules keep the defaults honest:
//   · a missing secret degrades to the safe behaviour, never to the open one
//     (no mail key means invitations are logged, not silently unsent);
//   · anything that loosens security is off unless it is set on purpose.

export type MailMode = "sendgrid" | "log";

export interface MailConfig {
  /** "sendgrid" once an API key is present; "log" records the message and stops. */
  mode: MailMode;
  apiKey: string | undefined;
  /** Verified sending domain; the local parts (noreply, staff, …) are fixed. */
  fromDomain: string;
  /** Ask SendGrid to validate without delivering. */
  sandbox: boolean;
  /** Development only: send everything here instead of to the real recipient. */
  redirectAllTo: string | undefined;
  /** Opens templates marked as carrying PHI. Nothing shipped is marked so. */
  baaSignedAllVendors: boolean;
  /**
   * With no provider configured, also write each message's text to the log.
   * The text of an invitation or a reset IS the single-use link, so this is
   * never true in production: there the outbox records that a message was
   * composed, and the on-screen one-time password is the hand-over path.
   * Defaults to on in development only (MAIL_LOG_BODIES overrides).
   */
  logBodies: boolean;
}

export interface AppConfig {
  /** Name of the httpOnly session cookie. */
  cookieName: string;
  /** Send the cookie only over HTTPS (on in production). */
  cookieSecure: boolean;
  /** A session ends after this much inactivity. */
  sessionIdleMs: number;
  /** …and never lives longer than this, active or not. */
  sessionAbsoluteMs: number;
  /** Browser origins allowed to call the API cross-site. Empty = same-origin only. */
  corsOrigins: string[];
  /**
   * Origins of the public website whose forms post to /api/public (the
   * marketing site lives on its own domain). Separate from corsOrigins on
   * purpose: these origins get the public routes only, never a cookie.
   */
  publicFormOrigins: string[];
  trustProxy: boolean;
  /** Where links in email point. Falls back to a relative path when unset. */
  appBaseUrl: string | undefined;

  /** The platform owner account created on first boot. */
  superAdminEmail: string;
  superAdminName: string;
  /**
   * One-time setup password for the provider account. Required for the first
   * boot — there is no built-in default — and single-use: the account must
   * replace it at its first sign-in. Remove it from the environment once the
   * account exists; it is never read again unless superAdminForceReset is on.
   */
  superAdminPassword: string | undefined;
  /**
   * Rotate the existing provider account's password to superAdminPassword on
   * boot: an explicit, audited recovery that ends every session and makes the
   * new password single-use as well. Unset it straight after the restart.
   */
  superAdminForceReset: boolean;
  /**
   * The break-glass provider account. A second, rarely used Super Admin whose
   * password lives only in the deployment's secret store, so a lost or
   * compromised primary password is a recoverable event rather than a lockout.
   * Created on boot when an email and password are both set.
   */
  breakGlassEmail: string | undefined;
  breakGlassName: string;
  breakGlassPassword: string | undefined;

  /** The first organization, created on first boot. */
  defaultOrgName: string;
  defaultOrgSlug: string;

  /** Failed logins allowed per email+IP inside the window before a cool-down. */
  loginMaxFailures: number;
  loginWindowMs: number;
  /** How long sign-in attempt rows are kept for the limiter and for review. */
  loginAttemptRetentionDays: number;

  /**
   * Website form attempts one IP address may make inside the window before a
   * cool-down. Every attempt counts — a stored inquiry, a retry of one, a
   * rejected form, a honeypot hit — so the default leaves room for a person
   * to correct a form a few times, which is why it is higher than the number
   * of inquiries anyone sends in ten minutes.
   */
  leadMaxPerIp: number;
  leadWindowMs: number;
  /** How long a lead keeps the submitting IP address (and the attempts ledger its rows) before the scrub job removes them. */
  leadIpRetentionDays: number;
  /**
   * The organization the stored consultation requests from the earlier
   * storage-only endpoint belong to. Unset, the import happens only while
   * the default organization is the only one (see lib/leads.ts).
   */
  consultationImportOrgSlug: string | undefined;

  /** Second factor. */
  mfaIssuer: string;
  /** Refuse provider routes to a provider account that has not enrolled. */
  requireMfaForPlatform: boolean;
  /** How long the half-finished login between password and code stays valid. */
  mfaPendingTtlMs: number;

  /**
   * Refuse a provider view-as session unless the organization's Admin has
   * opened a support window (review decision D-02). Off by default: the owner
   * decided on 2026-09-16 that provider support sessions need no window. Every
   * session is still audited; the window stays available as an opt-in.
   */
  requireSupportWindow: boolean;
  /** Longest support window an organization Admin may grant in one go. */
  supportWindowMaxHours: number;

  /** How long audit entries must be kept. Reported, never enforced by deletion. */
  auditRetentionYears: number;

  /** Invitation and password-reset link lifetimes. */
  inviteTtlMs: number;
  resetTtlMs: number;

  mail: MailConfig;

  /** In-process maintenance scheduler. */
  schedulerEnabled: boolean;
  schedulerIntervalMs: number;
  /** Shared secret that lets an external cron run a job without a session. */
  cronSecret: string | undefined;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const apiKey = env.SENDGRID_API_KEY || undefined;
  return {
    cookieName: env.SESSION_COOKIE_NAME ?? "dls_session",
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : production,
    sessionIdleMs: int(env.SESSION_IDLE_MINUTES, 12 * 60) * 60_000,
    sessionAbsoluteMs: int(env.SESSION_MAX_DAYS, 7) * 24 * 3_600_000,
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    publicFormOrigins: (env.PUBLIC_FORM_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === "true" : true,
    appBaseUrl: (env.APP_BASE_URL ?? "").trim().replace(/\/$/, "") || undefined,

    superAdminEmail: (env.SUPER_ADMIN_EMAIL ?? "emailme@clarencewilliams.com").trim().toLowerCase(),
    superAdminName: env.SUPER_ADMIN_NAME ?? "Clarence Williams",
    superAdminPassword: env.SUPER_ADMIN_PASSWORD || undefined,
    superAdminForceReset: env.SUPER_ADMIN_FORCE_RESET === "true",
    breakGlassEmail: (env.SUPER_ADMIN_BREAKGLASS_EMAIL ?? "").trim().toLowerCase() || undefined,
    breakGlassName: env.SUPER_ADMIN_BREAKGLASS_NAME ?? "Break-glass provider account",
    breakGlassPassword: env.SUPER_ADMIN_BREAKGLASS_PASSWORD || undefined,

    defaultOrgName: env.DEFAULT_ORG_NAME ?? "Durable Life Skills, Inc.",
    defaultOrgSlug: env.DEFAULT_ORG_SLUG ?? "durable-life-skills",

    loginMaxFailures: int(env.LOGIN_MAX_FAILURES, 10),
    loginWindowMs: int(env.LOGIN_WINDOW_MINUTES, 15) * 60_000,
    loginAttemptRetentionDays: int(env.LOGIN_ATTEMPT_RETENTION_DAYS, 90),

    leadMaxPerIp: int(env.LEAD_MAX_PER_IP, 8),
    leadWindowMs: int(env.LEAD_WINDOW_MINUTES, 10) * 60_000,
    leadIpRetentionDays: int(env.LEAD_IP_RETENTION_DAYS, 90),
    consultationImportOrgSlug: (env.CONSULTATION_IMPORT_ORG_SLUG ?? "").trim().toLowerCase() || undefined,

    mfaIssuer: env.MFA_ISSUER ?? "DLS Portal",
    requireMfaForPlatform: bool(env.REQUIRE_MFA_FOR_PLATFORM, false),
    mfaPendingTtlMs: int(env.MFA_PENDING_TTL_MINUTES, 10) * 60_000,

    requireSupportWindow: bool(env.REQUIRE_SUPPORT_WINDOW, false),
    supportWindowMaxHours: int(env.SUPPORT_WINDOW_MAX_HOURS, 8),

    auditRetentionYears: int(env.AUDIT_RETENTION_YEARS, 6),

    inviteTtlMs: int(env.INVITE_TTL_HOURS, 168) * 3_600_000,
    resetTtlMs: int(env.RESET_TTL_MINUTES, 60) * 60_000,

    mail: {
      mode: apiKey ? "sendgrid" : "log",
      apiKey,
      fromDomain: (env.MAIL_FROM_DOMAIN ?? "durablelifeskills.com").trim().toLowerCase(),
      sandbox: env.SENDGRID_SANDBOX === "true",
      redirectAllTo: (env.MAIL_REDIRECT_ALL_TO ?? "").trim().toLowerCase() || undefined,
      baaSignedAllVendors: env.BAA_SIGNED_ALL_VENDORS === "true",
      logBodies: production ? false : bool(env.MAIL_LOG_BODIES, env.NODE_ENV === "development"),
    },

    schedulerEnabled: bool(env.SCHEDULER_ENABLED, true),
    schedulerIntervalMs: int(env.SCHEDULER_INTERVAL_MINUTES, 15) * 60_000,
    cronSecret: env.CRON_SECRET || undefined,
  };
}

/**
 * Combinations the server refuses to start with. Each entry is a complete
 * sentence for the log; the caller decides that the list being non-empty is
 * fatal. Kept deliberately short — a warning on System status is the right
 * place for everything that is merely unwise.
 */
export function configProblems(config: AppConfig): string[] {
  const problems: string[] = [];
  if (config.mail.mode === "sendgrid" && !config.appBaseUrl) {
    problems.push(
      "SENDGRID_API_KEY is set but APP_BASE_URL is not: every link in every email would be a bare path that opens nothing. Set APP_BASE_URL to the portal's public address (https://…) or remove the key."
    );
  }
  return problems;
}
