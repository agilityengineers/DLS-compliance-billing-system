// The provider's overview: counts, recent activity and a "needs attention"
// list derived from data the platform already holds. Pure functions — the
// route gathers rows, this module decides what they mean, and the unit tests
// pin every rule down without a database.
import { FEATURE_CATALOG, getFeature, type FeatureKey, type FeatureStatus, type OrgRole } from "@workspace/features";
import type { PublicUser } from "./users";

export interface OverviewOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  /** ISO date, when a Business Associate Agreement expiry has been recorded. */
  baaExpiresOn?: string | null;
  baaSignedOn?: string | null;
}

export interface OverviewSession {
  id: string;
  userId: string;
  impersonatingUserId: string | null;
}

export interface OverviewSupportWindow {
  id: string;
  orgId: string;
  expiresAt: string;
}

export interface OverviewJob {
  name: string;
  ok: boolean | null;
  lastRunAt: string | null;
}

export interface OverviewBruteForce {
  userId: string | null;
  fullName: string | null;
  email: string;
  failures: number;
  addresses: number;
}

export type AttentionKind =
  | "support_session_active"
  | "support_window_open"
  | "org_no_admin"
  | "org_admin_not_signed_in"
  | "unused_temporary_passwords"
  | "org_suspended"
  | "single_platform_account"
  | "provider_without_mfa"
  | "sign_in_failures"
  | "baa_expiring"
  | "baa_missing"
  | "job_failing"
  | "job_never_ran"
  | "mail_not_configured"
  | "preview_features_available"
  | "dormant_accounts";

export interface AttentionItem {
  kind: AttentionKind;
  severity: "warning" | "info";
  message: string;
  /** Where the provider goes to deal with it. */
  href: string;
}

export interface PlatformOverviewPayload {
  organizations: { total: number; active: number; suspended: number; decommissioned: number };
  accounts: {
    total: number;
    active: number;
    suspended: number;
    platform: number;
    byRole: Record<OrgRole, number>;
    temporaryPassword: number;
    neverSignedIn: number;
    dormant: number;
    /** Provider accounts with a second factor enrolled, out of `platform`. */
    platformWithMfa: number;
  };
  features: {
    total: number;
    available: number;
    byStatus: Record<FeatureStatus, { total: number; available: number }>;
  };
  sessions: { active: number; supportSessions: number; openSupportWindows: number };
  activity: {
    signInsLast7Days: number;
    failedSignInsLast7Days: number;
    configChangesLast7Days: number;
    supportSessionsLast30Days: number;
  };
  attention: AttentionItem[];
}

export interface OverviewInput {
  organizations: OverviewOrganization[];
  users: PublicUser[];
  /** Tier-1 rows by feature key; missing keys fall back to the catalog default. */
  platformEnabled: ReadonlyMap<string, boolean>;
  activeSessions: OverviewSession[];
  activity: PlatformOverviewPayload["activity"];
  now?: Date;
  openSupportWindows?: OverviewSupportWindow[];
  bruteForce?: OverviewBruteForce[];
  jobs?: OverviewJob[];
  /** False when no mail provider is configured, so invitations are only logged. */
  mailConfigured?: boolean;
  /** Does this deployment insist on a second factor for provider accounts? */
  requireMfaForPlatform?: boolean;
}

/** A one-time password nobody has used for this long is probably lost. */
export const TEMP_PASSWORD_STALE_DAYS = 7;
/** An active account that has not signed in for this long deserves a look. */
export const DORMANT_DAYS = 90;
/** A recorded BAA inside this window is worth chasing. */
export const BAA_WARNING_DAYS = 60;

/** Audit actions that count as "configuration changes" on the overview. */
export const CONFIG_CHANGE_ACTIONS = [
  "platform.feature_toggled",
  "org.created",
  "org.updated",
  "org.decommissioned",
  "org.feature_updated",
  "user.created",
  "user.updated",
  "user.password_reset",
  "user.sessions_revoked",
  "user.invite_sent",
  "session.revoked",
  "support.window_granted",
  "support.window_revoked",
] as const;

const DAY_MS = 86_400_000;

function plural(n: number, word: string, plural_?: string): string {
  return `${n} ${n === 1 ? word : plural_ ?? `${word}s`}`;
}

/** Whole days from `now` to an ISO date. Negative once it is in the past. */
function daysUntil(dateIso: string, now: Date): number {
  const target = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(target)) return Number.NaN;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / DAY_MS);
}

