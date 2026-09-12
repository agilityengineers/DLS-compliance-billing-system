// The overview's rules, pinned down without a database: what counts, and what
// earns a place on the "needs attention" list.
import { describe, expect, it } from "vitest";
import { FEATURE_CATALOG } from "@workspace/features";
import { DORMANT_DAYS, TEMP_PASSWORD_STALE_DAYS, buildOverview, type OverviewOrganization } from "../lib/platform-overview";
import type { PublicUser } from "../lib/users";

const NOW = new Date("2026-09-12T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function user(over: Partial<PublicUser> & { id: string }): PublicUser {
  return {
    orgId: "org-1",
    email: `${over.id}@example.com`,
    fullName: over.id,
    role: "Scheduler",
    status: "Active",
    mustChangePassword: false,
    lastLoginAt: daysAgo(1),
    createdAt: daysAgo(30),
    ...over,
  };
}

function org(id: string, over: Partial<OverviewOrganization> = {}): OverviewOrganization {
  return { id, name: id, slug: id, status: "active", createdAt: daysAgo(60), ...over };
}

const base = {
  platformEnabled: new Map<string, boolean>(),
  activeSessions: [],
  activity: { signInsLast7Days: 0, configChangesLast7Days: 0, supportSessionsLast30Days: 0 },
  now: NOW,
};

const launchOn = FEATURE_CATALOG.filter((f) => f.launchDefault).length;

