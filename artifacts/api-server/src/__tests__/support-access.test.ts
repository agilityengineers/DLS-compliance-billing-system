// Who may open a support session. These are the rules behind review decision
// D-02, which until now existed only as a sentence in a document.
import { describe, expect, it } from "vitest";
import { activeWindowsFor, clampWindowHours, evaluateImpersonation, minutesRemaining } from "../lib/support-access";

const NOW = new Date("2026-09-12T12:00:00Z");
const inMinutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

const base = {
  actorId: "provider",
  actorOrgId: null as string | null,
  targetId: "lisa",
  targetOrgId: "org-1" as string | null,
  targetActive: true,
  hasActiveWindow: true,
  orgHandoverComplete: true,
  actorFeatures: new Set<string>(),
};

describe("active windows", () => {
  const windows = [
    { id: "open", orgId: "org-1", expiresAt: inMinutes(30), revokedAt: null },
    { id: "expired", orgId: "org-1", expiresAt: inMinutes(-5), revokedAt: null },
    { id: "revoked", orgId: "org-1", expiresAt: inMinutes(30), revokedAt: NOW },
    { id: "other-org", orgId: "org-2", expiresAt: inMinutes(30), revokedAt: null },
  ];

  it("keeps only windows that are open, unrevoked and for this organization", () => {
    expect(activeWindowsFor(windows, "org-1", NOW).map((w) => w.id)).toEqual(["open"]);
    expect(activeWindowsFor(windows, "org-2", NOW).map((w) => w.id)).toEqual(["other-org"]);
    expect(activeWindowsFor(windows, "org-3", NOW)).toEqual([]);
  });

  it("counts down in whole minutes and stops at zero", () => {
    expect(minutesRemaining(inMinutes(45), NOW)).toBe(45);
    expect(minutesRemaining(inMinutes(-10), NOW)).toBe(0);
  });
});

describe("the provider needs a granted window", () => {
  it("allows a support session while a window is open", () => {
    expect(evaluateImpersonation({ ...base, actorRole: "Super_Admin", targetRole: "Admin" })).toEqual({ ok: true });
    expect(evaluateImpersonation({ ...base, actorRole: "Platform_Support", targetRole: "Admin" })).toEqual({ ok: true });
  });

  it("refuses without one, and says how to get one", () => {
    const denied = evaluateImpersonation({
      ...base,
      actorRole: "Super_Admin",
      targetRole: "Admin",
      hasActiveWindow: false,
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("NO_SUPPORT_WINDOW");
    expect(denied.message).toContain("Settings → Support access");
  });

  it("makes an exception only while the organization has never been handed over", () => {
    // Nobody inside it has signed in, so there is nobody who could grant a
    // window — and there are no client records in it yet either.
    expect(
      evaluateImpersonation({
        ...base,
        actorRole: "Super_Admin",
        targetRole: "Admin",
        hasActiveWindow: false,
        orgHandoverComplete: false,
      })
    ).toEqual({ ok: true });
  });

  it("never lets a provider view as another provider account", () => {
    const upward = evaluateImpersonation({
      ...base,
      actorRole: "Platform_Support",
      targetRole: "Super_Admin",
      targetOrgId: null,
    });
    expect(upward.code).toBe("ROLE_NOT_BELOW");
    const sideways = evaluateImpersonation({
      ...base,
      actorRole: "Super_Admin",
      targetRole: "Platform_Support",
      targetOrgId: null,
    });
    expect(sideways.code).toBe("TARGET_NOT_IN_ORG");
  });
});

describe("an Admin inside their own organization", () => {
  const admin = {
    ...base,
    actorRole: "Admin" as const,
    actorId: "lisa",
    actorOrgId: "org-1",
    targetId: "sam",
    targetRole: "Scheduler" as const,
    actorFeatures: new Set(["platform.impersonation"]),
  };

  it("does not need a support window — it is their own organization", () => {
    expect(evaluateImpersonation({ ...admin, hasActiveWindow: false })).toEqual({ ok: true });
  });

  it("cannot reach another organization, or act with the feature switched off", () => {
    expect(evaluateImpersonation({ ...admin, targetOrgId: "org-2" }).code).toBe("CROSS_ORG");
    expect(evaluateImpersonation({ ...admin, actorFeatures: new Set() }).code).toBe("FEATURE_DISABLED");
  });

  it("cannot view as a peer or upward", () => {
    expect(evaluateImpersonation({ ...admin, targetRole: "Admin" }).code).toBe("ROLE_NOT_BELOW");
  });
});

describe("everyone else", () => {
  it("is refused outright", () => {
    expect(
      evaluateImpersonation({ ...base, actorRole: "Scheduler", actorOrgId: "org-1", targetRole: "Field_Staff" }).code
    ).toBe("NOT_PERMITTED");
  });

  it("cannot view as themselves or as a suspended account", () => {
    expect(evaluateImpersonation({ ...base, actorRole: "Super_Admin", targetRole: "Admin", targetId: "provider" }).code).toBe("SELF");
    expect(evaluateImpersonation({ ...base, actorRole: "Super_Admin", targetRole: "Admin", targetActive: false }).code).toBe(
      "TARGET_INACTIVE"
    );
  });
});

describe("window length", () => {
  it("clamps to the deployment's maximum and to sensible quarters of an hour", () => {
    expect(clampWindowHours(4, 8)).toBe(4);
    expect(clampWindowHours(24, 8)).toBe(8);
    expect(clampWindowHours(0, 8)).toBe(1);
    expect(clampWindowHours(-3, 8)).toBe(1);
    expect(clampWindowHours(0.1, 8)).toBe(0.25);
    expect(clampWindowHours(1.4, 8)).toBe(1.5);
    expect(clampWindowHours(Number.NaN, 8)).toBe(1);
  });
});
