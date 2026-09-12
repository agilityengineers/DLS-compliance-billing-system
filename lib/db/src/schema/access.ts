// Access model: organizations → users (accounts) → sessions, plus the
// two-tier feature switches and a configuration audit log.
//
//   platform_features  tier 1 — provider (Super Admin) makes a feature available
//   org_features       tier 2 — the org's Admin turns it on and grants roles
//
// Domain data (clients, visits, notes …) is NOT here yet: the web app still
// serves synthetic demo records for those. This schema is the real identity
// and configuration store that the demo data hangs off.
import { bigserial, boolean, date, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const organizationsTable = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /**
   * active | suspended | decommissioned
   *
   * `suspended` is a pause: nobody can sign in, and one click undoes it.
   * `decommissioned` is the end of the relationship — it also suspends every
   * account in the organization and is meant to be preceded by an export.
   */
  status: text("status").notNull().default("active"),

  // ── The commercial relationship ─────────────────────────────────────────
  // A tenant is not only a row of switches: somebody signed something, and
  // somebody answers the phone. Without these the provider has to keep the
  // contract in their head, and a lapsed Business Associate Agreement is
  // invisible until it matters.
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
  /** IANA zone the organization's day is measured in (see @workspace/time). */
  timeZone: text("time_zone").notNull().default("America/Denver"),
  /** Business Associate Agreement: when it was signed, and when it lapses. */
  baaSignedOn: date("baa_signed_on"),
  baaExpiresOn: date("baa_expires_on"),
  contractNotes: text("contract_notes"),

  decommissionedAt: timestamp("decommissioned_at", { withTimezone: true }),
  decommissionReason: text("decommission_reason"),
  ...timestamps,
});

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL only for platform accounts (Super_Admin). */
    orgId: uuid("org_id").references(() => organizationsTable.id, { onDelete: "restrict" }),
    /** Stored lower-cased and trimmed; unique across the platform. */
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    /** Super_Admin | Admin | Scheduler | Field_Staff */
    role: text("role").notNull(),
    /** Active | Suspended */
    status: text("status").notNull().default("Active"),
    /** scrypt hash — see artifacts/api-server/src/lib/password.ts */
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdBy: uuid("created_by"),

    // ── Second factor (RFC 6238 TOTP) ───────────────────────────────────────
    // A password alone is one lost sticky note away from the master key. The
    // shared secret is base32 and readable by the API server by necessity —
    // verifying a code means recomputing it — so it is protected by the
    // database's own at-rest encryption, not by the application. Treat a
    // database dump as equivalent to the second factor and rotate on one.
    totpSecret: text("totp_secret"),
    /** Enrolment is only complete once a code has been proven. */
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    /** Highest time step already accepted — stops a replayed code. */
    totpLastStep: text("totp_last_step"),
    /** Single-use recovery codes: [{ hash, usedAt }]. Hashes only. */
    totpRecoveryCodes: jsonb("totp_recovery_codes").$type<{ hash: string; usedAt: string | null }[]>(),
    ...timestamps,
  },
  (t) => [index("idx_users_org_id").on(t.orgId), index("idx_users_role").on(t.role)]
);

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sha256 of the cookie token — the raw token never touches the database. */
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** "View as" target. The real identity (user_id) stays the audit identity. */
    impersonatingUserId: uuid("impersonating_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("idx_sessions_user_id").on(t.userId)]
);

export const platformFeaturesTable = pgTable("platform_features", {
  /** A FeatureKey from @workspace/features. */
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgFeaturesTable = pgTable(
  "org_features",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull(),
    /** { Scheduler?: boolean; Field_Staff?: boolean } */
    roles: jsonb("roles").$type<Record<string, boolean>>().notNull().default({}),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] })]
);

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id"),
    /** The REAL identity that acted (never the impersonated one). */
    actorUserId: uuid("actor_user_id"),
    impersonatingUserId: uuid("impersonating_user_id"),
    /** e.g. auth.login, platform.feature_toggled, user.created */
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // ── Tamper evidence ─────────────────────────────────────────────────────
    // Append-only is a property of the application, not of the database: a
    // privileged connection can still edit a row. Each entry therefore
    // carries the hash of the one before it, so any edit, deletion or
    // reordering breaks the chain from that point on and
    // `audit_log_verify()` reports where. Both columns are written by the
    // `audit_log_chain` trigger, never by the application, so nothing can
    // append without linking.
    // Monotonic, though not contiguous: the column's own default draws a value
    // and the trigger draws another under its lock, which is what keeps chain
    // order and seq order in step when transactions commit out of order.
    seq: bigserial("seq", { mode: "number" }).notNull(),
    prevHash: text("prev_hash"),
    hash: text("hash"),
  },
  (t) => [
    index("idx_audit_log_org_created").on(t.orgId, t.createdAt),
    index("idx_audit_log_action_created").on(t.action, t.createdAt),
    index("idx_audit_log_seq").on(t.seq),
  ]
);

export type Organization = typeof organizationsTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type PlatformFeatureRow = typeof platformFeaturesTable.$inferSelect;
export type OrgFeatureRow = typeof orgFeaturesTable.$inferSelect;
export type AuditLogRow = typeof auditLogTable.$inferSelect;

export const userStatusSchema = z.enum(["Active", "Suspended"]);
export const organizationStatusSchema = z.enum(["active", "suspended", "decommissioned"]);