export function buildOverview(input: OverviewInput): PlatformOverviewPayload {
  const now = input.now ?? new Date();
  const { organizations, users, activeSessions } = input;
  const openWindows = input.openSupportWindows ?? [];
  const isAvailable = (key: FeatureKey) => input.platformEnabled.get(key) ?? getFeature(key).launchDefault;

  // ── accounts ────────────────────────────────────────────────────────────
  const platformUsers = users.filter((u) => u.role === "Super_Admin" || u.role === "Platform_Support");
  const byRole: Record<OrgRole, number> = { Admin: 0, Scheduler: 0, Field_Staff: 0 };
  for (const u of users) {
    if (u.role !== "Super_Admin" && u.role !== "Platform_Support") byRole[u.role] += 1;
  }
  const staleTemp = users.filter(
    (u) =>
      u.mustChangePassword &&
      !u.lastLoginAt &&
      now.getTime() - new Date(u.createdAt).getTime() > TEMP_PASSWORD_STALE_DAYS * DAY_MS
  );
  const dormant = users.filter(
    (u) => u.status === "Active" && u.lastLoginAt !== null && now.getTime() - new Date(u.lastLoginAt).getTime() > DORMANT_DAYS * DAY_MS
  );
  const platformWithoutMfa = platformUsers.filter((u) => u.status === "Active" && !u.mfaEnabled);

  // ── features ────────────────────────────────────────────────────────────
  const byStatus: Record<FeatureStatus, { total: number; available: number }> = {
    ready: { total: 0, available: 0 },
    preview: { total: 0, available: 0 },
    in_development: { total: 0, available: 0 },
  };
  let available = 0;
  for (const f of FEATURE_CATALOG) {
    byStatus[f.status].total += 1;
    if (isAvailable(f.key)) {
      available += 1;
      byStatus[f.status].available += 1;
    }
  }

  // ── sessions ────────────────────────────────────────────────────────────
  const supportSessions = activeSessions.filter((s) => s.impersonatingUserId !== null);

  // ── attention ───────────────────────────────────────────────────────────
  const attention: AttentionItem[] = [];
  const nameOf = (id: string) => users.find((u) => u.id === id)?.fullName ?? "an unknown user";
  const orgName = (id: string) => organizations.find((o) => o.id === id)?.name ?? "an organization";

  for (const s of supportSessions) {
    attention.push({
      kind: "support_session_active",
      severity: "warning",
      message: `A support session is in progress: ${nameOf(s.userId)} is viewing as ${nameOf(s.impersonatingUserId!)}.`,
      href: "/admin/platform/support",
    });
  }

  for (const w of openWindows) {
    const minutes = Math.max(0, Math.round((Date.parse(w.expiresAt) - now.getTime()) / 60_000));
    attention.push({
      kind: "support_window_open",
      severity: "info",
      message: `${orgName(w.orgId)} has support access open for another ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      href: "/admin/platform/support",
    });
  }

  if (input.requireMfaForPlatform && platformWithoutMfa.length > 0) {
    attention.push({
      kind: "provider_without_mfa",
      severity: "warning",
      message: `${plural(platformWithoutMfa.length, "provider account")} cannot work until a second factor is enrolled, because this deployment requires one.`,
      href: "/admin/platform/security",
    });
  } else if (platformWithoutMfa.length > 0) {
    attention.push({
      kind: "provider_without_mfa",
      severity: "warning",
      message: `${plural(platformWithoutMfa.length, "provider account")} ${platformWithoutMfa.length === 1 ? "has" : "have"} no second factor. A password alone guards the whole platform.`,
      href: "/admin/platform/security",
    });
  }

  for (const target of input.bruteForce ?? []) {
    attention.push({
      kind: "sign_in_failures",
      severity: "warning",
      message: `${target.fullName ?? target.email} has ${plural(target.failures, "failed sign-in")} from ${plural(target.addresses, "address", "addresses")} in the last day.`,
      href: "/admin/platform/security",
    });
  }

  for (const org of organizations) {
    if (org.status === "decommissioned") continue;
    if (org.status !== "active") {
      attention.push({
        kind: "org_suspended",
        severity: "info",
        message: `${org.name} is suspended; nobody in it can sign in.`,
        href: "/admin/platform/organizations",
      });
      continue;
    }
    const admins = users.filter((u) => u.orgId === org.id && u.role === "Admin");
    if (admins.length === 0) {
      attention.push({
        kind: "org_no_admin",
        severity: "warning",
        message: `${org.name} has no administrator yet, so nobody can run it.`,
        href: "/admin/platform/organizations",
      });
    } else if (admins.every((a) => a.lastLoginAt === null)) {
      attention.push({
        kind: "org_admin_not_signed_in",
        severity: "warning",
        message: `${org.name}'s administrator has never signed in; the hand-over is still pending.`,
        href: "/admin/platform/organizations",
      });
    }

    if (org.baaExpiresOn) {
      const remaining = daysUntil(org.baaExpiresOn, now);
      if (Number.isFinite(remaining) && remaining <= BAA_WARNING_DAYS) {
        attention.push({
          kind: "baa_expiring",
          severity: remaining <= 0 ? "warning" : "info",
          message:
            remaining <= 0
              ? `${org.name}'s Business Associate Agreement lapsed on ${org.baaExpiresOn}.`
              : `${org.name}'s Business Associate Agreement expires in ${plural(remaining, "day")}, on ${org.baaExpiresOn}.`,
          href: "/admin/platform/organizations",
        });
      }
    } else if (!org.baaSignedOn) {
      attention.push({
        kind: "baa_missing",
        severity: "info",
        message: `No Business Associate Agreement is recorded for ${org.name}.`,
        href: "/admin/platform/organizations",
      });
    }
  }

  if (staleTemp.length > 0) {
    attention.push({
      kind: "unused_temporary_passwords",
      severity: "warning",
      message: `${plural(staleTemp.length, "account")} still ${staleTemp.length === 1 ? "holds" : "hold"} a temporary password issued more than ${TEMP_PASSWORD_STALE_DAYS} days ago and never used.`,
      href: "/admin/platform/accounts",
    });
  }

  if (platformUsers.length === 1) {
    attention.push({
      kind: "single_platform_account",
      severity: "warning",
      message:
        "Only one provider account exists. Set SUPER_ADMIN_BREAKGLASS_* in the deployment so a lost password is not a lockout.",
      href: "/admin/platform/system",
    });
  }

  for (const job of input.jobs ?? []) {
    if (job.ok === false) {
      attention.push({
        kind: "job_failing",
        severity: "warning",
        message: `The scheduled job "${job.name}" failed on its last run.`,
        href: "/admin/platform/system",
      });
    } else if (job.lastRunAt === null) {
      attention.push({
        kind: "job_never_ran",
        severity: "info",
        message: `The scheduled job "${job.name}" has never run.`,
        href: "/admin/platform/system",
      });
    }
  }

  if (input.mailConfigured === false) {
    attention.push({
      kind: "mail_not_configured",
      severity: "info",
      message:
        "No mail provider is configured, so invitations and reset links are recorded and logged rather than sent. Hand them over in person until SENDGRID_API_KEY is set.",
      href: "/admin/platform/system",
    });
  }

  const previewAvailable = FEATURE_CATALOG.filter((f) => f.status !== "ready" && isAvailable(f.key)).length;
  if (previewAvailable > 0) {
    attention.push({
      kind: "preview_features_available",
      severity: "info",
      message: `${previewAvailable === 1 ? "1 capability that is" : `${previewAvailable} capabilities that are`} still preview or in development ${previewAvailable === 1 ? "is" : "are"} available to organizations.`,
      href: "/admin/platform/features",
    });
  }

  if (dormant.length > 0) {
    attention.push({
      kind: "dormant_accounts",
      severity: "info",
      message: `${plural(dormant.length, "active account")} ${dormant.length === 1 ? "has" : "have"} not signed in for ${DORMANT_DAYS} days.`,
      href: "/admin/platform/accounts",
    });
  }

  attention.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1));

  return {
    organizations: {
      total: organizations.length,
      active: organizations.filter((o) => o.status === "active").length,
      suspended: organizations.filter((o) => o.status === "suspended").length,
      decommissioned: organizations.filter((o) => o.status === "decommissioned").length,
    },
    accounts: {
      total: users.length,
      active: users.filter((u) => u.status === "Active").length,
      suspended: users.filter((u) => u.status === "Suspended").length,
      platform: platformUsers.length,
      byRole,
      temporaryPassword: users.filter((u) => u.mustChangePassword).length,
      neverSignedIn: users.filter((u) => u.lastLoginAt === null).length,
      dormant: dormant.length,
      platformWithMfa: platformUsers.filter((u) => u.mfaEnabled).length,
    },
    features: { total: FEATURE_CATALOG.length, available, byStatus },
    sessions: {
      active: activeSessions.length,
      supportSessions: supportSessions.length,
      openSupportWindows: openWindows.length,
    },
    activity: input.activity,
    attention,
  };
}
