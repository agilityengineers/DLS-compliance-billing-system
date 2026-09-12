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
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  users: AccountRow[];
  featuresConfigured: number;
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
    apiFetch<{ user: AccountRow; temporaryPassword: string | null }>("/org/users", { method: "POST", json: input }),
  updateUser: (id: string, patch: { fullName?: string; role?: OrgRole; status?: "Active" | "Suspended" }) =>
    apiFetch<{ user: AccountRow }>(`/org/users/${id}`, { method: "PATCH", json: patch }),
  resetPassword: (id: string, password?: string) =>
    apiFetch<{ temporaryPassword: string | null }>(`/org/users/${id}/reset-password`, { method: "POST", json: password ? { password } : {} }),
  audit: (limit = 50) => apiFetch<{ entries: AuditEntry[] }>(`/org/audit?limit=${limit}`),
};

// ── platform (Super Admin) ─────────────────────────────────────────────────
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
  href: string;
}

export interface PlatformOverview {
  organizations: { total: number; active: number; suspended: number };
  accounts: {
    total: number;
    active: number;
    suspended: number;
    platform: number;
    byRole: Record<CatalogOrgRole, number>;
    temporaryPassword: number;
    neverSignedIn: number;
    dormant: number;
  };
  features: { total: number; available: number; byStatus: Record<FeatureStatus, { total: number; available: number }> };
  sessions: { active: number; supportSessions: number };
  activity: { signInsLast7Days: number; configChangesLast7Days: number; supportSessionsLast30Days: number };
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

export type AuditCategory = "auth" | "platform" | "org" | "user" | "session";

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
  updateOrganization: (id: string, patch: { name?: string; status?: "active" | "suspended" }) =>
    apiFetch<{ organization: { id: string; name: string; slug: string; status: string } }>(`/platform/organizations/${id}`, { method: "PATCH", json: patch }),
  createUser: (input: { orgId: string; email: string; fullName: string; role: OrgRole; password?: string }) =>
    apiFetch<{ user: AccountRow; temporaryPassword: string | null }>("/platform/users", { method: "POST", json: input }),
  updateUser: (id: string, patch: { fullName?: string; role?: OrgRole; status?: "Active" | "Suspended" }) =>
    apiFetch<{ user: AccountRow }>(`/platform/users/${id}`, { method: "PATCH", json: patch }),
  resetPassword: (id: string, password?: string) =>
    apiFetch<{ temporaryPassword: string | null }>(`/platform/users/${id}/reset-password`, { method: "POST", json: password ? { password } : {} }),
  /** Sign one person out on every device. */
  revokeUserSessions: (id: string) => apiFetch<{ ok: true; revoked: number }>(`/platform/users/${id}/sessions`, { method: "DELETE" }),
  sessions: () => apiFetch<{ sessions: PlatformSessionRow[] }>("/platform/sessions"),
  revokeSession: (id: string) => apiFetch<{ ok: true }>(`/platform/sessions/${id}`, { method: "DELETE" }),
  audit: (opts: number | AuditFilters = 50) => apiFetch<{ entries: AuditEntry[] }>(`/platform/audit${auditQuery(opts)}`),
  system: () => apiFetch<SystemStatus>("/platform/system"),
};
