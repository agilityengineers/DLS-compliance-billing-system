// What the provider needs to know about the running service without shell
// access: the process, the database and its migrations, the effective sign-in
// policy, and anything about the configuration that deserves a warning.
// Secrets never appear here — only whether they are set.
import { count, sql } from "drizzle-orm";
import { migrationStatus, requirementsTable, type Db, type MigrationStatus } from "@workspace/db";
import { FEATURE_CATALOG } from "@workspace/features";
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
  };
  provider: {
    superAdminEmail: string;
    superAdminName: string;
    passwordFromEnvironment: boolean;
    forceResetEnabled: boolean;
    defaultOrgName: string;
    defaultOrgSlug: string;
    platformAccounts: number;
  };
  catalog: {
    features: number;
    featuresAvailable: number;
    requirements: number | null;
  };
  warnings: SystemWarning[];
}

export function systemWarnings(input: {
  environment: string;
  config: AppConfig;
  migrations: MigrationStatus | null;
  databaseOk: boolean;
  platformAccounts: number;
}): SystemWarning[] {
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
  if (config.superAdminForceReset) {
    warnings.push({
      severity: "warning",
      message: "SUPER_ADMIN_FORCE_RESET is still true. Every restart resets the provider password to SUPER_ADMIN_PASSWORD; unset it now that the rotation is done.",
    });
  }
  if (config.superAdminPassword) {
    warnings.push({
      severity: "info",
      message: "SUPER_ADMIN_PASSWORD is set in the environment. It is only read at first boot or with SUPER_ADMIN_FORCE_RESET; consider removing it once the account exists.",
    });
  }
  if (config.corsOrigins.length > 0) {
    warnings.push({ severity: "info", message: `Cross-site browser origins may call the API: ${config.corsOrigins.join(", ")}.` });
  }
  if (input.platformAccounts <= 1) {
    warnings.push({
      severity: "info",
      message: "Only one provider account exists. A second, rarely used provider account (created by the deployment operator) is the recovery path if this one is locked out.",
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
  extra: { platformAccounts: number; featuresAvailable: number }
): Promise<SystemStatusPayload> {
  const environment = process.env.NODE_ENV ?? "development";

  let databaseOk = false;
  let latencyMs: number | null = null;
  let serverVersion: string | null = null;
  let error: string | null = null;
  let migrations: MigrationStatus | null = null;
  let requirements: number | null = null;
  try {
    const started = performance.now();
    const version = await db.execute(sql`select current_setting('server_version') as v`);
    latencyMs = Math.round((performance.now() - started) * 10) / 10;
    serverVersion = String((version.rows[0] as { v?: string } | undefined)?.v ?? "") || null;
    databaseOk = true;
    migrations = await migrationStatus(db);
    const [row] = await db.select({ n: count() }).from(requirementsTable);
    requirements = row?.n ?? 0;
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
    },
    provider: {
      superAdminEmail: config.superAdminEmail,
      superAdminName: config.superAdminName,
      passwordFromEnvironment: Boolean(config.superAdminPassword),
      forceResetEnabled: config.superAdminForceReset,
      defaultOrgName: config.defaultOrgName,
      defaultOrgSlug: config.defaultOrgSlug,
      platformAccounts: extra.platformAccounts,
    },
    catalog: { features: FEATURE_CATALOG.length, featuresAvailable: extra.featuresAvailable, requirements },
    warnings: systemWarnings({ environment, config, migrations, databaseOk, platformAccounts: extra.platformAccounts }),
  };
}
