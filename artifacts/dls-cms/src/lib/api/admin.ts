// lib/api/admin.ts — typed calls for the Settings and Platform screens.
"use client";

import type { FeatureKey, FeatureState, FeatureStatus, OrgRole as CatalogOrgRole, Role, RoleGrants } from "@workspace/features";
import { apiFetch } from "@/lib/api/client";

export interface AccountRow {
  id: string;
  orgId: string | null;
  email: string;
  fullName: string;
  role: Role;
  status: "Active" | "Suspended";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Has this person enrolled a second factor? */
  mfaEnabled?: boolean;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  /** active · suspended · decommissioned */
  status: string;
  createdAt: string;
  users: AccountRow[];
  featuresConfigured: number;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  timeZone?: string;
  baaSignedOn?: string | null;
  baaExpiresOn?: string | null;
  contractNotes?: string | null;
  decommissionedAt?: string | null;
  decommissionReason?: string | null;
}

export interface OrganizationPatch {
  name?: string;
  status?: "active" | "suspended";
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  timeZone?: string;
  baaSignedOn?: string | null;
  baaExpiresOn?: string | null;
  contractNotes?: string | null;
}

export interface InviteResult {
  sentTo: string;
  expiresAt: string;
  status: string;
}

export interface SupportWindowRow {
  id: string;
  orgId: string;
  orgName: string | null;
  grantedByUserId: string;
  grantedByName: string | null;
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  createdAt: string;
  active: boolean;
}

export interface SignInFailure {
  userId: string | null;
  email: string;
  fullName: string | null;
  failures: number;
  lastAttemptAt: string;
  addresses: number;
}

export interface JobStatusRow {
  name: string;
  description: string;
  everyMinutes: number;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    ok: boolean | null;
    itemsProcessed: number;
    detail: string | null;
    trigger: string;
  } | null;
}

export interface MailOutboxRow {
  id: string;
  kind: string;
  sender: string;
  recipient: string;
  subject: string;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface AuditVerification {
  ok: boolean;
  checked: number;
  firstBadSeq: number | null;
  firstBadId: string | null;
  lastSeq: number | null;
  lastHash: string | null;
  retentionYears: number;
}

export interface AuditEntry {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  impersonatingUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  actorName: string | null;
  impersonatingName: string | null;
  /** Platform audit only — the organization the entry belongs to. */
  orgName?: string | null;
}

export type OrgRole = Exclude<Role, "Super_Admin">;

// ── organization (Admin) ───────────────────────────────────────────────────
export const orgApi = {
  features: () => apiFetch<{ features: FeatureState[] }>("/org/features"),
  setFeature: (key: FeatureKey, patch: { enabled?: boolean; roles?: RoleGrants }) =>
    apiFetch<{ key: FeatureKey; platformEnabled: boolean; orgEnabled: boolean; roles: RoleGrants }>(`/org/features/${key}`, {
      method: "PUT",
      json: patch,
    }),
  users: () => apiFetch<{ users: AccountRow[] }>("/org/users"),
  createUser: (input: { email: string; fullName: string; role: OrgRole; password?: string }) =>
    apiFetch<{ user: AccountRow; temporaryPassword: string | null; invite: InviteResult | null }>("/org/users", {
      method: "POST",
      json: input,
    }),
  updateUser: (id: string, patch: { fullName?: string; role?: OrgRole; status?: "Active" | "Suspended" }) =>
    apiFetch<{ user: AccountRow }>(`/org/users/${id}`, { method: "PATCH", json: patch }),
  resetPassword: (id: string, password?: string) =>
    apiFetch<{ temporaryPassword: string | null }>(`/org/users/${id}/reset-password`, { method: "POST", json: password ? { password } : {} }),
  audit: (limit = 50) => apiFetch<{ entries: AuditEntry[] }>(`/org/audit?limit=${limit}`),
  resendInvite: (id: string) => apiFetch<{ invite: InviteResult }>(`/org/users/${id}/resend-invite`, { method: "POST" }),
  supportWindows: () => apiFetch<{ windows: SupportWindowRow[]; maxHours: number }>("/org/support-windows"),
  grantSupportWindow: (input: { reason: string; hours: number }) =>
    apiFetch<{ window: { id: string; expiresAt: string; hours: number } }>("/org/support-windows", {
      method: "POST",
      json: input,
    }),
  revokeSupportWindow: (id: string) => apiFetch<{ ok: true }>(`/org/support-windows/${id}`, { method: "DELETE" }),
};

// ── platform (Super Admin) ─────────────────────────────────────────────────
export type AttentionKind =
  | "support_session_active"
  | "support_window_open"
  | "provider_without_mfa"
  | "sign_in_failures"
  | "baa_expiring"
  | "baa_missing"
  | "job_failing"
  | "job_never_ran"
  | "mail_not_configured"
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
  href: string;
}

