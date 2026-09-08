import { describe, expect, it } from "vitest";
import {
  FEATURE_CATALOG,
  FEATURE_KEYS,
  canManageRole,
  effectiveFeatureKeys,
  homePathForRole,
  isFeatureEnabledFor,
  resolveFeatureStates,
  toFeatureView,
  validateOrgChange,
  type FeatureState,
} from "../src";

const state = (over: Partial<FeatureState> & { key: FeatureState["key"] }): FeatureState => ({
  platformEnabled: true,
  orgEnabled: true,
  roles: {},
  ...over,
});

describe("catalog integrity", () => {
  it("has exactly one entry per key, and every key has an entry", () => {
    expect(FEATURE_CATALOG.map((f) => f.key).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(new Set(FEATURE_CATALOG.map((f) => f.key)).size).toBe(FEATURE_CATALOG.length);
  });

  it("never grants a default role the catalog does not allow", () => {
    for (const f of FEATURE_CATALOG) {
      for (const r of f.defaultEmployeeRoles) expect(f.employeeRoles).toContain(r);
    }
  });

  it("keeps the spine (not admin-configurable) on at launch", () => {
    for (const f of FEATURE_CATALOG.filter((x) => !x.adminConfigurable)) expect(f.launchDefault).toBe(true);
  });
});

describe("two-tier evaluation", () => {
  it("is off for everyone in the org when the provider has not enabled it", () => {
    const s = state({ key: "qa.flags", platformEnabled: false, roles: { Scheduler: true } });
    expect(isFeatureEnabledFor(s, "Admin")).toBe(false);
    expect(isFeatureEnabledFor(s, "Scheduler")).toBe(false);
    expect(isFeatureEnabledFor(s, "Super_Admin")).toBe(false);
  });

  it("is off for employees when the org admin turned it off", () => {
    const s = state({ key: "qa.flags", orgEnabled: false, roles: { Scheduler: true } });
    expect(isFeatureEnabledFor(s, "Admin")).toBe(false);
    expect(isFeatureEnabledFor(s, "Scheduler")).toBe(false);
  });

  it("admins get everything that passes both tiers; employees need a grant", () => {
    const s = state({ key: "qa.flags", roles: { Scheduler: false } });
    expect(isFeatureEnabledFor(s, "Admin")).toBe(true);
    expect(isFeatureEnabledFor(s, "Scheduler")).toBe(false);
    expect(isFeatureEnabledFor({ ...s, roles: { Scheduler: true } }, "Scheduler")).toBe(true);
  });

  it("ignores grants for roles the catalog does not allow", () => {
    // billing is admin-only; a stray grant must not leak it to a Scheduler
    const s = state({ key: "billing.claims", roles: { Scheduler: true } });
    expect(isFeatureEnabledFor(s, "Scheduler")).toBe(false);
    expect(isFeatureEnabledFor(s, "Field_Staff")).toBe(false);
  });
});

describe("resolveFeatureStates", () => {
  it("falls back to catalog defaults when the database has no rows", () => {
    const states = resolveFeatureStates([], []);
    const byKey = new Map(states.map((s) => [s.key, s]));
    expect(byKey.get("clients.core")).toEqual({
      key: "clients.core",
      platformEnabled: true,
      orgEnabled: true,
      roles: { Scheduler: true },
    });
    expect(byKey.get("evv.clock")).toEqual({
      key: "evv.clock",
      platformEnabled: false,
      orgEnabled: false,
      roles: { Scheduler: false, Field_Staff: false },
    });
  });

  it("applies persisted rows and clamps illegal role grants", () => {
    const states = resolveFeatureStates(
      [{ key: "evv.clock", enabled: true }],
      [{ key: "evv.clock", enabled: true, roles: { Field_Staff: true, Scheduler: false } },
       { key: "billing.claims", enabled: true, roles: { Scheduler: true } }]
    );
    const byKey = new Map(states.map((s) => [s.key, s]));
    expect(byKey.get("evv.clock")).toEqual({
      key: "evv.clock",
      platformEnabled: true,
      orgEnabled: true,
      roles: { Scheduler: false, Field_Staff: true },
    });
    expect(byKey.get("billing.claims")!.roles).toEqual({});
    expect(effectiveFeatureKeys(states, "Field_Staff")).toContain("evv.clock");
    expect(effectiveFeatureKeys(states, "Scheduler")).not.toContain("evv.clock");
  });
});

describe("validateOrgChange (what an Admin may do)", () => {
  it("refuses to touch a feature the provider has not enabled", () => {
    const res = validateOrgChange(state({ key: "qa.flags", platformEnabled: false, orgEnabled: false }), { enabled: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.violation.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("refuses to switch off a spine feature", () => {
    const res = validateOrgChange(state({ key: "schedule.board" }), { enabled: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.violation.code).toBe("FEATURE_ALWAYS_ON");
  });

  it("still lets the admin change role grants on a spine feature", () => {
    const res = validateOrgChange(state({ key: "schedule.board", roles: { Scheduler: true } }), { roles: { Scheduler: false } });
    expect(res).toEqual({ ok: true, enabled: true, roles: { Scheduler: false } });
  });

  it("refuses granting a role the catalog does not allow", () => {
    const res = validateOrgChange(state({ key: "billing.claims" }), { roles: { Field_Staff: true } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.violation.code).toBe("ROLE_NOT_ALLOWED");
  });

  it("accepts a normal toggle plus grants", () => {
    const res = validateOrgChange(state({ key: "evv.clock", orgEnabled: false }), {
      enabled: true,
      roles: { Field_Staff: true },
    });
    expect(res).toEqual({ ok: true, enabled: true, roles: { Scheduler: false, Field_Staff: true } });
  });
});

describe("views and helpers", () => {
  it("explains why an admin cannot toggle", () => {
    expect(toFeatureView(state({ key: "qa.flags", platformEnabled: false })).adminLockReason).toBe("not_available");
    expect(toFeatureView(state({ key: "audit.trail" })).adminLockReason).toBe("always_on");
    expect(toFeatureView(state({ key: "qa.flags" })).adminLockReason).toBeNull();
  });

  it("routes each role home", () => {
    expect(homePathForRole("Super_Admin")).toBe("/admin/platform");
    expect(homePathForRole("Admin")).toBe("/admin");
    expect(homePathForRole("Scheduler")).toBe("/admin");
    expect(homePathForRole("Field_Staff")).toBe("/field");
  });

  it("enforces the management hierarchy", () => {
    expect(canManageRole("Super_Admin", "Admin")).toBe(true);
    expect(canManageRole("Super_Admin", "Super_Admin")).toBe(false);
    expect(canManageRole("Admin", "Admin")).toBe(true);
    expect(canManageRole("Admin", "Field_Staff")).toBe(true);
    expect(canManageRole("Admin", "Super_Admin")).toBe(false);
    expect(canManageRole("Scheduler", "Field_Staff")).toBe(false);
  });
});
