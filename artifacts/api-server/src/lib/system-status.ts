// What the provider needs to know about the running service without shell
// access: the process, the database and its migrations, the effective sign-in
// and support policy, the mail and scheduler arrangements, and anything about
// the configuration that deserves a warning. Secrets never appear here — only
// whether they are set.
import { and, count, desc, eq, sql } from "drizzle-orm";
import { jobRunsTable, migrationStatus, requirementsTable, usersTable, type Db, type MigrationStatus } from "@workspace/db";
import { FEATURE_CATALOG } from "@workspace/features";
import { countLegacyPasswordAccounts } from "./bootstrap";
import type { AppConfig } from "./config";

const STARTED_AT = new Date();

export interface SystemWarning {
  severity: "warning" | "info";
  message: string;
}

export interface SystemStatusPayload {
  service: {
    environment: string;
    nodeVersion: string;
    startedAt: string;
    uptimeSeconds: number;
    host: "replit-deployment" | "replit-workspace" | "other";
    gitSha: string | null;
  };
  database: {
    ok: boolean;
    latencyMs: number | null;
    serverVersion: string | null;
    migrations: MigrationStatus | null;
    error: string | null;
  };
  signIn: {
    cookieName: string;
    cookieSecure: boolean;
    sessionIdleMinutes: number;
    sessionMaxDays: number;
    loginMaxFailures: number;
    loginWindowMinutes: number;
    trustProxy: boolean;
    corsOrigins: string[];
    /** The limiter now lives in the database, so it holds across instances. */
    limiterBackedBy: "database";
    attemptRetentionDays: number;
  };
  security: {
    requireMfaForPlatform: boolean;
    mfaIssuer: string;
    providerAccounts: number;
    providerAccountsWithMfa: number;
    breakGlassConfigured: boolean;
    supportWindowRequired: boolean;
    supportWindowMaxHours: number;
    auditRetentionYears: number;
    auditChain: { lastVerifiedAt: string | null; ok: boolean | null; entriesChecked: number | null };
  };
  mail: {
    mode: "sendgrid" | "log";
    configured: boolean;
    fromDomain: string;
    sandbox: boolean;
    redirectAllTo: string | null;
    baaSignedAllVendors: boolean;
    /** Message text goes to the log in log mode. Never true in production. */
    logBodies: boolean;
  };
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
    externalCronConfigured: boolean;
  };
  provider: {
    superAdminEmail: string;
    superAdminName: string;
    /** Does the configured provider account exist yet? False means setup is incomplete. */
    accountExists: boolean;
    /** It exists but has not yet replaced its one-time setup password. */
    passwordPendingChange: boolean;
    /** SUPER_ADMIN_PASSWORD is present in the environment (only read at first boot or with a force reset). */
    passwordFromEnvironment: boolean;
    forceResetEnabled: boolean;
    /** Accounts still holding the password that earlier builds committed as a default. */
    legacyPasswordAccounts: number;
    defaultOrgName: string;
    defaultOrgSlug: string;
    platformAccounts: number;
  };
  catalog: { features: number; featuresAvailable: number; requirements: number | null };
  warnings: SystemWarning[];
}

export interface ProviderAccountState {
  exists: boolean;
  mustChangePassword: boolean;
}

export interface WarningInput {
  environment: string;
  config: AppConfig;
  migrations: MigrationStatus | null;
  databaseOk: boolean;
  platformAccounts: number;
  platformAccountsWithMfa: number;
  providerAccount: ProviderAccountState;
  legacyPasswordAccounts: number;
  auditChainOk: boolean | null;
}