export interface PlatformOverview {
  organizations: { total: number; active: number; suspended: number; decommissioned: number };
  accounts: {
    total: number;
    active: number;
    suspended: number;
    platform: number;
    byRole: Record<CatalogOrgRole, number>;
    temporaryPassword: number;
    neverSignedIn: number;
    dormant: number;
    platformWithMfa: number;
  };
  features: { total: number; available: number; byStatus: Record<FeatureStatus, { total: number; available: number }> };
  sessions: { active: number; supportSessions: number; openSupportWindows: number };
  activity: {
    signInsLast7Days: number;
    failedSignInsLast7Days: number;
    configChangesLast7Days: number;
    supportSessionsLast30Days: number;
  };
  attention: AttentionItem[];
}

export interface OrgAdoptionRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  features: FeatureState[];
}

export interface PlatformSessionRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: Role;
  orgId: string | null;
  orgName: string | null;
  impersonatingUserId: string | null;
  impersonatingName: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  /** The session making this request. */
  current: boolean;
}

export type AuditCategory = "auth" | "platform" | "org" | "user" | "session" | "support";

export interface AuditFilters {
  limit?: number;
  category?: AuditCategory;
  /** One action, or several separated by commas. */
  action?: string;
  orgId?: string;
  actorUserId?: string;
  /** ISO date or date-time. */
  since?: string;
}

export interface MigrationStatus {
  total: number;
  applied: number;
  pending: string[];
  latestApplied: { tag: string; authoredAt: string } | null;
}

export interface SystemStatus {
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
    limiterBackedBy: string;
    attemptRetentionDays: number;
  };
  security: {
    requireMfaForPlatform: boolean;
    mfaIssuer: string;
    providerAccounts: number;
    providerAccountsWithMfa: number;
    breakGlassConfigured: boolean;
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
  };
  scheduler: { enabled: boolean; intervalMinutes: number; externalCronConfigured: boolean };
  provider: {
    superAdminEmail: string;
    superAdminName: string;
    passwordFromEnvironment: boolean;
    forceResetEnabled: boolean;
    defaultOrgName: string;
    defaultOrgSlug: string;
    platformAccounts: number;
  };
  catalog: { features: number; featuresAvailable: number; requirements: number | null };
  warnings: { severity: "warning" | "info"; message: string }[];
}

