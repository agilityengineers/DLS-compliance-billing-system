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
}

export interface OverviewSession {
  id: string;
  userId: string;
  impersonatingUserId: string | null;
}

export type AttentionKind =
  | "support_session_active"
  | "org_no_admin"
  | "org_admin_not_signed_in"
  | "unused_temporary_passwords"
  | "org_suspended"
  | "single_platform_account"
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
  organizations: { total: number; active: number; suspended: number };
  accounts: {
    total: number;
    active: number;
    suspended: number;
    platform: number;
    byRole: Record<OrgRole, number>;
    temporaryPassword: number;
    neverSignedIn: number;
    dormant: number;
  };
  features: {
    total: number;
    available: number;
    byStatus: Record<FeatureStatus, { total: number; available: number }>;
  };
  sessions: { active: number; supportSessions: number };
  activity: {
    signInsLast7Days: number;
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
}

/** A one-time password nobody has used for this long is probably lost. */
export const TEMP_PASSWORD_STALE_DAYS = 7;
/** An active account that has not signed in for this long deserves a look. */
export const DORMANT_DAYS = 90;

/** Audit actions that count as "configuration changes" on the overview. */
export const CONFIG_CHANGE_ACTIONS = [
  "platform.feature_toggled",
  "org.created",
  "org.updated",
  "org.feature_updated",
  "user.created",
  "user.updated",
  "user.password_reset",
  "user.sessions_revoked",
  "session.revoked",
] as const;

const DAY_MS = 86_400_000;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function buildOverview(input: OverviewInput): PlatformOverviewPayload {
  const now = input.now ?? new Date();
  const { organizations, users, activeSessions } = input;
  const isAvailable = (key: FeatureKey) => input.platformEnabled.get(key) ?? getFeature(key).launchDefault;

  // ── accounts ────────────────────────────────────────────────────────────
  const platformUsers = users.filter((u) => u.role === "Super_Admin");
  const byRole: Record<OrgRole, number> = { Admin: 0, Scheduler: 0, Field_Staff: 0 };
  for (const u of users) if (u.role !== "Super_Admin") byRole[u.role] += 1;
  const staleTemp = users.filter(
    (u) =>
      u.mustChangePassword &&
      !u.lastLoginAt &&
      now.getTime() - new Date(u.createdAt).getTime() > TEMP_PASSWORD_STALE_DAYS * DAY_MS
  );
  const dormant = users.filter(
    (u) => u.status === "Active" && u.lastLoginAt !== null && now.getTime() - new Date(u.lastLoginAt).getTime() > DORMANT_DAYS * DAY_MS
  );

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

  for (const s of supportSessions) {
    attention.push({
      kind: "support_session_active",
      severity: "warning",
      message: `A support session is in progress: ${nameOf(s.userId)} is viewing as ${nameOf(s.impersonatingUserId!)}.`,
      href: "/admin/platform/support",
    });
  }

  for (const org of organizations) {
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
      severity: "info",
      message: "Only one provider account exists. A second one is your break-glass path if this password is lost.",
      href: "/admin/platform/system",
    });
  }

  const previewAvailable = FEATURE_CATALOG.filter((f) => f.status !== "ready" && isAvailable(f.key)).length;
  if (previewAvailable > 0) {
    attention.push({
      kind: "preview_features_available",
      severity: "info",
      message: `${plural(previewAvailable, "capability")} that ${previewAvailable === 1 ? "is" : "are"} still preview or in development ${previewAvailable === 1 ? "is" : "are"} available to organizations.`.replace("capabilitys", "capabilities"),
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
      suspended: organizations.filter((o) => o.status !== "active").length,
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
    },
    features: { total: FEATURE_CATALOG.length, available, byStatus },
    sessions: { active: activeSessions.length, supportSessions: supportSessions.length },
    activity: input.activity,
    attention,
  };
}