describe("platform overview", () => {
  it("counts organizations, accounts and features from the catalog defaults", () => {
    const out = buildOverview({
      ...base,
      organizations: [org("org-1"), org("org-2", { status: "suspended" })],
      users: [
        user({ id: "root", orgId: null, role: "Super_Admin" }),
        user({ id: "lisa", role: "Admin" }),
        user({ id: "sam" }),
        user({ id: "fay", role: "Field_Staff", status: "Suspended" }),
      ],
    });
    expect(out.organizations).toEqual({ total: 2, active: 1, suspended: 1 });
    expect(out.accounts.total).toBe(4);
    expect(out.accounts.active).toBe(3);
    expect(out.accounts.suspended).toBe(1);
    expect(out.accounts.platform).toBe(1);
    expect(out.accounts.byRole).toEqual({ Admin: 1, Scheduler: 1, Field_Staff: 1 });
    expect(out.features.total).toBe(FEATURE_CATALOG.length);
    expect(out.features.available).toBe(launchOn);
    // Nothing preview or in development is on by default, so no note about it.
    expect(out.attention.map((a) => a.kind)).not.toContain("preview_features_available");
    expect(out.activity).toEqual(base.activity);
  });

  it("honours tier-1 rows over the catalog default", () => {
    const out = buildOverview({
      ...base,
      platformEnabled: new Map([
        ["qa.flags", true], // preview, off by default
        ["clients.core", false], // ready, on by default
      ]),
      organizations: [],
      users: [],
    });
    expect(out.features.available).toBe(launchOn); // one added, one removed
    expect(out.features.byStatus.preview.available).toBe(1);
    expect(out.features.byStatus.ready.available).toBe(FEATURE_CATALOG.filter((f) => f.status === "ready").length - 1);
    const note = out.attention.find((a) => a.kind === "preview_features_available");
    expect(note?.severity).toBe("info");
    expect(note?.message).toContain("1 capability");
    expect(note?.href).toBe("/admin/platform/features");
  });

  it("flags an organization without an administrator, and one whose administrator never signed in", () => {
    const out = buildOverview({
      ...base,
      organizations: [org("org-1"), org("org-2"), org("org-3")],
      users: [
        user({ id: "lisa", role: "Admin" }),
        user({ id: "newbie", orgId: "org-2", role: "Admin", lastLoginAt: null, mustChangePassword: true, createdAt: daysAgo(1) }),
      ],
    });
    const kinds = out.attention.map((a) => a.kind);
    expect(kinds).toContain("org_no_admin");
    expect(kinds).toContain("org_admin_not_signed_in");
    expect(out.attention.find((a) => a.kind === "org_no_admin")?.message).toContain("org-3");
    expect(out.attention.find((a) => a.kind === "org_admin_not_signed_in")?.message).toContain("org-2");
    // A one-day-old temporary password is not stale yet.
    expect(kinds).not.toContain("unused_temporary_passwords");
    for (const a of out.attention.filter((x) => x.kind.startsWith("org_"))) expect(a.severity).toBe("warning");
  });

  it("lists a suspended organization without also nagging about its administrator", () => {
    const out = buildOverview({ ...base, organizations: [org("org-1", { status: "suspended" })], users: [] });
    const kinds = out.attention.map((a) => a.kind);
    expect(kinds).toContain("org_suspended");
    expect(kinds).not.toContain("org_no_admin");
    expect(out.attention.find((a) => a.kind === "org_suspended")?.severity).toBe("info");
  });

  it("flags stale temporary passwords and dormant accounts at the documented thresholds", () => {
    const out = buildOverview({
      ...base,
      organizations: [org("org-1")],
      users: [
        user({ id: "lisa", role: "Admin" }),
        user({ id: "stale", mustChangePassword: true, lastLoginAt: null, createdAt: daysAgo(TEMP_PASSWORD_STALE_DAYS + 1) }),
        user({ id: "fresh", mustChangePassword: true, lastLoginAt: null, createdAt: daysAgo(TEMP_PASSWORD_STALE_DAYS - 1) }),
        user({ id: "dormant", lastLoginAt: daysAgo(DORMANT_DAYS + 1) }),
        user({ id: "gone", lastLoginAt: daysAgo(DORMANT_DAYS + 1), status: "Suspended" }),
      ],
    });
    expect(out.accounts.temporaryPassword).toBe(2);
    expect(out.accounts.neverSignedIn).toBe(2);
    expect(out.accounts.dormant).toBe(1); // suspended accounts are not dormant, they are off
    const stale = out.attention.find((a) => a.kind === "unused_temporary_passwords");
    expect(stale?.severity).toBe("warning");
    expect(stale?.message).toMatch(/^1 account still holds/);
    expect(stale?.href).toBe("/admin/platform/accounts");
    expect(out.attention.find((a) => a.kind === "dormant_accounts")?.severity).toBe("info");
  });

  it("puts a running support session first and names both people", () => {
    const out = buildOverview({
      ...base,
      organizations: [org("org-1")],
      users: [
        user({ id: "root", orgId: null, role: "Super_Admin", fullName: "Clarence Williams" }),
        user({ id: "lisa", role: "Admin", fullName: "Lisa Torres" }),
      ],
      activeSessions: [
        { id: "s1", userId: "root", impersonatingUserId: "lisa" },
        { id: "s2", userId: "lisa", impersonatingUserId: null },
      ],
    });
    expect(out.sessions).toEqual({ active: 2, supportSessions: 1 });
    expect(out.attention[0]?.kind).toBe("support_session_active");
    expect(out.attention[0]?.message).toContain("Clarence Williams");
    expect(out.attention[0]?.message).toContain("Lisa Torres");
    expect(out.attention[0]?.href).toBe("/admin/platform/support");
    // A single provider account is worth a note, never a warning.
    const single = out.attention.find((a) => a.kind === "single_platform_account");
    expect(single?.severity).toBe("info");
  });

  it("sorts warnings before notes", () => {
    const out = buildOverview({
      ...base,
      organizations: [org("org-1"), org("org-2", { status: "suspended" })],
      users: [user({ id: "root", orgId: null, role: "Super_Admin" })],
    });
    const severities = out.attention.map((a) => a.severity);
    expect(severities).toContain("warning");
    expect(severities).toContain("info");
    const lastWarning = severities.lastIndexOf("warning");
    const firstInfo = severities.indexOf("info");
    expect(lastWarning).toBeLessThan(firstInfo);
  });
});
