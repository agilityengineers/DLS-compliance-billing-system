// lib/api/admin.ts — typed calls for the Settings and Platform screens.
"use client";

import type { FeatureKey, FeatureState, FeatureStatus, OrgRole as CatalogOrgRole, Role, RoleGrants } from "@workspace/features";
import { ApiClientError, apiFetch } from "@/lib/api/client";

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
  supportWindows: () =>
    apiFetch<{ windows: SupportWindowRow[]; maxHours: number; supportWindowRequired: boolean }>("/org/support-windows"),
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

export type AuditCategory = "auth" | "platform" | "org" | "user" | "session" | "support" | "lead" | "lead_form" | "lead_funnel" | "client" | "billing";

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
    logBodies: boolean;
  };
  scheduler: { enabled: boolean; intervalMinutes: number; externalCronConfigured: boolean };
  provider: {
    superAdminEmail: string;
    superAdminName: string;
    accountExists: boolean;
    passwordPendingChange: boolean;
    passwordFromEnvironment: boolean;
    forceResetEnabled: boolean;
    legacyPasswordAccounts: number;
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
  /** Tier 1 for one organization: true / false override the switchboard for it, null follows the switchboard again. */
  setOrgFeature: (orgId: string, key: FeatureKey, enabled: boolean | null) =>
    apiFetch<{ key: FeatureKey; orgId: string; enabled: boolean | null; state: FeatureState }>(`/platform/organizations/${orgId}/features/${key}`, {
      method: "PUT",
      json: { enabled },
    }),
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
      supportWindowRequired: boolean;
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
  /** Sends a test message to the signed-in provider's own address and reports what the outbox recorded. */
  mailTest: () =>
    apiFetch<{
      status: string;
      id: string | null;
      error: string | null;
      to: string;
      transport: string;
      mode: "sendgrid" | "log";
      linkBase: string | null;
    }>("/platform/mail/test", { method: "POST" }),
};

// ── the signed-in person's own second factor ──────────────────────────────
export const mfaApi = {
  setup: () => apiFetch<{ secret: string; uri: string; issuer: string }>("/auth/totp/setup", { method: "POST" }),
  enable: (code: string) => apiFetch<{ ok: true; recoveryCodes: string[] }>("/auth/totp/enable", { method: "POST", json: { code } }),
  disable: (currentPassword: string) => apiFetch<{ ok: true }>("/auth/totp", { method: "DELETE", json: { currentPassword } }),
  regenerateRecoveryCodes: (currentPassword: string) =>
    apiFetch<{ ok: true; recoveryCodes: string[] }>("/auth/totp/recovery-codes", { method: "POST", json: { currentPassword } }),
};

// ── leads (the inbox) ──────────────────────────────────────────────────────
// Mirrors artifacts/api-server/src/routes/leads.ts and lib/leads.ts. The
// string unions are repeated here rather than imported from @workspace/db so
// the browser bundle never pulls in the ORM.
export type LeadStageKind = "open" | "won" | "lost";
export type LeadQuestionType = "short_text" | "long_text" | "email" | "phone" | "select" | "yes_no";
export type LeadSource = "website" | "manual";
export type LeadClosedReason = "not_a_fit" | "no_response" | "duplicate" | "other";
export type LeadActivityType = "submitted" | "stage_changed" | "assigned" | "note" | "converted";

export const LEAD_CLOSED_REASON_LABELS: Record<LeadClosedReason, string> = {
  not_a_fit: "Not a fit for our services",
  no_response: "No response",
  duplicate: "Duplicate inquiry",
  other: "Other",
};

export interface LeadStage {
  id: string;
  key: string;
  label: string;
  kind: LeadStageKind;
  sortOrder: number;
  isSystem: boolean;
  active: boolean;
}

export interface LeadQuestion {
  id: string;
  key: string;
  label: string;
  helpText: string | null;
  type: LeadQuestionType;
  options: string[];
  required: boolean;
  /** Longest answer the API accepts; null for a checkbox. */
  maxLength?: number | null;
  isSystem: boolean;
  sortOrder: number;
  active: boolean;
}

