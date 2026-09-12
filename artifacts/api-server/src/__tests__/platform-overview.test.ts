// The overview's rules, pinned down without a database: what counts, and what
// earns a place on the "needs attention" list.
import { describe, expect, it } from "vitest";
import { FEATURE_CATALOG } from "@workspace/features";
import { DORMANT_DAYS, TEMP_PASSWORD_STALE_DAYS, buildOverview, type OverviewOrganization } from "../lib/platform-overview";
import type { PublicUser } from "../lib/users";

const NOW = new Date("2026-09-12T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

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
    mfaEnabled: false,
    ...over,
  };
}

function org(id: string, over: Partial<OverviewOrganization> = {}): OverviewOrganization {
  return { id, name: id, slug: id, status: "active", createdAt: daysAgo(60), ...over };
}

const base = {
  platformEnabled: new Map<string, boolean>(),
  activeSessions: [],
  activity: { signInsLast7Days: 0, failedSignInsLast7Days: 0, configChangesLast7Days: 0, supportSessionsLast30Days: 0 },
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
    expect(out.organizations).toEqual({ total: 2, active: 1, suspended: 1, decommissioned: 0 });
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
    expect(out.sessions).toEqual({ active: 2, supportSessions: 1, openSupportWindows: 0 });
    expect(out.attention[0]?.kind).toBe("support_session_active");
    expect(out.attention[0]?.message).toContain("Clarence Williams");
    expect(out.attention[0]?.message).toContain("Lisa Torres");
    expect(out.attention[0]?.href).toBe("/admin/platform/support");
    // One provider account is now a warning: the remedy (a break-glass
    // account in the deployment) exists, so leaving it is a choice.
    const single = out.attention.find((a) => a.kind === "single_platform_account");
    expect(single?.severity).toBe("warning");
    expect(single?.message).toContain("SUPER_ADMIN_BREAKGLASS");
  });

  it("counts a decommissioned organization apart from a suspended one", () => {
    const out = buildOverview({
      ...base,
      organizations: [org("org-1"), org("org-2", { status: "suspended" }), org("org-3", { status: "decommissioned" })],
      users: [user({ id: "lisa", role: "Admin" })],
    });
    expect(out.organizations).toEqual({ total: 3, active: 1, suspended: 1, decommissioned: 1 });
    // A closed-down organization is finished business, not an open item.
    const kinds = out.attention.map((a) => a.kind);
    expect(kinds.filter((k) => k === "org_suspended")).toHaveLength(1);
    expect(out.attention.some((a) => a.message.includes("org-3"))).toBe(false);
  });

  it("warns about provider accounts with no second factor", () => {
    const withoutMfa = buildOverview({
      ...base,
      organizations: [],
      users: [
        user({ id: "root", orgId: null, role: "Super_Admin" }),
        user({ id: "spare", orgId: null, role: "Super_Admin", mfaEnabled: true }),
      ],
    });
    const note = withoutMfa.attention.find((a) => a.kind === "provider_without_mfa");
    expect(note?.severity).toBe("warning");
    expect(note?.message).toContain("1 provider account");
    expect(withoutMfa.accounts.platform).toBe(2);
    expect(withoutMfa.accounts.platformWithMfa).toBe(1);

    // With MFA required, the message changes to say they cannot work at all.
    const required = buildOverview({
      ...base,
      organizations: [],
      users: [user({ id: "root", orgId: null, role: "Super_Admin" })],
      requireMfaForPlatform: true,
    });
    expect(required.attention.find((a) => a.kind === "provider_without_mfa")?.message).toContain("cannot work");

    // Everyone enrolled: no note at all.
    const enrolled = buildOverview({
      ...base,
      organizations: [],
      users: [
        user({ id: "root", orgId: null, role: "Super_Admin", mfaEnabled: true }),
        user({ id: "spare", orgId: null, role: "Super_Admin", mfaEnabled: true }),
      ],
    });
    expect(enrolled.attention.map((a) => a.kind)).not.toContain("provider_without_mfa");
  });

  it("surfaces sign-in failures, open support windows and failing jobs", () => {
    const out = buildOverview({
      ...base,
      organizations: [org("org-1")],
      users: [user({ id: "lisa", role: "Admin", fullName: "Lisa Torres" })],
      bruteForce: [{ userId: "lisa", fullName: "Lisa Torres", email: "lisa@example.com", failures: 12, addresses: 3 }],
      openSupportWindows: [{ id: "w1", orgId: "org-1", expiresAt: new Date(NOW.getTime() + 45 * 60_000).toISOString() }],
      jobs: [
        { name: "audit.verify_chain", ok: false, lastRunAt: daysAgo(1) },
        { name: "sessions.prune", ok: true, lastRunAt: daysAgo(1) },
        { name: "login_attempts.prune", ok: null, lastRunAt: null },
      ],
      mailConfigured: false,
    });
    const byKind = new Map(out.attention.map((a) => [a.kind, a]));
    expect(byKind.get("sign_in_failures")?.message).toContain("Lisa Torres has 12 failed sign-ins from 3 addresses");
    expect(byKind.get("sign_in_failures")?.severity).toBe("warning");
    expect(byKind.get("support_window_open")?.message).toContain("45 minutes");
    expect(byKind.get("job_failing")?.message).toContain("audit.verify_chain");
    expect(byKind.get("job_never_ran")?.message).toContain("login_attempts.prune");
    expect(byKind.get("mail_not_configured")?.severity).toBe("info");
    expect(out.sessions.openSupportWindows).toBe(1);
  });

  it("chases a Business Associate Agreement that is lapsing or missing", () => {
    const out = buildOverview({
      ...base,
      organizations: [
        org("lapsed", { baaSignedOn: daysAgo(400).slice(0, 10), baaExpiresOn: daysAgo(3).slice(0, 10) }),
        org("soon", { baaSignedOn: daysAgo(300).slice(0, 10), baaExpiresOn: inDays(20) }),
        org("fine", { baaSignedOn: daysAgo(10).slice(0, 10), baaExpiresOn: inDays(300) }),
        org("missing"),
      ],
      users: [
        user({ id: "a", orgId: "lapsed", role: "Admin" }),
        user({ id: "b", orgId: "soon", role: "Admin" }),
        user({ id: "c", orgId: "fine", role: "Admin" }),
        user({ id: "d", orgId: "missing", role: "Admin" }),
      ],
    });
    const baa = out.attention.filter((a) => a.kind === "baa_expiring");
    expect(baa).toHaveLength(2);
    expect(baa.find((a) => a.message.includes("lapsed"))?.severity).toBe("warning");
    expect(baa.find((a) => a.message.includes("expires in 20 days"))?.severity).toBe("info");
    expect(out.attention.filter((a) => a.kind === "baa_missing").map((a) => a.message)).toEqual([
      expect.stringContaining("missing"),
    ]);
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