function auditQuery(opts: number | AuditFilters): string {
  const filters: AuditFilters = typeof opts === "number" ? { limit: opts } : opts;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const platformApi = {
  overview: () => apiFetch<PlatformOverview>("/platform/overview"),
  features: () => apiFetch<{ features: { key: FeatureKey; enabled: boolean; updatedAt: string | null }[] }>("/platform/features"),
  setFeature: (key: FeatureKey, enabled: boolean) =>
    apiFetch<{ key: FeatureKey; enabled: boolean }>(`/platform/features/${key}`, { method: "PUT", json: { enabled } }),
  adoption: () => apiFetch<{ organizations: OrgAdoptionRow[] }>("/platform/adoption"),
  organizations: () => apiFetch<{ organizations: OrganizationRow[]; platformUsers: AccountRow[] }>("/platform/organizations"),
  createOrganization: (input: { name: string; slug?: string }) =>
    apiFetch<{ organization: { id: string; name: string; slug: string; status: string } }>("/platform/organizations", { method: "POST", json: input }),
  updateOrganization: (id: string, patch: OrganizationPatch) =>
    apiFetch<{ organization: { id: string; name: string; slug: string; status: string } }>(`/platform/organizations/${id}`, { method: "PATCH", json: patch }),
  decommissionOrganization: (id: string, input: { confirmSlug: string; reason: string }) =>
    apiFetch<{ ok: true; accountsSuspended: number }>(`/platform/organizations/${id}/decommission`, { method: "POST", json: input }),
  /** The export is a download, so it goes through the browser rather than fetch. */
  organizationExportUrl: (id: string) => `/api/platform/organizations/${id}/export`,
  createUser: (input: { orgId: string; email: string; fullName: string; role: OrgRole; password?: string }) =>
    apiFetch<{ user: AccountRow; temporaryPassword: string | null; invite: InviteResult | null }>("/platform/users", {
      method: "POST",
      json: input,
    }),
  updateUser: (id: string, patch: { fullName?: string; role?: OrgRole; status?: "Active" | "Suspended" }) =>
    apiFetch<{ user: AccountRow }>(`/platform/users/${id}`, { method: "PATCH", json: patch }),
  resetPassword: (id: string, password?: string) =>
    apiFetch<{ temporaryPassword: string | null }>(`/platform/users/${id}/reset-password`, { method: "POST", json: password ? { password } : {} }),
  /** Sign one person out on every device. */
  revokeUserSessions: (id: string) => apiFetch<{ ok: true; revoked: number }>(`/platform/users/${id}/sessions`, { method: "DELETE" }),
  sessions: () => apiFetch<{ sessions: PlatformSessionRow[] }>("/platform/sessions"),
  revokeSession: (id: string) => apiFetch<{ ok: true }>(`/platform/sessions/${id}`, { method: "DELETE" }),
  audit: (opts: number | AuditFilters = 50) =>
    apiFetch<{ entries: AuditEntry[]; retentionYears: number }>(`/platform/audit${auditQuery(opts)}`),
  verifyAudit: () => apiFetch<AuditVerification>("/platform/audit/verify"),
  auditExportUrl: (opts: AuditFilters = {}) => `/api/platform/audit/export${auditQuery(opts)}`,
  system: () => apiFetch<SystemStatus>("/platform/system"),

  // ── security ────────────────────────────────────────────────────────────
  security: () =>
    apiFetch<{
      providerAccounts: AccountRow[];
      requireMfaForPlatform: boolean;
      breakGlassConfigured: boolean;
      supportWindows: SupportWindowRow[];
      supportWindowMaxHours: number;
      signInFailures: SignInFailure[];
    }>("/platform/security"),
  createProviderUser: (input: { email: string; fullName: string; password?: string }) =>
    apiFetch<{ user: AccountRow; temporaryPassword: string | null }>("/platform/provider-users", {
      method: "POST",
      json: input,
    }),
  supportWindows: () => apiFetch<{ windows: SupportWindowRow[]; maxHours: number }>("/platform/support-windows"),
  requestSupportWindow: (input: { orgId: string; reason: string }) =>
    apiFetch<{ ok: true; adminsNotified: number; mailConfigured: boolean }>("/platform/support-windows/request", {
      method: "POST",
      json: input,
    }),
  resendInvite: (id: string) => apiFetch<{ invite: InviteResult }>(`/platform/users/${id}/resend-invite`, { method: "POST" }),

  // ── operations ──────────────────────────────────────────────────────────
  jobs: () =>
    apiFetch<{ jobs: JobStatusRow[]; schedulerEnabled: boolean; intervalMinutes: number; externalCronConfigured: boolean }>(
      "/platform/jobs"
    ),
  runJob: (name: string) =>
    apiFetch<{ name: string; ran: boolean; ok?: boolean; items?: number; detail?: string; skipped?: string }>(
      `/platform/jobs/${name}/run`,
      { method: "POST" }
    ),
  mail: (limit = 50) =>
    apiFetch<{ messages: MailOutboxRow[]; mode: string; fromDomain: string }>(`/platform/mail?limit=${limit}`),
};

// ── the signed-in person's own second factor ──────────────────────────────
export const mfaApi = {
  setup: () => apiFetch<{ secret: string; uri: string; issuer: string }>("/auth/totp/setup", { method: "POST" }),
  enable: (code: string) => apiFetch<{ ok: true; recoveryCodes: string[] }>("/auth/totp/enable", { method: "POST", json: { code } }),
  disable: (currentPassword: string) => apiFetch<{ ok: true }>("/auth/totp", { method: "DELETE", json: { currentPassword } }),
  regenerateRecoveryCodes: (currentPassword: string) =>
    apiFetch<{ ok: true; recoveryCodes: string[] }>("/auth/totp/recovery-codes", { method: "POST", json: { currentPassword } }),
};
