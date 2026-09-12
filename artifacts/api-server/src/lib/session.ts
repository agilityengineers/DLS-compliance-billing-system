import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Response } from "express";
import { sessionsTable, usersTable, type Db, type Session, type User } from "@workspace/db";
import type { AppConfig } from "./config";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Db,
  input: { userId: string; ip: string | null; userAgent: string | null },
  config: AppConfig
): Promise<{ token: string; session: Session }> {
  const token = generateToken();
  const now = Date.now();
  const [session] = await db
    .insert(sessionsTable)
    .values({
      tokenHash: hashToken(token),
      userId: input.userId,
      expiresAt: new Date(now + config.sessionIdleMs),
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
    })
    .returning();
  return { token, session: session! };
}

export interface LoadedSession {
  session: Session;
  realUser: User;
  effectiveUser: User;
}

/**
 * Resolve a cookie token to its session and users. Enforces idle and absolute
 * expiry, drops impersonation if the target went away or was suspended, and
 * slides the idle window forward (at most once every five minutes to keep the
 * write volume down).
 */
export async function loadSession(db: Db, token: string, config: AppConfig): Promise<LoadedSession | null> {
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.tokenHash, hashToken(token)), isNull(sessionsTable.revokedAt)))
    .limit(1);
  const session = rows[0];
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.createdAt.getTime() + config.sessionAbsoluteMs <= now) {
    return null;
  }
  const [realUser] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId)).limit(1);
  if (!realUser || realUser.status !== "Active") return null;

  let effectiveUser = realUser;
  if (session.impersonatingUserId) {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, session.impersonatingUserId)).limit(1);
    if (target && target.status === "Active") effectiveUser = target;
    else await db.update(sessionsTable).set({ impersonatingUserId: null }).where(eq(sessionsTable.id, session.id));
  }

  if (now - session.lastSeenAt.getTime() > 5 * 60_000) {
    const expiresAt = new Date(Math.min(now + config.sessionIdleMs, session.createdAt.getTime() + config.sessionAbsoluteMs));
    await db.update(sessionsTable).set({ lastSeenAt: new Date(now), expiresAt }).where(eq(sessionsTable.id, session.id));
  }
  return { session, realUser, effectiveUser };
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.update(sessionsTable).set({ revokedAt: new Date() }).where(eq(sessionsTable.id, sessionId));
}

/**
 * Sign out every device for a user — used when an account is suspended or its
 * password reset, and by the provider's "sign out everywhere" control.
 * Returns how many live sessions were ended.
 */
export async function revokeAllSessions(db: Db, userId: string): Promise<number> {
  const revoked = await db
    .update(sessionsTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.revokedAt)))
    .returning({ id: sessionsTable.id });
  return revoked.length;
}

/**
 * Every session that could still be presented right now: not revoked, inside
 * its idle window and inside its absolute lifetime. Most recently active first.
 * The absolute cut-off lives in config rather than in the row, so it is
 * applied here exactly as loadSession() applies it.
 */
export async function listActiveSessions(db: Db, config: AppConfig, now: Date = new Date()): Promise<Session[]> {
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(and(isNull(sessionsTable.revokedAt), gt(sessionsTable.expiresAt, now)))
    .orderBy(desc(sessionsTable.lastSeenAt));
  return rows.filter((s) => s.createdAt.getTime() + config.sessionAbsoluteMs > now.getTime());
}

export async function findSessionById(db: Db, id: string): Promise<Session | undefined> {
  const rows = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).limit(1);
  return rows[0];
}

export async function setImpersonation(db: Db, sessionId: string, targetUserId: string | null): Promise<void> {
  await db.update(sessionsTable).set({ impersonatingUserId: targetUserId }).where(eq(sessionsTable.id, sessionId));
}

export function setSessionCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: config.sessionAbsoluteMs,
  });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(config.cookieName, { httpOnly: true, sameSite: "lax", secure: config.cookieSecure, path: "/" });
}
