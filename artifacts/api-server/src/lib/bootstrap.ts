// First-boot provisioning, safe to run on every start:
//   1. one tier-1 row per catalog feature (new keys get their launch default)
//   2. the first organization
//   3. the platform owner (Super Admin) account
//   4. the shipped credentialing requirements registry
// Nothing here ever overwrites an existing account unless SUPER_ADMIN_FORCE_RESET=true,
// and re-seeding the registry never overwrites an agency's own policy decisions.
import { eq } from "drizzle-orm";
import { organizationsTable, usersTable, type Db } from "@workspace/db";
import { seedRequirements } from "@workspace/db/seed";
import type { AppConfig } from "./config";
import { ensurePlatformRows } from "./features";
import { logger } from "./logger";
import { hashPassword } from "./password";
import { recordAudit } from "./audit";
import { findUserByEmail } from "./users";

/**
 * scrypt hash of the initial Super Admin password agreed with the platform
 * owner. Set SUPER_ADMIN_PASSWORD to bootstrap with a different one; change
 * the password from the app after the first sign-in.
 */
export const BOOTSTRAP_SUPER_ADMIN_HASH = "scrypt$16384$8$1$DiQ+q1qbZruivKGHhq4U6Q==$k3SD+tIebz7KXvjNkyBmOFH48BSFlu8s2dMsanCUmH7GveHdEPW53JbVqMJ9S6lYxYg0chxbGKPhVa9HjdjcXg==";

export interface BootstrapResult {
  platformRowsAdded: number;
  orgId: string;
  orgCreated: boolean;
  superAdminId: string;
  superAdminCreated: boolean;
  requirementsSeeded: number;
}

export async function bootstrapPlatform(db: Db, config: AppConfig): Promise<BootstrapResult> {
  const platformRowsAdded = await ensurePlatformRows(db);

  // The credentialing registry decides what blocks a claim, so an empty one is
  // not a neutral starting state — it would mean nothing is required of
  // anybody. Install the shipped defaults. The seed refreshes the wording and
  // citations we own and leaves the agency's own toggles and sign-offs alone,
  // so this is safe on every restart, not just the first.
  // `$client` is the node-postgres pool behind this Drizzle handle: the seed
  // speaks numbered placeholders, and passing them through keeps every value
  // parameterised rather than interpolated into SQL.
  const { seeded: requirementsSeeded } = await seedRequirements((text, params) =>
    db.$client.query(text, params as unknown[])
  );

  let orgCreated = false;
  let [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, config.defaultOrgSlug)).limit(1);
  if (!org) {
    [org] = await db.insert(organizationsTable).values({ name: config.defaultOrgName, slug: config.defaultOrgSlug }).returning();
    orgCreated = true;
  }

  let superAdminCreated = false;
  let admin = await findUserByEmail(db, config.superAdminEmail);
  if (!admin) {
    const passwordHash = config.superAdminPassword ? await hashPassword(config.superAdminPassword) : BOOTSTRAP_SUPER_ADMIN_HASH;
    [admin] = await db
      .insert(usersTable)
      .values({
        orgId: null,
        email: config.superAdminEmail,
        fullName: config.superAdminName,
        role: "Super_Admin",
        status: "Active",
        passwordHash,
        mustChangePassword: false,
      })
      .returning();
    superAdminCreated = true;
    await recordAudit(db, {
      orgId: null,
      actorUserId: null,
      action: "platform.bootstrap",
      targetType: "user",
      targetId: admin!.id,
      details: { email: config.superAdminEmail, passwordSource: config.superAdminPassword ? "env" : "bootstrap-default" },
    });
    logger.warn({ email: config.superAdminEmail }, "Super Admin account created at bootstrap — change its password after the first sign-in");
  } else if (config.superAdminForceReset && config.superAdminPassword) {
    await db
      .update(usersTable)
      .set({ passwordHash: await hashPassword(config.superAdminPassword), status: "Active", updatedAt: new Date() })
      .where(eq(usersTable.id, admin.id));
    await recordAudit(db, {
      orgId: null,
      actorUserId: null,
      action: "platform.super_admin_password_reset",
      targetType: "user",
      targetId: admin.id,
      details: { via: "SUPER_ADMIN_FORCE_RESET" },
    });
    logger.warn({ email: config.superAdminEmail }, "Super Admin password reset from SUPER_ADMIN_PASSWORD — unset SUPER_ADMIN_FORCE_RESET now");
  }

  return {
    platformRowsAdded,
    orgId: org!.id,
    orgCreated,
    superAdminId: admin!.id,
    superAdminCreated,
    requirementsSeeded,
  };
}
