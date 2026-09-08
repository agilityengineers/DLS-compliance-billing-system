// lib/api/admin.ts — typed calls for the Settings and Platform screens.
"use client";

import type { FeatureKey, FeatureState, Role, RoleGrants } from "@workspace/features";
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
export const platformApi = {
  features: () => apiFetch<{ features: { key: FeatureKey; enabled: boolean; updatedAt: string | null }[] }>("/platform/features"),
  setFeature: (key: FeatureKey, enabled: boolean) =>
    apiFetch<{ key: FeatureKey; enabled: boolean }>(`/platform/features/${key}`, { method: "PUT", json: { enabled } }),
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
  audit: (limit = 50) => apiFetch<{ entries: AuditEntry[] }>(`/platform/audit?limit=${limit}`),
};