export interface LeadQuestionSnapshot {
  key: string;
  label: string;
  type: LeadQuestionType;
}

export type LeadAnswers = Record<string, string | boolean | null>;

export interface LeadRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  stageId: string;
  source: LeadSource;
  sourcePage: string | null;
  consentAt: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  closedReason: LeadClosedReason | null;
  convertedClientId: string | null;
  submittedAt: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  answers: LeadAnswers;
  questionSnapshot: LeadQuestionSnapshot[];
}

export interface LeadDetailRow extends LeadRow {
  stage: LeadStage | null;
  convertedClient: { id: string; firstName: string; lastName: string } | null;
}

export interface LeadActivity {
  id: string;
  type: LeadActivityType;
  note: string | null;
  details: Record<string, unknown> | null;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface LeadAssignee {
  id: string;
  fullName: string;
  role: Role;
}

export interface LeadInboxResponse {
  leads: LeadRow[];
  stages: LeadStage[];
  counts: { byStage: Record<string, number>; total: number; unassigned: number };
  assignees: LeadAssignee[];
}

export interface LeadDetailResponse {
  lead: LeadDetailRow;
  activities: LeadActivity[];
  assignees: LeadAssignee[];
}

export type LeadListFilters = {
  /** A stage id or "all". */
  stage?: string;
  /** "me", "unassigned" or a user id. */
  assignee?: string;
  q?: string;
  /** 0 returns counts and stages only. */
  limit?: number;
};

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export interface LeadFormLimits {
  activeQuestions: number;
  options: number;
  activeStages: number;
}

export const leadsApi = {
  list: (filters: LeadListFilters = {}) => apiFetch<LeadInboxResponse>(`/leads${query(filters)}`),
  get: (id: string) => apiFetch<LeadDetailResponse>(`/leads/${id}`),
  create: (input: { firstName: string; lastName: string; email?: string; phone?: string; note?: string }) =>
    apiFetch<LeadDetailResponse>("/leads", { method: "POST", json: input }),
  update: (id: string, patch: { stageId?: string; closedReason?: LeadClosedReason | null; assignedToUserId?: string | null }) =>
    apiFetch<LeadDetailResponse>(`/leads/${id}`, { method: "PATCH", json: patch }),
  addNote: (id: string, note: string) => apiFetch<LeadDetailResponse>(`/leads/${id}/notes`, { method: "POST", json: { note } }),

  /** The website form's questions (Admin only). */
  questions: {
    list: () => apiFetch<{ questions: LeadQuestion[]; limits: LeadFormLimits }>("/leads/config/questions"),
    create: (input: { label: string; helpText?: string; type: LeadQuestionType; options?: string[]; required?: boolean }) =>
      apiFetch<{ question: LeadQuestion }>("/leads/config/questions", { method: "POST", json: input }),
    update: (id: string, patch: { label?: string; helpText?: string | null; options?: string[]; required?: boolean; active?: boolean }) =>
      apiFetch<{ question: LeadQuestion }>(`/leads/config/questions/${id}`, { method: "PATCH", json: patch }),
    remove: (id: string) => apiFetch<{ ok: true; question: LeadQuestion }>(`/leads/config/questions/${id}`, { method: "DELETE" }),
    reorder: (ids: string[]) => apiFetch<{ questions: LeadQuestion[] }>("/leads/config/questions/order", { method: "PUT", json: { ids } }),
  },

  /** The funnel's stages (Admin only). */
  stages: {
    list: () => apiFetch<{ stages: LeadStage[]; counts: Record<string, number>; limits: LeadFormLimits }>("/leads/config/stages"),
    create: (label: string) => apiFetch<{ stage: LeadStage }>("/leads/config/stages", { method: "POST", json: { label } }),
    update: (id: string, patch: { label?: string; active?: boolean }) =>
      apiFetch<{ stage: LeadStage }>(`/leads/config/stages/${id}`, { method: "PATCH", json: patch }),
    remove: (id: string) => apiFetch<{ ok: true }>(`/leads/config/stages/${id}`, { method: "DELETE" }),
    reorder: (ids: string[]) => apiFetch<{ stages: LeadStage[] }>("/leads/config/stages/order", { method: "PUT", json: { ids } }),
  },
};

// ── clients (the real records) ─────────────────────────────────────────────
// Mirrors artifacts/api-server/src/routes/clients.ts. The unions are repeated
// here rather than imported from @workspace/db so the browser bundle never
// pulls in the ORM.
export type ClientStatus = "Active" | "Inactive" | "Interim" | "Discharged" | "Deceased";
export const CLIENT_STATUSES: readonly ClientStatus[] = ["Active", "Inactive", "Interim", "Discharged", "Deceased"];
export type ClientGender = "Male" | "Female" | "Other" | "Unknown";
export const CLIENT_GENDERS: readonly ClientGender[] = ["Male", "Female", "Other", "Unknown"];
export const GUARDIANSHIP_STATUSES = ["Not applicable", "Guardian", "Court appointed"] as const;
export const REP_PAYEE_STATUSES = ["Not applicable", "Rep payee"] as const;
/** The Files category the rep payee paperwork is filed under. */
export const REP_PAYEE_FILE_CATEGORY = "Rep payee paperwork";
export const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Separated", "Widowed", "Other"] as const;
export type ClientContactKind = "responsible_party" | "guardian" | "emergency" | "physician" | "case_manager" | "other";
export const CLIENT_CONTACT_KIND_LABELS: Record<ClientContactKind, string> = {
  responsible_party: "Responsible party",
  guardian: "Guardian",
  emergency: "Emergency contact",
  physician: "Physician",
  case_manager: "Case manager",
  other: "Other",
};
export type PolicyType = "primary" | "secondary" | "tertiary";
export type PolicyStatus = "active" | "inactive";
export type AuthorizationService = "SCC" | "Job_Coaching" | "Day_Habilitation" | "Early_Intervention" | "NMT" | "Other";
export const AUTHORIZATION_SERVICE_LABELS: Record<AuthorizationService, string> = {
  SCC: "SCC",
  Job_Coaching: "Job Coaching",
  Day_Habilitation: "Day Habilitation",
  Early_Intervention: "Early Intervention",
  NMT: "Transportation (NMT)",
  Other: "Other",
};
export type AuthorizationUnitBasis = "unit" | "hour" | "trip" | "dollar";
export const AUTHORIZATION_UNIT_BASIS_LABELS: Record<AuthorizationUnitBasis, string> = {
  unit: "15-minute units",
  hour: "Hours",
  trip: "Trips",
  dollar: "Dollars",
};
export type AuthorizationStatus = "active" | "pending" | "void";

export interface ClientDiagnosis {
  code: string;
  description: string;
  isPrimary?: boolean;
}

export interface ClientRecord {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  phoneCell: string | null;
  phoneWork: string | null;
  medicaidId: string | null;
  dateOfBirth: string | null;
  gender: ClientGender | null;
  genderIdentity: string | null;
  maritalStatus: string | null;
  ethnicity: string | null;
  race: string | null;
  guardianshipStatus: string | null;
  repPayeeStatus: string | null;
  repPayeeName: string | null;
  repPayeeAddress1: string | null;
  repPayeeAddress2: string | null;
  repPayeeCity: string | null;
  repPayeeState: string | null;
  repPayeeZip: string | null;
  repPayeePhone: string | null;
  repPayeeEmail: string | null;
  repPayeeNumber: string | null;
  accountCode: string | null;
  admissionDate: string | null;
  dischargeDate: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  zip: string | null;
  activeDiagnoses: ClientDiagnosis[];
  insuranceProvider: string | null;
  servicePlanStart: string | null;
  servicePlanEnd: string | null;
  authorizedSccHoursPerWeek: number;
  authorizedNmtTripsPerWeek: number;
  authorizedJcHoursPerWeek: number;
  authorizedDhHoursPerWeek: number;
  authorizedEiHoursPerWeek: number;
  caseManagerName: string | null;
  ccbName: string | null;
  residenceLat: number | null;
  residenceLng: number | null;
  allergies: string | null;
  medicalConcerns: string | null;
  supervisionRequirements: string | null;
  generalInformation: string | null;
  hasBehaviorSupportPlan: boolean;
  behaviorSupportPlanNotes: string | null;
  status: ClientStatus;
  /** The inquiry this client was created from, when there was one. */
  sourceLeadId: string | null;
  /** Set on a practice record (a copy of a synthetic demo client); null for a real person. */
  sampleKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Everything intake or an edit may send; "" clears a text field on an edit. */
export interface ClientFieldsInput {
  middleName?: string;
  email?: string;
  phone?: string;
  phoneCell?: string;
  phoneWork?: string;
  medicaidId?: string;
  dateOfBirth?: string;
  gender?: ClientGender | "";
  genderIdentity?: string;
  maritalStatus?: string;
  ethnicity?: string;
  race?: string;
  guardianshipStatus?: string;
  repPayeeStatus?: string;
  repPayeeName?: string;
  repPayeeAddress1?: string;
  repPayeeAddress2?: string;
  repPayeeCity?: string;
  repPayeeState?: string;
  repPayeeZip?: string;
  repPayeePhone?: string;
  repPayeeEmail?: string;
  repPayeeNumber?: string;
  accountCode?: string;
  admissionDate?: string;
  dischargeDate?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  county?: string;
  zip?: string;
  activeDiagnoses?: ClientDiagnosis[];
  insuranceProvider?: string;
  servicePlanStart?: string;
  servicePlanEnd?: string;
  authorizedSccHoursPerWeek?: number;
  authorizedNmtTripsPerWeek?: number;
  authorizedJcHoursPerWeek?: number;
  authorizedDhHoursPerWeek?: number;
  authorizedEiHoursPerWeek?: number;
  caseManagerName?: string;
  ccbName?: string;
  residenceLat?: number | null;
  residenceLng?: number | null;
  allergies?: string;
  medicalConcerns?: string;
  supervisionRequirements?: string;
  generalInformation?: string;
  hasBehaviorSupportPlan?: boolean;
  behaviorSupportPlanNotes?: string;
}

export interface ClientCreateInput extends ClientFieldsInput {
  firstName: string;
  lastName: string;
  /** The inquiry this client comes from; the API converts it in the same write. */
  sourceLeadId?: string;
  /** Copy a synthetic demo client (by its id) as a PRACTICE record. Idempotent. */
  sampleKey?: string;
}

export interface ClientPatchInput extends ClientFieldsInput {
  firstName?: string;
  lastName?: string;
  /** Admin only. */
  status?: ClientStatus;
}

export interface ClientContact {
  id: string;
  clientId: string;
  kind: ClientContactKind;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  npi: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientContactInput {
  kind: ClientContactKind;
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  npi?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface ClientPolicy {
  id: string;
  clientId: string;
  policyType: PolicyType;
  payerName: string;
  memberId: string | null;
  groupNumber: string | null;
  status: PolicyStatus;
  startDate: string | null;
  endDate: string | null;
  policyHolderName: string | null;
  policyHolderRelationship: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientPolicyInput {
  policyType?: PolicyType;
  payerName: string;
  memberId?: string;
  groupNumber?: string;
  status?: PolicyStatus;
  startDate?: string;
  endDate?: string;
  policyHolderName?: string;
  policyHolderRelationship?: string;
  notes?: string;
}

export interface ClientAuthorization {
  id: string;
  clientId: string;
  authNumber: string | null;
  payerName: string | null;
  service: AuthorizationService;
  billingCode: string | null;
  startDate: string;
  endDate: string;
  approvedUnits: number;
  unitBasis: AuthorizationUnitBasis;
  weeklyCapUnits: number | null;
  ratePerUnit: number | null;
  status: AuthorizationStatus;
  permitOverBudget: boolean;
  excludeFromSubmission: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientAuthorizationInput {
  authNumber?: string;
  payerName?: string;
  service: AuthorizationService;
  billingCode?: string;
  startDate: string;
  endDate: string;
  approvedUnits: number;
  unitBasis?: AuthorizationUnitBasis;
  weeklyCapUnits?: number | null;
  ratePerUnit?: number | null;
  status?: AuthorizationStatus;
  permitOverBudget?: boolean;
  excludeFromSubmission?: boolean;
  notes?: string;
}

export interface ClientFile {
  id: string;
  clientId: string;
  category: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  uploadedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFilesResponse {
  files: ClientFile[];
  categories: string[];
  maxBytes: number;
  contentTypes: string[];
}

export interface ClientFileMeta {
  fileName: string;
  category: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export const clientsApi = {
  list: (filters: { status?: ClientStatus } = {}) => apiFetch<{ clients: ClientRecord[] }>(`/clients${query(filters)}`),
  get: (id: string) => apiFetch<{ client: ClientRecord }>(`/clients/${id}`),
  create: (input: ClientCreateInput) =>
    apiFetch<{ client: ClientRecord; convertedLeadId: string | null }>("/clients", { method: "POST", json: input }),
  update: (id: string, patch: ClientPatchInput) => apiFetch<{ client: ClientRecord }>(`/clients/${id}`, { method: "PATCH", json: patch }),

  contacts: {
    list: (clientId: string) => apiFetch<{ contacts: ClientContact[] }>(`/clients/${clientId}/contacts`),
    create: (clientId: string, input: ClientContactInput) =>
      apiFetch<{ contact: ClientContact }>(`/clients/${clientId}/contacts`, { method: "POST", json: input }),
    update: (clientId: string, id: string, patch: Partial<ClientContactInput>) =>
      apiFetch<{ contact: ClientContact }>(`/clients/${clientId}/contacts/${id}`, { method: "PATCH", json: patch }),
    remove: (clientId: string, id: string) => apiFetch<{ ok: true }>(`/clients/${clientId}/contacts/${id}`, { method: "DELETE" }),
  },

  policies: {
    list: (clientId: string) => apiFetch<{ policies: ClientPolicy[] }>(`/clients/${clientId}/policies`),
    create: (clientId: string, input: ClientPolicyInput) =>
      apiFetch<{ policy: ClientPolicy }>(`/clients/${clientId}/policies`, { method: "POST", json: input }),
    update: (clientId: string, id: string, patch: Partial<ClientPolicyInput>) =>
      apiFetch<{ policy: ClientPolicy }>(`/clients/${clientId}/policies/${id}`, { method: "PATCH", json: patch }),
    remove: (clientId: string, id: string) => apiFetch<{ ok: true }>(`/clients/${clientId}/policies/${id}`, { method: "DELETE" }),
  },

  authorizations: {
    list: (clientId: string) => apiFetch<{ authorizations: ClientAuthorization[] }>(`/clients/${clientId}/authorizations`),
    create: (clientId: string, input: ClientAuthorizationInput) =>
      apiFetch<{ authorization: ClientAuthorization }>(`/clients/${clientId}/authorizations`, { method: "POST", json: input }),
    update: (clientId: string, id: string, patch: Partial<ClientAuthorizationInput>) =>
      apiFetch<{ authorization: ClientAuthorization }>(`/clients/${clientId}/authorizations/${id}`, { method: "PATCH", json: patch }),
    remove: (clientId: string, id: string) => apiFetch<{ ok: true }>(`/clients/${clientId}/authorizations/${id}`, { method: "DELETE" }),
  },

  files: {
    list: (clientId: string) => apiFetch<ClientFilesResponse>(`/clients/${clientId}/files`),
    /** The bytes go as the body and the record as the query string; see the API route. */
    upload: async (clientId: string, file: File, meta: ClientFileMeta): Promise<{ file: ClientFile }> => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(meta)) if (value !== undefined && value !== "") params.set(key, String(value));
      const res = await fetch(`/api/clients/${clientId}/files?${params}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": file.type || "application/octet-stream", accept: "application/json" },
        body: file,
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
        throw new ApiClientError(res.status, err?.code ?? "SERVER_ERROR", err?.message ?? (res.status === 413 ? "That file is too large." : `Upload failed (${res.status}).`));
      }
      return body as { file: ClientFile };
    },
    update: (clientId: string, id: string, patch: Partial<ClientFileMeta>) =>
      apiFetch<{ file: ClientFile }>(`/clients/${clientId}/files/${id}`, { method: "PATCH", json: patch }),
    remove: (clientId: string, id: string) => apiFetch<{ ok: true }>(`/clients/${clientId}/files/${id}`, { method: "DELETE" }),
    /** A download, so it goes through the browser rather than fetch. */
    contentUrl: (clientId: string, id: string) => `/api/clients/${clientId}/files/${id}/content`,
  },
};

// ── billing: payers, the fee schedule, the claim ledger ────────────────────
// Mirrors artifacts/api-server/src/routes/billing.ts.
export type PayerKind = "medicaid" | "dvr" | "private" | "other";
export const PAYER_KIND_LABELS: Record<PayerKind, string> = { medicaid: "Medicaid", dvr: "DVR", private: "Private pay", other: "Other" };
export type ClaimFilingCode = "MC" | "CI" | "OF" | "11";
export const CLAIM_FILING_LABELS: Record<ClaimFilingCode, string> = { MC: "MC — Medicaid", CI: "CI — Commercial insurance", OF: "OF — Other federal program", "11": "11 — Other non-federal program" };
export type BillingService = "SCC" | "Job_Coaching" | "Day_Habilitation" | "Early_Intervention" | "NMT" | "Other";
export const BILLING_SERVICE_LABELS: Record<BillingService, string> = {
  SCC: "SCC",
  Job_Coaching: "Job Coaching",
  Day_Habilitation: "Day Habilitation",
  Early_Intervention: "Early Intervention",
  NMT: "Transportation (NMT)",
  Other: "Other",
};
export type BillingUnit = "15_min" | "hour" | "day" | "trip" | "each";
export const BILLING_UNIT_LABELS: Record<BillingUnit, string> = { "15_min": "15 minutes", hour: "Hour", day: "Day", trip: "Trip", each: "Each" };
export type SubmissionStatus = "open" | "submitted" | "accepted" | "rejected" | "paid" | "denied" | "voided";

export interface Payer {
  id: string;
  name: string;
  kind: PayerKind;
  payerId: string | null;
  claimFilingCode: ClaimFilingCode;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayerInput {
  name: string;
  kind?: PayerKind;
  payerId?: string;
  claimFilingCode?: ClaimFilingCode;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  notes?: string;
  active?: boolean;
}

export interface BillingCode {
  id: string;
  payerId: string | null;
  code: string;
  modifier1: string | null;
  modifier2: string | null;
  modifier3: string | null;
  modifier4: string | null;
  description: string;
  service: BillingService;
  billingUnit: BillingUnit;
  ratePerUnit: number;
  effectiveDate: string;
  endDate: string | null;
  evvCode: string | null;
  allowZeroUnits: boolean;
  archived: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingCodeInput {
  payerId?: string | null;
  code: string;
  modifier1?: string;
  modifier2?: string;
  modifier3?: string;
  modifier4?: string;
  description: string;
  service: BillingService;
  billingUnit?: BillingUnit;
  ratePerUnit: number;
  effectiveDate: string;
  endDate?: string;
  evvCode?: string;
  allowZeroUnits?: boolean;
  archived?: boolean;
  notes?: string;
}

export interface ClaimSubmission {
  id: string;
  controlNumber: number;
  payerId: string | null;
  payerKey: string;
  format: string;
  testMode: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  noteIds: string[];
  noteCount: number;
  totalUnits: number;
  totalCharge: number;
  status: SubmissionStatus;
  statusNote: string | null;
  fileName: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const billingApi = {
  payers: {
    list: () => apiFetch<{ payers: Payer[] }>("/billing/payers"),
    create: (input: PayerInput) => apiFetch<{ payer: Payer }>("/billing/payers", { method: "POST", json: input }),
    update: (id: string, patch: Partial<PayerInput>) => apiFetch<{ payer: Payer }>(`/billing/payers/${id}`, { method: "PATCH", json: patch }),
    remove: (id: string) => apiFetch<{ ok: true }>(`/billing/payers/${id}`, { method: "DELETE" }),
  },
  codes: {
    list: (opts: { archived?: boolean } = {}) => apiFetch<{ codes: BillingCode[] }>(`/billing/codes${opts.archived ? "?archived=true" : ""}`),
    create: (input: BillingCodeInput) => apiFetch<{ code: BillingCode }>("/billing/codes", { method: "POST", json: input }),
    update: (id: string, patch: Partial<BillingCodeInput>) => apiFetch<{ code: BillingCode }>(`/billing/codes/${id}`, { method: "PATCH", json: patch }),
    duplicate: (id: string) => apiFetch<{ code: BillingCode }>(`/billing/codes/${id}/duplicate`, { method: "POST" }),
    remove: (id: string) => apiFetch<{ ok: true }>(`/billing/codes/${id}`, { method: "DELETE" }),
  },
  submissions: {
    list: (limit = 100) => apiFetch<{ submissions: ClaimSubmission[] }>(`/billing/submissions?limit=${limit}`),
    open: (input: { noteIds: string[]; totalUnits: number; totalCharge: number; payerKey: string; payerId?: string | null; testMode?: boolean; periodStart?: string; periodEnd?: string }) =>
      apiFetch<{ submission: ClaimSubmission }>("/billing/submissions", { method: "POST", json: input }),
    finalize: (id: string, input: { fileContent: string; fileName: string }) =>
      apiFetch<{ submission: ClaimSubmission }>(`/billing/submissions/${id}/finalize`, { method: "POST", json: input }),
    discard: (id: string) => apiFetch<{ ok: true }>(`/billing/submissions/${id}`, { method: "DELETE" }),
    setStatus: (id: string, status: Exclude<SubmissionStatus, "open">, statusNote?: string) =>
      apiFetch<{ submission: ClaimSubmission }>(`/billing/submissions/${id}`, { method: "PATCH", json: { status, statusNote } }),
    /** A download, so it goes through the browser rather than fetch. */
    fileUrl: (id: string) => `/api/billing/submissions/${id}/file`,
  },
};

// ── public website news feeds (Super Admin) ────────────────────────────────
export interface WebsiteFeedRow {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  lastItemCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteFeedBlockRow {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  feedIds: string[];
  maxItems: number;
  layout: "grid" | "list";
  showImages: boolean;
  showSummaries: boolean;
  pages: string[];
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteFeedItem {
  title: string;
  link: string;
  date: string | null;
  summary: string;
  image: string | null;
}

export type WebsiteFeedBlockInput = Omit<WebsiteFeedBlockRow, "id" | "createdAt" | "updatedAt">;

export const websiteApi = {
  state: () =>
    apiFetch<{ feeds: WebsiteFeedRow[]; blocks: WebsiteFeedBlockRow[]; pages: { page: string; label: string }[] }>("/platform/website"),
  preview: (url: string) =>
    apiFetch<{ url: string; title: string; items: WebsiteFeedItem[] }>("/platform/website/feeds/preview", { method: "POST", json: { url } }),
  addFeed: (input: { name: string; url: string; enabled?: boolean }) =>
    apiFetch<{ feed: WebsiteFeedRow }>("/platform/website/feeds", { method: "POST", json: input }),
  updateFeed: (id: string, patch: { name?: string; url?: string; enabled?: boolean }) =>
    apiFetch<{ feed: WebsiteFeedRow }>(`/platform/website/feeds/${id}`, { method: "PATCH", json: patch }),
  refreshFeed: (id: string) =>
    apiFetch<{ feed: WebsiteFeedRow; items: WebsiteFeedItem[] }>(`/platform/website/feeds/${id}/refresh`, { method: "POST" }),
  removeFeed: (id: string) => apiFetch<{ ok: true }>(`/platform/website/feeds/${id}`, { method: "DELETE" }),
  addBlock: (input: WebsiteFeedBlockInput) =>
    apiFetch<{ block: WebsiteFeedBlockRow }>("/platform/website/blocks", { method: "POST", json: input }),
  updateBlock: (id: string, patch: Partial<WebsiteFeedBlockInput>) =>
    apiFetch<{ block: WebsiteFeedBlockRow }>(`/platform/website/blocks/${id}`, { method: "PATCH", json: patch }),
  removeBlock: (id: string) => apiFetch<{ ok: true }>(`/platform/website/blocks/${id}`, { method: "DELETE" }),
};