export function systemWarnings(input: WarningInput): SystemWarning[] {
  const { config } = input;
  const warnings: SystemWarning[] = [];
  const production = input.environment === "production";

  if (!input.databaseOk) warnings.push({ severity: "warning", message: "The database did not answer a health query." });
  if (input.migrations && input.migrations.pending.length > 0) {
    warnings.push({
      severity: "warning",
      message: `${input.migrations.pending.length} database migration(s) have not been applied: ${input.migrations.pending.join(", ")}. Restart the API server to apply them.`,
    });
  }
  if (production && !config.cookieSecure) {
    warnings.push({ severity: "warning", message: "The session cookie is not marked Secure in production; it could travel over plain HTTP." });
  }
  if (!input.providerAccount.exists) {
    warnings.push({
      severity: "warning",
      message: `The provider account ${config.superAdminEmail} does not exist. Set SUPER_ADMIN_PASSWORD to a strong one-time setup password and restart the API: the account is created at boot and must be replaced at its first sign-in. There is no built-in default.`,
    });
  } else if (input.providerAccount.mustChangePassword) {
    warnings.push({
      severity: "info",
      message: `The provider account ${config.superAdminEmail} is still on its one-time setup password. Its next sign-in cannot proceed until a new password is chosen.`,
    });
  }
  if (input.legacyPasswordAccounts > 0) {
    warnings.push({
      severity: "warning",
      message: `${input.legacyPasswordAccounts} account(s) still hold the retired bootstrap password that earlier builds shipped in the repository. Each is flagged to choose a new password at its next sign-in; until that happens treat the account as exposed and end its sessions if in doubt.`,
    });
  }
  if (config.superAdminForceReset) {
    warnings.push({
      severity: "warning",
      message:
        "SUPER_ADMIN_FORCE_RESET is still true. Every restart resets the provider password to SUPER_ADMIN_PASSWORD and ends its sessions; unset it now that the rotation is done.",
    });
  }
  if (config.superAdminPassword && input.providerAccount.exists) {
    warnings.push({
      severity: production ? "warning" : "info",
      message:
        "SUPER_ADMIN_PASSWORD is still set in the environment. It was a one-time setup value and is never read again unless SUPER_ADMIN_FORCE_RESET is on; remove it from the secret store.",
    });
  }
  if (config.corsOrigins.length > 0) {
    warnings.push({ severity: "info", message: `Cross-site browser origins may call the API: ${config.corsOrigins.join(", ")}.` });
  }
  if (config.publicFormOrigins.length > 0) {
    warnings.push({
      severity: "info",
      message: `The public website may send inquiries to /api/public from: ${config.publicFormOrigins.join(", ")}.`,
    });
  }
  if (!config.breakGlassEmail || !config.breakGlassPassword) {
    warnings.push({
      severity: "warning",
      message:
        "No break-glass provider account is configured. Set SUPER_ADMIN_BREAKGLASS_EMAIL and SUPER_ADMIN_BREAKGLASS_PASSWORD so a lost provider password is a sign-in rather than a lockout.",
    });
  }
  if (input.platformAccounts <= 1) {
    warnings.push({
      severity: "info",
      message: "Only one provider account exists, so there is nobody to let you back in if it is locked out.",
    });
  }
  if (!config.requireMfaForPlatform) {
    warnings.push({
      severity: input.platformAccountsWithMfa === 0 ? "warning" : "info",
      message:
        input.platformAccountsWithMfa === 0
          ? "No provider account has a second factor, and REQUIRE_MFA_FOR_PLATFORM is off. The whole platform rests on one password."
          : "REQUIRE_MFA_FOR_PLATFORM is off. Turn it on once every provider account has enrolled.",
    });
  } else if (input.platformAccountsWithMfa < input.platformAccounts) {
    warnings.push({
      severity: "warning",
      message: `Two-factor sign-in is required, but ${input.platformAccounts - input.platformAccountsWithMfa} provider account(s) have not enrolled and cannot work until they do.`,
    });
  }
  if (!config.requireSupportWindow) {
    warnings.push({
      severity: "info",
      message:
        "REQUIRE_SUPPORT_WINDOW is off: a provider account can open an audited view-as session without the organization's Admin first granting a support window. Set it to true to require one.",
    });
  }
  if (config.mail.mode === "log") {
    warnings.push({
      severity: production ? "warning" : "info",
      message: config.mail.logBodies
        ? "No mail provider is configured. Messages are recorded in the outbox and their text — including invitation and reset links — is written to the log (development only, MAIL_LOG_BODIES)."
        : "No mail provider is configured. Messages are recorded in the outbox and not sent, and links are not written to the log. Hand over the on-screen one-time password in person until SENDGRID_API_KEY and APP_BASE_URL are set; a 'forgot password' request cannot be fulfilled in this state.",
    });
  }
  if (config.mail.mode === "sendgrid" && !config.appBaseUrl) {
    warnings.push({
      severity: "warning",
      message: "SENDGRID_API_KEY is set but APP_BASE_URL is not, so links in email are bare paths. Set APP_BASE_URL to the portal's public address.",
    });
  }
  if (config.mail.redirectAllTo) {
    warnings.push({
      severity: production ? "warning" : "info",
      message: `All mail is being redirected to ${config.mail.redirectAllTo} (MAIL_REDIRECT_ALL_TO).`,
    });
  }
  if (!config.schedulerEnabled && !config.cronSecret) {
    warnings.push({
      severity: "warning",
      message:
        "The scheduler is off and no CRON_SECRET is set, so nothing runs the expiry reminders, pruning or audit verification.",
    });
  }
  if (input.auditChainOk === false) {
    warnings.push({
      severity: "warning",
      message: "The last audit-chain verification FAILED. An entry has been changed or removed — open the audit log and verify it.",
    });
  }
  if (!production) {
    warnings.push({ severity: "info", message: `The API is running in ${input.environment} mode.` });
  }
  return warnings;
}

