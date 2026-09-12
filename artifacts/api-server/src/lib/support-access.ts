// Who may open a "view as" session, and when.
//
// Review decision D-02 says the provider has no standing access to an
// organization's records: it gets in only inside a window that the
// organization's own Admin has opened, for a stated reason, with an end time.
// That was a promise in a document until now — this module is the rule, and
// the API refuses the session without it.
//
// The evaluation is pure so that every branch can be tested without a
// database, and so that the same reasoning can explain itself in the UI.
import { ROLE_RANK, isPlatformRole, hasPlatformCapability, type Role } from "@workspace/features";

export interface SupportWindowLike {
  id: string;
  orgId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Windows that are open right now for `orgId`. */
export function activeWindowsFor<T extends SupportWindowLike>(
  windows: readonly T[],
  orgId: string,
  now: Date = new Date()
): T[] {
  return windows.filter((w) => w.orgId === orgId && w.revokedAt === null && w.expiresAt.getTime() > now.getTime());
}

export type ImpersonationRefusal =
  | "SELF"
  | "TARGET_INACTIVE"
  | "ROLE_NOT_BELOW"
  | "NOT_PERMITTED"
  | "CROSS_ORG"
  | "FEATURE_DISABLED"
  | "NO_SUPPORT_WINDOW"
  | "TARGET_NOT_IN_ORG";

export interface ImpersonationRequest {
  actorRole: Role;
  actorId: string;
  actorOrgId: string | null;
  targetId: string;
  targetRole: Role;
  targetOrgId: string | null;
  targetActive: boolean;
  /** Does the target's organization have an open support window? */
  hasActiveWindow: boolean;
  /**
   * Has anybody in the target's organization ever completed the hand-over?
   *
   * The exception that keeps the rule usable: before the first Admin has
   * signed in there is nobody who *could* grant a window, so the provider may
   * still open the organization it just created. Once an Admin has signed in,
   * the organization owns its own door and a window is required. An
   * organization in that state holds no client records yet.
   */
  orgHandoverComplete: boolean;
  /** For an Admin acting inside their own organization. */
  actorFeatures: ReadonlySet<string>;
}

export interface ImpersonationDecision {
  ok: boolean;
  code?: ImpersonationRefusal;
  message?: string;
}

const ALLOWED: ImpersonationDecision = { ok: true };

export function evaluateImpersonation(req: ImpersonationRequest): ImpersonationDecision {
  if (req.targetId === req.actorId) {
    return { ok: false, code: "SELF", message: "You are already yourself." };
  }
  if (!req.targetActive) {
    return { ok: false, code: "TARGET_INACTIVE", message: "User not found or suspended." };
  }
  if (ROLE_RANK[req.targetRole] >= ROLE_RANK[req.actorRole]) {
    return { ok: false, code: "ROLE_NOT_BELOW", message: "You can only view as a user below your own role." };
  }

  if (isPlatformRole(req.actorRole)) {
    if (!hasPlatformCapability(req.actorRole, "platform.support")) {
      return { ok: false, code: "NOT_PERMITTED", message: "Your account cannot open support sessions." };
    }
    if (!req.targetOrgId) {
      return { ok: false, code: "TARGET_NOT_IN_ORG", message: "That account does not belong to an organization." };
    }
    if (!req.hasActiveWindow && req.orgHandoverComplete) {
      return {
        ok: false,
        code: "NO_SUPPORT_WINDOW",
        message:
          "This organization has not opened a support window. Ask an Admin to grant one from Settings → Support access, then try again.",
      };
    }
    return ALLOWED;
  }

  if (req.actorRole === "Admin") {
    if (!req.actorOrgId || req.targetOrgId !== req.actorOrgId) {
      return { ok: false, code: "CROSS_ORG", message: "That user is not in your organization." };
    }
    if (!req.actorFeatures.has("platform.impersonation")) {
      return { ok: false, code: "FEATURE_DISABLED", message: "Impersonation is not enabled for your organization." };
    }
    return ALLOWED;
  }

  return { ok: false, code: "NOT_PERMITTED", message: "Your role cannot view as another user." };
}

/** Minutes left on a window, for a countdown that does not need a server round trip. */
export function minutesRemaining(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 60_000));
}

/**
 * Clamp a requested duration to what the deployment allows. A window is a
 * deliberate, bounded exception; "until I turn it off" is not one.
 */
export function clampWindowHours(requestedHours: number, maxHours: number): number {
  if (!Number.isFinite(requestedHours) || requestedHours <= 0) return 1;
  return Math.min(Math.max(Math.round(requestedHours * 4) / 4, 0.25), maxHours);
}
