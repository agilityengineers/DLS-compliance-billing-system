import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { organizationsTable, type Db, type Organization, type Session, type User } from "@workspace/db";
import { effectiveFeatureKeys, isRole, type FeatureKey, type FeatureState, type Role } from "@workspace/features";
import type { AppConfig } from "../lib/config";
import { forbidden, unauthorized } from "../lib/errors";
import { loadFeatureStates } from "../lib/features";
import { loadSession } from "../lib/session";
import type { Actor } from "../lib/users";

export interface AuthContext {
  session: Session;
  realUser: User;
  effectiveUser: User;
  impersonating: boolean;
  /** Organization of the EFFECTIVE user (null for a provider account acting as itself). */
  org: Organization | null;
  /** Feature states for that organization (tier 1 only when org is null). */
  features: FeatureState[];
  effectiveKeys: Set<FeatureKey>;
}

export function roleOf(user: User): Role {
  return isRole(user.role) ? user.role : "Field_Staff";
}

export function getAuth(res: Response): AuthContext | undefined {
  return res.locals.auth as AuthContext | undefined;
}

export function requireAuthContext(res: Response): AuthContext {
  const auth = getAuth(res);
  if (!auth) throw unauthorized();
  return auth;
}

export function actorOf(req: Request, auth: AuthContext): Actor {
  return {
    id: auth.realUser.id,
    role: roleOf(auth.realUser),
    orgId: auth.realUser.orgId,
    impersonatingUserId: auth.impersonating ? auth.effectiveUser.id : null,
    ip: req.ip ?? null,
  };
}

/** Resolve the session cookie (if any) into res.locals.auth. Never rejects. */
export function attachSession(db: Db, config: AppConfig): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = (req.cookies as Record<string, string | undefined> | undefined)?.[config.cookieName];
      if (!token) return next();
      const loaded = await loadSession(db, token, config);
      if (!loaded) return next();
      const orgId = loaded.effectiveUser.orgId;
      const [org, features] = await Promise.all([
        orgId
          ? db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1).then((r) => r[0] ?? null)
          : Promise.resolve(null),
        loadFeatureStates(db, orgId),
      ]);
      // A suspended organization signs everyone in it out.
      if (org && org.status !== "active" && roleOf(loaded.realUser) !== "Super_Admin") return next();
      const auth: AuthContext = {
        session: loaded.session,
        realUser: loaded.realUser,
        effectiveUser: loaded.effectiveUser,
        impersonating: loaded.effectiveUser.id !== loaded.realUser.id,
        org,
        features,
        effectiveKeys: new Set(effectiveFeatureKeys(features, roleOf(loaded.effectiveUser))),
      };
      res.locals.auth = auth;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAuth: RequestHandler = (_req, res, next) => {
  if (!getAuth(res)) return next(unauthorized());
  next();
};

/** Gate on the EFFECTIVE role — impersonation shows exactly what the target may do. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(res);
    if (!auth) return next(unauthorized());
    if (!roles.includes(roleOf(auth.effectiveUser))) return next(forbidden());
    next();
  };
}

/** Gate on the REAL identity — for controls about impersonation itself. */
export function requireRealRole(...roles: Role[]): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(res);
    if (!auth) return next(unauthorized());
    if (!roles.includes(roleOf(auth.realUser))) return next(forbidden());
    next();
  };
}

export function requireFeature(key: FeatureKey): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(res);
    if (!auth) return next(unauthorized());
    if (!auth.effectiveKeys.has(key)) return next(forbidden(`This feature (${key}) is not enabled for you.`));
    next();
  };
}
