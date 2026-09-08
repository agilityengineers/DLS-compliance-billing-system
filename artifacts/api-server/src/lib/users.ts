import { and, eq } from "drizzle-orm";
import { organizationsTable, usersTable, type Db, type User } from "@workspace/db";
import { canManageRole, isRole, type Role } from "@workspace/features";
import { recordAudit } from "./audit";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { generateTemporaryPassword, hashPassword, passwordProblem } from "./password";
import { revokeAllSessions } from "./session";

/** What the API returns for a user — never the password hash. */
export interface PublicUser {
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

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    orgId: u.orgId,
    email: u.email,
    fullName: u.fullName,
    role: (isRole(u.role) ? u.role : "Field_Staff") as Role,
    status: u.status === "Suspended" ? "Suspended" : "Active",
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(db: Db, email: string): Promise<User | undefined> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, normalizeEmail(email))).limit(1);
  return rows[0];
}

export async function findUserById(db: Db, id: string): Promise<User | undefined> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return rows[0];
}

export interface Actor {
  id: string;
  role: Role;
  orgId: string | null;
  impersonatingUserId: string | null;
  ip: string | null;
}

/**
 * Create an account. The caller has already decided which organization the
 * account belongs to and that the actor may manage that role; this checks the
 * hierarchy again, hashes the password, and audits.
 */
export async function createUserAccount(
  db: Db,
  actor: Actor,
  input: { orgId: string | null; email: string; fullName: string; role: Role; password?: string }
): Promise<{ user: PublicUser; temporaryPassword: string | null }> {
  if (!canManageRole(actor.role, input.role)) throw forbidden(`Your role cannot create a ${input.role.replace("_", " ")} account.`);
  if (input.role === "Super_Admin" && input.orgId) throw badRequest("Platform accounts do not belong to an organization.");
  if (input.role !== "Super_Admin" && !input.orgId) throw badRequest("An organization is required.");
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();
  if (!fullName) throw badRequest("A full name is required.");
  if (input.orgId) {
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, input.orgId)).limit(1);
    if (!org) throw notFound("Organization not found.");
  }
  if (await findUserByEmail(db, email)) throw conflict("EMAIL_TAKEN", "An account with that email already exists.");

  let temporaryPassword: string | null = null;
  let password = input.password;
  if (password) {
    const problem = passwordProblem(password);
    if (problem) throw badRequest(problem);
  } else {
    temporaryPassword = generateTemporaryPassword();
    password = temporaryPassword;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      orgId: input.orgId,
      email,
      fullName,
      role: input.role,
      status: "Active",
      passwordHash: await hashPassword(password),
      mustChangePassword: temporaryPassword !== null,
      createdBy: actor.id,
    })
    .returning();

  await recordAudit(db, {
    orgId: input.orgId,
    actorUserId: actor.id,
    impersonatingUserId: actor.impersonatingUserId,
    action: "user.created",
    targetType: "user",
    targetId: user!.id,
    details: { email, fullName, role: input.role, temporaryPassword: temporaryPassword !== null },
    ip: actor.ip,
  });
  return { user: toPublicUser(user!), temporaryPassword };
}

/**
 * Change name, role or status. `scopeOrgId` restricts the target to one
 * organization (an Admin's own); `null` means any organization (provider).
 */
export async function updateUserAccount(
  db: Db,
  actor: Actor,
  scopeOrgId: string | null,
  targetId: string,
  patch: { fullName?: string; role?: Role; status?: "Active" | "Suspended" }
): Promise<PublicUser> {
  const target = await findUserById(db, targetId);
  if (!target || (scopeOrgId && target.orgId !== scopeOrgId)) throw notFound("User not found.");
  const targetRole = isRole(target.role) ? target.role : "Field_Staff";
  if (target.id === actor.id) {
    if (patch.role && patch.role !== targetRole) throw badRequest("You cannot change your own role.");
    if (patch.status && patch.status !== target.status) throw badRequest("You cannot suspend your own account.");
  } else if (!canManageRole(actor.role, targetRole)) {
    throw forbidden("You cannot manage that account.");
  }
  if (patch.role && patch.role !== targetRole) {
    if (!canManageRole(actor.role, patch.role)) throw forbidden(`Your role cannot assign ${patch.role.replace("_", " ")}.`);
    if (patch.role === "Super_Admin" || targetRole === "Super_Admin") throw badRequest("Platform accounts cannot change role.");
  }
  const set: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (patch.fullName !== undefined) {
    const fullName = patch.fullName.trim();
    if (!fullName) throw badRequest("A full name is required.");
    set.fullName = fullName;
  }
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.status !== undefined) set.status = patch.status;

  const [updated] = await db.update(usersTable).set(set).where(eq(usersTable.id, target.id)).returning();
  if (patch.status === "Suspended") await revokeAllSessions(db, target.id);
  await recordAudit(db, {
    orgId: target.orgId,
    actorUserId: actor.id,
    impersonatingUserId: actor.impersonatingUserId,
    action: "user.updated",
    targetType: "user",
    targetId: target.id,
    details: { ...patch },
    ip: actor.ip,
  });
  return toPublicUser(updated!);
}

/** Set a new password (given or generated) and sign the user out everywhere. */
export async function resetUserPassword(
  db: Db,
  actor: Actor,
  scopeOrgId: string | null,
  targetId: string,
  password: string | undefined
): Promise<{ temporaryPassword: string | null }> {
  const target = await findUserById(db, targetId);
  if (!target || (scopeOrgId && target.orgId !== scopeOrgId)) throw notFound("User not found.");
  const targetRole = isRole(target.role) ? target.role : "Field_Staff";
  if (target.id !== actor.id && !canManageRole(actor.role, targetRole)) throw forbidden("You cannot manage that account.");
  let temporaryPassword: string | null = null;
  if (password) {
    const problem = passwordProblem(password);
    if (problem) throw badRequest(problem);
  } else {
    temporaryPassword = generateTemporaryPassword();
    password = temporaryPassword;
  }
  await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: temporaryPassword !== null, updatedAt: new Date() })
    .where(eq(usersTable.id, target.id));
  await revokeAllSessions(db, target.id);
  await recordAudit(db, {
    orgId: target.orgId,
    actorUserId: actor.id,
    impersonatingUserId: actor.impersonatingUserId,
    action: "user.password_reset",
    targetType: "user",
    targetId: target.id,
    details: { temporaryPassword: temporaryPassword !== null },
    ip: actor.ip,
  });
  return { temporaryPassword };
}

export async function listOrgUsers(db: Db, orgId: string): Promise<PublicUser[]> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.orgId, orgId)).orderBy(usersTable.fullName);
  return rows.map(toPublicUser);
}

export async function listAllUsers(db: Db): Promise<PublicUser[]> {
  const rows = await db.select().from(usersTable).orderBy(usersTable.fullName);
  return rows.map(toPublicUser);
}

export async function findActiveOrgUser(db: Db, orgId: string, userId: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.orgId, orgId), eq(usersTable.status, "Active")))
    .limit(1);
  return rows[0];
}
