// Runtime configuration for the API server, read once at startup.
//
// Every value has a safe default so a fresh Replit deployment boots with only
// DATABASE_URL and PORT set. Override through the host's secret store.

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
  trustProxy: boolean;
  /** The platform owner account created on first boot. */
  superAdminEmail: string;
  superAdminName: string;
  /** Plain-text bootstrap password; when unset the committed bootstrap hash is used. */
  superAdminPassword: string | undefined;
  /** Rotate the super admin password to superAdminPassword on boot, even if the account exists. */
  superAdminForceReset: boolean;
  /** The first organization, created on first boot. */
  defaultOrgName: string;
  defaultOrgSlug: string;
  /** Failed logins allowed per email+IP inside the window before a cool-down. */
  loginMaxFailures: number;
  loginWindowMs: number;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  return {
    cookieName: env.SESSION_COOKIE_NAME ?? "dls_session",
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : production,
    sessionIdleMs: int(env.SESSION_IDLE_MINUTES, 12 * 60) * 60_000,
    sessionAbsoluteMs: int(env.SESSION_MAX_DAYS, 7) * 24 * 3_600_000,
    corsOrigins: (env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === "true" : true,
    superAdminEmail: (env.SUPER_ADMIN_EMAIL ?? "emailme@clarencewilliams.com").trim().toLowerCase(),
    superAdminName: env.SUPER_ADMIN_NAME ?? "Clarence Williams",
    superAdminPassword: env.SUPER_ADMIN_PASSWORD || undefined,
    superAdminForceReset: env.SUPER_ADMIN_FORCE_RESET === "true",
    defaultOrgName: env.DEFAULT_ORG_NAME ?? "Durable Life Skills, Inc.",
    defaultOrgSlug: env.DEFAULT_ORG_SLUG ?? "durable-life-skills",
    loginMaxFailures: int(env.LOGIN_MAX_FAILURES, 10),
    loginWindowMs: int(env.LOGIN_WINDOW_MINUTES, 15) * 60_000,
  };
}