export async function collectSystemStatus(
  db: Db,
  config: AppConfig,
  extra: {
    platformAccounts: number;
    platformAccountsWithMfa: number;
    featuresAvailable: number;
    providerAccount: ProviderAccountState;
  }
): Promise<SystemStatusPayload> {
  const environment = process.env.NODE_ENV ?? "development";

  let databaseOk = false;
  let latencyMs: number | null = null;
  let serverVersion: string | null = null;
  let error: string | null = null;
  let migrations: MigrationStatus | null = null;
  let requirements: number | null = null;
  let legacyPasswordAccounts = 0;
  let auditChain: SystemStatusPayload["security"]["auditChain"] = {
    lastVerifiedAt: null,
    ok: null,
    entriesChecked: null,
  };

  try {
    const started = performance.now();
    const version = await db.execute(sql`select current_setting('server_version') as v`);
    latencyMs = Math.round((performance.now() - started) * 10) / 10;
    serverVersion = String((version.rows[0] as { v?: string } | undefined)?.v ?? "") || null;
    databaseOk = true;
    migrations = await migrationStatus(db);
    const [row] = await db.select({ n: count() }).from(requirementsTable);
    requirements = row?.n ?? 0;
    legacyPasswordAccounts = await countLegacyPasswordAccounts(db);

    // The chain is verified by a scheduled job rather than on every page load:
    // walking a long log is not something a screen should do.
    const [lastVerify] = await db
      .select()
      .from(jobRunsTable)
      .where(and(eq(jobRunsTable.name, "audit.verify_chain"), sql`${jobRunsTable.finishedAt} is not null`))
      .orderBy(desc(jobRunsTable.startedAt))
      .limit(1);
    if (lastVerify) {
      auditChain = {
        lastVerifiedAt: (lastVerify.finishedAt ?? lastVerify.startedAt).toISOString(),
        ok: lastVerify.ok,
        entriesChecked: lastVerify.itemsProcessed,
      };
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return {
    service: {
      environment,
      nodeVersion: process.version,
      startedAt: STARTED_AT.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      host: process.env.REPLIT_DEPLOYMENT ? "replit-deployment" : process.env.REPL_ID ? "replit-workspace" : "other",
      gitSha: process.env.GIT_SHA ?? process.env.SOURCE_VERSION ?? null,
    },
    database: { ok: databaseOk, latencyMs, serverVersion, migrations, error },
    signIn: {
      cookieName: config.cookieName,
      cookieSecure: config.cookieSecure,
      sessionIdleMinutes: Math.round(config.sessionIdleMs / 60_000),
      sessionMaxDays: Math.round(config.sessionAbsoluteMs / 86_400_000),
      loginMaxFailures: config.loginMaxFailures,
      loginWindowMinutes: Math.round(config.loginWindowMs / 60_000),
      trustProxy: config.trustProxy,
      corsOrigins: config.corsOrigins,
      limiterBackedBy: "database",
      attemptRetentionDays: config.loginAttemptRetentionDays,
    },
    security: {
      requireMfaForPlatform: config.requireMfaForPlatform,
      mfaIssuer: config.mfaIssuer,
      providerAccounts: extra.platformAccounts,
      providerAccountsWithMfa: extra.platformAccountsWithMfa,
      breakGlassConfigured: Boolean(config.breakGlassEmail && config.breakGlassPassword),
      supportWindowRequired: config.requireSupportWindow,
      supportWindowMaxHours: config.supportWindowMaxHours,
      auditRetentionYears: config.auditRetentionYears,
      auditChain,
    },
    mail: {
      mode: config.mail.mode,
      configured: config.mail.mode === "sendgrid",
      fromDomain: config.mail.fromDomain,
      sandbox: config.mail.sandbox,
      redirectAllTo: config.mail.redirectAllTo ?? null,
      baaSignedAllVendors: config.mail.baaSignedAllVendors,
      logBodies: config.mail.logBodies,
    },
    scheduler: {
      enabled: config.schedulerEnabled,
      intervalMinutes: Math.round(config.schedulerIntervalMs / 60_000),
      externalCronConfigured: Boolean(config.cronSecret),
    },
    provider: {
      superAdminEmail: config.superAdminEmail,
      superAdminName: config.superAdminName,
      accountExists: extra.providerAccount.exists,
      passwordPendingChange: extra.providerAccount.exists && extra.providerAccount.mustChangePassword,
      passwordFromEnvironment: Boolean(config.superAdminPassword),
      forceResetEnabled: config.superAdminForceReset,
      legacyPasswordAccounts,
      defaultOrgName: config.defaultOrgName,
      defaultOrgSlug: config.defaultOrgSlug,
      platformAccounts: extra.platformAccounts,
    },
    catalog: { features: FEATURE_CATALOG.length, featuresAvailable: extra.featuresAvailable, requirements },
    warnings: systemWarnings({
      environment,
      config,
      migrations,
      databaseOk,
      platformAccounts: extra.platformAccounts,
      platformAccountsWithMfa: extra.platformAccountsWithMfa,
      providerAccount: extra.providerAccount,
      legacyPasswordAccounts,
      auditChainOk: auditChain.ok,
    }),
  };
}
