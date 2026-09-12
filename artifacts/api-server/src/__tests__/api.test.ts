// End-to-end API tests against a real PostgreSQL (TEST_DATABASE_URL). They
// exercise the whole stack: migrations → bootstrap → login → hierarchy →
// two-tier feature switches → impersonation → audit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DbHandle } from "@workspace/db";
import { createApp } from "../app";
import { bootstrapPlatform } from "../lib/bootstrap";
import { loadConfig } from "../lib/config";
import { Mailer, MemoryTransport } from "../lib/mail";
import { totpCodeNow } from "../lib/totp";

const TEST_URL = process.env.TEST_DATABASE_URL;

interface ApiResponse<T = any> {
  status: number;
  body: T;
  cookie: string | null;
}

describe.skipIf(!TEST_URL)("api server", () => {
  let handle: DbHandle;
  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  const config = loadConfig({
    NODE_ENV: "test",
    LOGIN_MAX_FAILURES: "3",
    LOGIN_WINDOW_MINUTES: "15",
    APP_BASE_URL: "https://portal.example.test",
    CRON_SECRET: "cron-secret-for-tests",
  });
  // Capture mail instead of sending or logging it, so the tests can read what
  // the system would have put in someone's inbox.
  const mailTransport = new MemoryTransport();
  const mailOf = (kind: string) => mailTransport.sent.filter((m) => m.message.kind === kind);
  const linkIn = (body: string) => /https:\/\/portal\.example\.test\S+/.exec(body)?.[0] ?? "";
  const tokenIn = (body: string) => new URL(linkIn(body)).searchParams.get("token") ?? "";

  async function api<T = any>(method: string, path: string, body?: unknown, cookie?: string | null): Promise<ApiResponse<T>> {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    const setCookie = res.headers.get("set-cookie");
    return { status: res.status, body: parsed as T, cookie: setCookie ? setCookie.split(";")[0]! : null };
  }

  async function login(email: string, password: string): Promise<ApiResponse> {
    return api("POST", "/api/auth/login", { email, password });
  }

  beforeAll(async () => {
    handle = createDb(TEST_URL!);
    await handle.db.execute(sql`drop schema public cascade; drop schema if exists drizzle cascade; create schema public;`);
    await runMigrations(handle.db);
    await bootstrapPlatform(handle.db, config);
    const app = createApp({ db: handle.db, config, quiet: true, mailer: new Mailer(handle.db, config, mailTransport) });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await handle.pool.end();
  });

  let superCookie: string;
  let orgId: string;
  let lisaId: string;
  let lisaCookie: string;
  let lisaTempPassword: string;
  let schedulerCookie: string;
  let schedulerId: string;
  let supportWindowId: string;

  it("bootstraps the super admin and rejects a wrong password", async () => {
    const bad = await login("emailme@clarencewilliams.com", "not-the-password");
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(bad.cookie).toBeNull();
  });

  it("signs the super admin in with the agreed bootstrap password", async () => {
    const ok = await login("EmailMe@ClarenceWilliams.com ", "Success2026");
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("Super_Admin");
    expect(ok.body.user.orgId).toBeNull();
    expect(ok.cookie).toMatch(/^dls_session=/);
    superCookie = ok.cookie!;
    const me = await api("GET", "/api/auth/me", undefined, superCookie);
    expect(me.status).toBe(200);
    expect(me.body.realUser.email).toBe("emailme@clarencewilliams.com");
    expect(me.body.impersonating).toBe(false);
    expect(me.body.organization).toBeNull();
    // Provider view: launch-on features are enabled at tier 1, the rest off.
    const keys: string[] = me.body.effectiveFeatures;
    expect(keys).toContain("clients.core");
    expect(keys).not.toContain("qa.flags");
  });

  it("requires a session for protected routes", async () => {
    expect((await api("GET", "/api/auth/me")).status).toBe(401);
    expect((await api("GET", "/api/platform/organizations")).status).toBe(401);
  });

  it("lists the default organization and lets the super admin create its administrator", async () => {
    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    expect(orgs.status).toBe(200);
    expect(orgs.body.organizations).toHaveLength(1);
    expect(orgs.body.organizations[0].name).toBe("Durable Life Skills, Inc.");
    orgId = orgs.body.organizations[0].id;

    const created = await api(
      "POST",
      "/api/platform/users",
      { orgId, email: "Lisa.Torres@durablelifeskills.com", fullName: "Lisa Torres", role: "Admin" },
      superCookie
    );
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe("Admin");
    expect(created.body.user.email).toBe("lisa.torres@durablelifeskills.com");
    expect(typeof created.body.temporaryPassword).toBe("string");
    lisaId = created.body.user.id;
    lisaTempPassword = created.body.temporaryPassword;

    const dup = await api("POST", "/api/platform/users", { orgId, email: "lisa.torres@durablelifeskills.com", fullName: "Dup", role: "Admin" }, superCookie);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("never lets anyone mint another super admin through the API", async () => {
    const res = await api("POST", "/api/platform/users", { orgId, email: "x@example.com", fullName: "X", role: "Super_Admin" }, superCookie);
    expect(res.status).toBe(400);
  });

  it("signs Lisa in as an Admin of her organization with the launch defaults", async () => {
    const res = await login("lisa.torres@durablelifeskills.com", lisaTempPassword);
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
    lisaCookie = res.cookie!;
    const me = await api("GET", "/api/auth/me", undefined, lisaCookie);
    expect(me.body.effectiveUser.role).toBe("Admin");
    expect(me.body.organization.id).toBe(orgId);
    expect(me.body.effectiveFeatures).toContain("billing.claims");
    expect(me.body.effectiveFeatures).not.toContain("qa.flags");
    // The platform console is closed to her.
    expect((await api("GET", "/api/platform/features", undefined, lisaCookie)).status).toBe(403);
    expect((await api("PUT", "/api/platform/features/qa.flags", { enabled: true }, lisaCookie)).status).toBe(403);
  });

  it("changes her temporary password and keeps her signed in", async () => {
    const bad = await api("POST", "/api/auth/change-password", { currentPassword: "wrong-wrong-1", newPassword: "Torres-2026-ok" }, lisaCookie);
    expect(bad.status).toBe(400);
    const weak = await api("POST", "/api/auth/change-password", { currentPassword: lisaTempPassword, newPassword: "short1" }, lisaCookie);
    expect(weak.status).toBe(400);
    const ok = await api("POST", "/api/auth/change-password", { currentPassword: lisaTempPassword, newPassword: "Torres-2026-ok" }, lisaCookie);
    expect(ok.status).toBe(200);
    expect(ok.cookie).toMatch(/^dls_session=/);
    lisaCookie = ok.cookie!;
    const me = await api("GET", "/api/auth/me", undefined, lisaCookie);
    expect(me.status).toBe(200);
    expect(me.body.realUser.mustChangePassword).toBe(false);
    expect((await login("lisa.torres@durablelifeskills.com", lisaTempPassword)).status).toBe(401);
  });

  it("blocks tier-2 changes on a feature the provider has not enabled", async () => {
    const res = await api("PUT", "/api/org/features/qa.flags", { enabled: true, roles: { Scheduler: true } }, lisaCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("refuses to switch off a spine feature but allows role trimming on it", async () => {
    const off = await api("PUT", "/api/org/features/audit.trail", { enabled: false }, lisaCookie);
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe("FEATURE_ALWAYS_ON");
    const trim = await api("PUT", "/api/org/features/schedule.board", { roles: { Scheduler: false } }, lisaCookie);
    expect(trim.status).toBe(200);
    expect(trim.body.orgEnabled).toBe(true);
    expect(trim.body.roles).toEqual({ Scheduler: false });
    const restore = await api("PUT", "/api/org/features/schedule.board", { roles: { Scheduler: true } }, lisaCookie);
    expect(restore.status).toBe(200);
  });

  it("lets the provider enable a feature, then the admin turn it on for a role", async () => {
    const t1 = await api("PUT", "/api/platform/features/qa.flags", { enabled: true }, superCookie);
    expect(t1.status).toBe(200);
    // Provider-enabled but not yet on for the org: the admin still cannot use it.
    let me = await api("GET", "/api/auth/me", undefined, lisaCookie);
    expect(me.body.effectiveFeatures).not.toContain("qa.flags");
    const t2 = await api("PUT", "/api/org/features/qa.flags", { enabled: true, roles: { Scheduler: true } }, lisaCookie);
    expect(t2.status).toBe(200);
    me = await api("GET", "/api/auth/me", undefined, lisaCookie);
    expect(me.body.effectiveFeatures).toContain("qa.flags");
    const badRole = await api("PUT", "/api/org/features/billing.claims", { roles: { Field_Staff: true } }, lisaCookie);
    expect(badRole.status).toBe(409);
    expect(badRole.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  it("lets the admin create an employee whose access follows the role grants", async () => {
    const created = await api(
      "POST",
      "/api/org/users",
      { email: "sam.scheduler@durablelifeskills.com", fullName: "Sam Scheduler", role: "Scheduler", password: "Scheduler-2026" },
      lisaCookie
    );
    expect(created.status).toBe(201);
    expect(created.body.temporaryPassword).toBeNull();
    schedulerId = created.body.user.id;
    const res = await login("sam.scheduler@durablelifeskills.com", "Scheduler-2026");
    expect(res.status).toBe(200);
    schedulerCookie = res.cookie!;
    const me = await api("GET", "/api/auth/me", undefined, schedulerCookie);
    expect(me.body.effectiveUser.role).toBe("Scheduler");
    expect(me.body.effectiveFeatures).toContain("qa.flags");
    expect(me.body.effectiveFeatures).toContain("clients.core");
    expect(me.body.effectiveFeatures).not.toContain("billing.claims");
    // Employees cannot touch the switchboard or accounts.
    expect((await api("PUT", "/api/org/features/qa.flags", { enabled: false }, schedulerCookie)).status).toBe(403);
    expect((await api("GET", "/api/org/users", undefined, schedulerCookie)).status).toBe(403);

    // Revoking the role grant takes effect on the next request.
    await api("PUT", "/api/org/features/qa.flags", { roles: { Scheduler: false } }, lisaCookie);
    const after = await api("GET", "/api/auth/me", undefined, schedulerCookie);
    expect(after.body.effectiveFeatures).not.toContain("qa.flags");
  });

  it("keeps the hierarchy: an admin cannot create a super admin or touch another org", async () => {
    const res = await api("POST", "/api/org/users", { email: "evil@example.com", fullName: "Evil", role: "Super_Admin" }, lisaCookie);
    expect(res.status).toBe(400);
    const other = await api("POST", "/api/platform/organizations", { name: "Other Agency" }, superCookie);
    expect(other.status).toBe(201);
    const otherAdmin = await api(
      "POST",
      "/api/platform/users",
      { orgId: other.body.organization.id, email: "owner@other.example", fullName: "Other Owner", role: "Admin" },
      superCookie
    );
    expect(otherAdmin.status).toBe(201);
    const cross = await api("PATCH", `/api/org/users/${otherAdmin.body.user.id}`, { status: "Suspended" }, lisaCookie);
    expect(cross.status).toBe(404);
    const self = await api("PATCH", `/api/org/users/${lisaId}`, { role: "Scheduler" }, lisaCookie);
    expect(self.status).toBe(400);
  });

  it("refuses a provider support session until the organization opens a window", async () => {
    // Lisa has signed in, so this organization has taken delivery of itself:
    // the hand-over exception is closed and a window is now required.
    const denied = await api("POST", "/api/auth/impersonate", { userId: lisaId }, superCookie);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("NO_SUPPORT_WINDOW");
    expect(denied.body.error.message).toContain("Settings");
    expect((await api("GET", "/api/auth/me", undefined, superCookie)).body.impersonating).toBe(false);

    // Asking is all the provider can do on its own.
    const request = await api(
      "POST",
      "/api/platform/support-windows/request",
      { orgId, reason: "Investigating the billing export" },
      superCookie
    );
    expect(request.status).toBe(200);
    expect(request.body.adminsNotified).toBe(1);

    // An employee cannot open the door for the provider.
    expect(
      (await api("POST", "/api/org/support-windows", { reason: "Let them in", hours: 2 }, schedulerCookie)).status
    ).toBe(403);
  });

  it("supports view-as for the super admin and the admin, with audit attribution", async () => {
    const granted = await api(
      "POST",
      "/api/org/support-windows",
      { reason: "Help with the billing export", hours: 2 },
      lisaCookie
    );
    expect(granted.status).toBe(201);
    supportWindowId = granted.body.window.id;
    expect(granted.body.window.hours).toBe(2);

    const start = await api("POST", "/api/auth/impersonate", { userId: lisaId }, superCookie);
    expect(start.status).toBe(200);
    expect(start.body.supportWindowExpiresAt).toEqual(expect.any(String));
    let me = await api("GET", "/api/auth/me", undefined, superCookie);
    expect(me.body.impersonating).toBe(true);
    expect(me.body.realUser.role).toBe("Super_Admin");
    expect(me.body.effectiveUser.id).toBe(lisaId);
    expect(me.body.organization.id).toBe(orgId);
    // While viewing as Lisa the provider sees her switchboard, not the platform one.
    expect((await api("GET", "/api/platform/features", undefined, superCookie)).status).toBe(403);
    const toggled = await api("PUT", "/api/org/features/reports.utilization", { enabled: false }, superCookie);
    expect(toggled.status).toBe(200);
    const stop = await api("DELETE", "/api/auth/impersonate", undefined, superCookie);
    expect(stop.status).toBe(200);
    me = await api("GET", "/api/auth/me", undefined, superCookie);
    expect(me.body.impersonating).toBe(false);

    const audit = await api("GET", "/api/platform/audit?limit=20", undefined, superCookie);
    const row = audit.body.entries.find((e: any) => e.action === "org.feature_updated" && e.targetId === "reports.utilization");
    expect(row.actorName).toBe("Clarence Williams");
    expect(row.impersonatingName).toBe("Lisa Torres");
    const startRow = audit.body.entries.find((e: any) => e.action === "auth.impersonation_started");
    expect(startRow.details.supportWindowId).toBe(supportWindowId);
    expect(startRow.details.viaHandoverException).toBe(false);

    // Admin may view as her own employee, never upward or across orgs. An
    // Admin needs no window: it is her own organization.
    expect((await api("POST", "/api/auth/impersonate", { userId: schedulerId }, lisaCookie)).status).toBe(200);
    me = await api("GET", "/api/auth/me", undefined, lisaCookie);
    expect(me.body.effectiveUser.role).toBe("Scheduler");
    expect((await api("GET", "/api/org/users", undefined, lisaCookie)).status).toBe(403);
    expect((await api("DELETE", "/api/auth/impersonate", undefined, lisaCookie)).status).toBe(200);
    expect((await api("POST", "/api/auth/impersonate", { userId: me.body.realUser.id }, schedulerCookie)).status).toBe(403);
    expect((await api("POST", "/api/auth/impersonate", { userId: schedulerId }, schedulerCookie)).status).toBe(403);
  });

  it("closes the window on request, and the provider is locked out again", async () => {
    const windows = await api("GET", "/api/org/support-windows", undefined, lisaCookie);
    expect(windows.status).toBe(200);
    expect(windows.body.maxHours).toBe(8);
    const open = windows.body.windows.find((w: any) => w.id === supportWindowId);
    expect(open.active).toBe(true);
    expect(open.grantedByName).toBe("Lisa Torres");
    expect(open.reason).toBe("Help with the billing export");

    const revoked = await api("DELETE", `/api/org/support-windows/${supportWindowId}`, undefined, lisaCookie);
    expect(revoked.status).toBe(200);
    expect((await api("DELETE", `/api/org/support-windows/${supportWindowId}`, undefined, lisaCookie)).status).toBe(409);

    const denied = await api("POST", "/api/auth/impersonate", { userId: lisaId }, superCookie);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("NO_SUPPORT_WINDOW");

    const audit = await api("GET", "/api/platform/audit?category=support", undefined, superCookie);
    expect(audit.body.entries.map((e: any) => e.action)).toEqual(
      expect.arrayContaining(["support.window_granted", "support.window_revoked", "support.window_requested"])
    );
  });

  it("lets the provider in without a window only before the hand-over is complete", async () => {
    // "Other Agency" has an Admin who has never signed in, so there is nobody
    // who could grant a window — and no client records to protect yet.
    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    const other = orgs.body.organizations.find((o: any) => o.name === "Other Agency");
    const otherAdmin = other.users.find((u: any) => u.role === "Admin");
    expect(otherAdmin.lastLoginAt).toBeNull();

    const start = await api("POST", "/api/auth/impersonate", { userId: otherAdmin.id }, superCookie);
    expect(start.status).toBe(200);
    expect(start.body.supportWindowExpiresAt).toBeNull();
    await api("DELETE", "/api/auth/impersonate", undefined, superCookie);

    const audit = await api("GET", "/api/platform/audit?action=auth.impersonation_started", undefined, superCookie);
    expect(audit.body.entries[0].details.viaHandoverException).toBe(true);
  });

  it("suspending an account ends its sessions and blocks sign-in", async () => {
    const res = await api("PATCH", `/api/org/users/${schedulerId}`, { status: "Suspended" }, lisaCookie);
    expect(res.status).toBe(200);
    expect((await api("GET", "/api/auth/me", undefined, schedulerCookie)).status).toBe(401);
    const again = await login("sam.scheduler@durablelifeskills.com", "Scheduler-2026");
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe("ACCOUNT_SUSPENDED");
    await api("PATCH", `/api/org/users/${schedulerId}`, { status: "Active" }, lisaCookie);
  });

  it("resets a password to a one-time value the admin can hand over", async () => {
    const res = await api("POST", `/api/org/users/${schedulerId}/reset-password`, {}, lisaCookie);
    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toMatch(/^[A-Za-z0-9]{14}$/);
    expect((await login("sam.scheduler@durablelifeskills.com", "Scheduler-2026")).status).toBe(401);
    const ok = await login("sam.scheduler@durablelifeskills.com", res.body.temporaryPassword);
    expect(ok.status).toBe(200);
    expect(ok.body.mustChangePassword).toBe(true);
  });

  // ── the provider console beyond the switchboard ───────────────────────
  let opsId: string;

  it("keeps the provider console closed to organization admins", async () => {
    for (const path of ["/api/platform/overview", "/api/platform/adoption", "/api/platform/sessions", "/api/platform/system", "/api/platform/audit"]) {
      expect((await api("GET", path, undefined, lisaCookie)).status).toBe(403);
    }
    expect((await api("DELETE", `/api/platform/users/${schedulerId}/sessions`, undefined, lisaCookie)).status).toBe(403);
  });

  it("summarizes the platform on the overview and flags what needs attention", async () => {
    const empty = await api("POST", "/api/platform/organizations", { name: "Empty Agency" }, superCookie);
    expect(empty.status).toBe(201);
    const res = await api("GET", "/api/platform/overview", undefined, superCookie);
    expect(res.status).toBe(200);
    expect(res.body.organizations).toEqual({ total: 3, active: 3, suspended: 0, decommissioned: 0 });
    expect(res.body.accounts.platform).toBe(1);
    expect(res.body.accounts.byRole.Admin).toBe(2); // Lisa and Other Owner
    expect(res.body.accounts.byRole.Scheduler).toBe(1); // Sam
    expect(res.body.features.total).toBeGreaterThan(0);
    expect(res.body.features.available).toBeGreaterThan(0);
    expect(res.body.activity.signInsLast7Days).toBeGreaterThan(0);
    expect(res.body.activity.supportSessionsLast30Days).toBeGreaterThanOrEqual(2);
    const kinds: string[] = res.body.attention.map((a: any) => a.kind);
    expect(kinds).toContain("org_no_admin"); // Empty Agency
    expect(kinds).toContain("org_admin_not_signed_in"); // Other Owner has never signed in
    expect(kinds).toContain("single_platform_account");
    expect(kinds).toContain("preview_features_available"); // qa.flags was made available above
    const noAdmin = res.body.attention.find((a: any) => a.kind === "org_no_admin");
    expect(noAdmin.severity).toBe("warning");
    expect(noAdmin.message).toContain("Empty Agency");
    expect(noAdmin.href).toBe("/admin/platform/organizations");
  });

  it("shows feature adoption for every organization", async () => {
    const res = await api("GET", "/api/platform/adoption", undefined, superCookie);
    expect(res.status).toBe(200);
    expect(res.body.organizations).toHaveLength(3);
    const dls = res.body.organizations.find((o: any) => o.id === orgId);
    const qa = dls.features.find((f: any) => f.key === "qa.flags");
    expect(qa).toEqual({ key: "qa.flags", platformEnabled: true, orgEnabled: true, roles: { Scheduler: false } });
    const reports = dls.features.find((f: any) => f.key === "reports.utilization");
    expect(reports.orgEnabled).toBe(false); // switched off while viewing as Lisa
    const other = res.body.organizations.find((o: any) => o.name === "Other Agency");
    expect(other.features.find((f: any) => f.key === "qa.flags").orgEnabled).toBe(false); // never turned on there
  });

  it("lists live sessions and lets the provider end one or sign a person out everywhere", async () => {
    const created = await api(
      "POST",
      "/api/platform/users",
      { orgId, email: "ops.olive@durablelifeskills.com", fullName: "Ops Olive", role: "Scheduler", password: "Olive-2026-ok" },
      superCookie
    );
    expect(created.status).toBe(201);
    opsId = created.body.user.id;
    const first = await login("ops.olive@durablelifeskills.com", "Olive-2026-ok");
    const second = await login("ops.olive@durablelifeskills.com", "Olive-2026-ok");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const list = await api("GET", "/api/platform/sessions", undefined, superCookie);
    expect(list.status).toBe(200);
    const olive = list.body.sessions.filter((s: any) => s.userId === opsId);
    expect(olive).toHaveLength(2);
    expect(olive[0].userName).toBe("Ops Olive");
    expect(olive[0].orgId).toBe(orgId);
    expect(olive[0].orgName).toBe("Durable Life Skills, Inc.");
    expect(olive[0].impersonatingUserId).toBeNull();
    const own = list.body.sessions.find((s: any) => s.current);
    expect(own.userEmail).toBe("emailme@clarencewilliams.com");
    expect(own.orgName).toBeNull();

    // Ending one session leaves the other device signed in.
    expect((await api("DELETE", `/api/platform/sessions/${olive[0].id}`, undefined, superCookie)).status).toBe(200);
    const after = await Promise.all([first.cookie!, second.cookie!].map((c) => api("GET", "/api/auth/me", undefined, c).then((r) => r.status)));
    expect(after.sort()).toEqual([200, 401]);
    expect((await api("DELETE", `/api/platform/sessions/${olive[0].id}`, undefined, superCookie)).status).toBe(404);

    // The provider's own session is not ended from here.
    expect((await api("DELETE", `/api/platform/sessions/${own.id}`, undefined, superCookie)).status).toBe(400);
    expect((await api("DELETE", `/api/platform/users/${own.userId}/sessions`, undefined, superCookie)).status).toBe(400);

    // "Sign out everywhere" ends what is left and is audited with the count.
    const all = await api("DELETE", `/api/platform/users/${opsId}/sessions`, undefined, superCookie);
    expect(all.status).toBe(200);
    expect(all.body.revoked).toBe(1);
    const gone = await Promise.all([first.cookie!, second.cookie!].map((c) => api("GET", "/api/auth/me", undefined, c).then((r) => r.status)));
    expect(gone).toEqual([401, 401]);

    const sessionAudit = await api("GET", "/api/platform/audit?category=session", undefined, superCookie);
    expect(sessionAudit.body.entries.length).toBeGreaterThan(0);
    expect(sessionAudit.body.entries.every((e: any) => e.action.startsWith("session."))).toBe(true);
    expect(sessionAudit.body.entries.some((e: any) => e.action === "session.revoked" && e.details.userId === opsId)).toBe(true);
    const userAudit = await api("GET", "/api/platform/audit?action=user.sessions_revoked", undefined, superCookie);
    expect(userAudit.body.entries[0].targetId).toBe(opsId);
    expect(userAudit.body.entries[0].details.revoked).toBe(1);
    expect(userAudit.body.entries[0].actorName).toBe("Clarence Williams");
  });

  it("filters the platform audit log", async () => {
    const platform = await api("GET", "/api/platform/audit?category=platform&limit=50", undefined, superCookie);
    expect(platform.status).toBe(200);
    expect(platform.body.entries.length).toBeGreaterThan(0);
    expect(platform.body.entries.every((e: any) => e.action.startsWith("platform."))).toBe(true);

    const scoped = await api("GET", `/api/platform/audit?orgId=${orgId}&category=user`, undefined, superCookie);
    expect(scoped.body.entries.length).toBeGreaterThan(0);
    expect(scoped.body.entries.every((e: any) => e.orgId === orgId && e.action.startsWith("user."))).toBe(true);
    expect(scoped.body.entries[0].orgName).toBe("Durable Life Skills, Inc.");

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const future = await api("GET", `/api/platform/audit?since=${encodeURIComponent(tomorrow)}`, undefined, superCookie);
    expect(future.body.entries).toHaveLength(0);

    const pair = await api("GET", "/api/platform/audit?action=auth.impersonation_started,auth.impersonation_stopped", undefined, superCookie);
    expect(pair.body.entries.length).toBeGreaterThanOrEqual(2);
    expect(new Set(pair.body.entries.map((e: any) => e.action))).toEqual(new Set(["auth.impersonation_started", "auth.impersonation_stopped"]));

    expect((await api("GET", "/api/platform/audit?category=nope", undefined, superCookie)).status).toBe(400);
    expect((await api("GET", "/api/platform/audit?limit=abc", undefined, superCookie)).status).toBe(200);
  });

  it("reports system status without leaking secrets", async () => {
    const res = await api("GET", "/api/platform/system", undefined, superCookie);
    expect(res.status).toBe(200);
    expect(res.body.database.ok).toBe(true);
    expect(res.body.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.body.database.serverVersion).toMatch(/^\d+/);
    expect(res.body.database.migrations.total).toBeGreaterThan(0);
    expect(res.body.database.migrations.applied).toBe(res.body.database.migrations.total);
    expect(res.body.database.migrations.pending).toEqual([]);
    expect(res.body.database.migrations.latestApplied.tag).toMatch(/^\d{4}_/);
    expect(res.body.signIn.loginMaxFailures).toBe(3);
    expect(res.body.signIn.loginWindowMinutes).toBe(15);
    expect(res.body.provider.superAdminEmail).toBe("emailme@clarencewilliams.com");
    expect(res.body.provider.platformAccounts).toBe(1);
    expect(res.body.catalog.requirements).toBeGreaterThan(0);
    expect(res.body.catalog.features).toBeGreaterThan(res.body.catalog.featuresAvailable);
    expect(JSON.stringify(res.body)).not.toContain("Success2026");
    expect(res.body.provider).not.toHaveProperty("superAdminPassword");
    expect(res.body.warnings.some((w: any) => w.message.includes("Only one provider account"))).toBe(true);
  });

  // ── hardening: sign-in records, second factor, invitations ────────────
  it("records a failed sign-in against the account, but never names an unknown address", async () => {
    const before = await api("GET", "/api/platform/audit?action=auth.login_failed&limit=50", undefined, superCookie);
    expect((await login("lisa.torres@durablelifeskills.com", "definitely-wrong-1")).status).toBe(401);
    expect((await login("ghost@nowhere.example", "definitely-wrong-1")).status).toBe(401);

    const after = await api("GET", "/api/platform/audit?action=auth.login_failed&limit=50", undefined, superCookie);
    expect(after.body.entries.length).toBe(before.body.entries.length + 1);
    const entry = after.body.entries[0];
    expect(entry.targetId).toBe(lisaId);
    expect(entry.details.reason).toBe("invalid_password");
    // The miss is counted for the limiter but never written to the audit log.
    expect(JSON.stringify(after.body.entries)).not.toContain("ghost@nowhere.example");
  });

  it("enrols a second factor and then requires it at sign-in", async () => {
    const created = await api(
      "POST",
      "/api/org/users",
      { email: "mia.mfa@durablelifeskills.com", fullName: "Mia Mfa", role: "Scheduler", password: "Mia-2026-ok" },
      lisaCookie
    );
    expect(created.status).toBe(201);
    const first = await login("mia.mfa@durablelifeskills.com", "Mia-2026-ok");
    expect(first.status).toBe(200);
    let miaCookie = first.cookie!;

    const setup = await api("POST", "/api/auth/totp/setup", {}, miaCookie);
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.uri).toContain("otpauth://totp/");
    const secret: string = setup.body.secret;

    // A wrong code does not finish enrolment.
    expect((await api("POST", "/api/auth/totp/enable", { code: "000000" }, miaCookie)).status).toBe(400);
    const enabled = await api("POST", "/api/auth/totp/enable", { code: totpCodeNow(secret) }, miaCookie);
    expect(enabled.status).toBe(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);
    const recoveryCodes: string[] = enabled.body.recoveryCodes;
    expect((await api("GET", "/api/auth/me", undefined, miaCookie)).body.mfa.enabled).toBe(true);

    // From now on the password alone only gets a half-finished sign-in.
    const step1 = await login("mia.mfa@durablelifeskills.com", "Mia-2026-ok");
    expect(step1.status).toBe(200);
    expect(step1.cookie).toBeNull();
    expect(step1.body.mfaRequired).toBe(true);
    expect(step1.body.mfaToken).toEqual(expect.any(String));

    expect((await api("POST", "/api/auth/login/mfa", { mfaToken: step1.body.mfaToken, code: "000000" })).status).toBe(401);
    const code = totpCodeNow(secret);
    const step2 = await api("POST", "/api/auth/login/mfa", { mfaToken: step1.body.mfaToken, code });
    expect(step2.status).toBe(200);
    expect(step2.cookie).toMatch(/^dls_session=/);
    miaCookie = step2.cookie!;
    // The handle is single-use.
    expect((await api("POST", "/api/auth/login/mfa", { mfaToken: step1.body.mfaToken, code: totpCodeNow(secret) })).status).toBe(401);

    // The same code cannot be used for a second sign-in, even though it is
    // still inside its 30-second window.
    const replay = await login("mia.mfa@durablelifeskills.com", "Mia-2026-ok");
    expect((await api("POST", "/api/auth/login/mfa", { mfaToken: replay.body.mfaToken, code })).status).toBe(401);

    // A recovery code works once, and only once.
    const viaRecovery = await login("mia.mfa@durablelifeskills.com", "Mia-2026-ok");
    const recovered = await api("POST", "/api/auth/login/mfa", {
      mfaToken: viaRecovery.body.mfaToken,
      recoveryCode: recoveryCodes[0],
    });
    expect(recovered.status).toBe(200);
    expect(recovered.body.usedRecoveryCode).toBe(true);
    expect(recovered.body.remainingRecoveryCodes).toBe(9);
    const again = await login("mia.mfa@durablelifeskills.com", "Mia-2026-ok");
    expect((await api("POST", "/api/auth/login/mfa", { mfaToken: again.body.mfaToken, recoveryCode: recoveryCodes[0] })).status).toBe(401);

    // Turning it off needs the password, not just the session.
    expect((await api("DELETE", "/api/auth/totp", { currentPassword: "wrong-password-1" }, miaCookie)).status).toBe(400);
    expect((await api("DELETE", "/api/auth/totp", { currentPassword: "Mia-2026-ok" }, miaCookie)).status).toBe(200);
    expect((await login("mia.mfa@durablelifeskills.com", "Mia-2026-ok")).cookie).toMatch(/^dls_session=/);
  });

  it("invites a new account by email and lets them set their own password", async () => {
    const created = await api(
      "POST",
      "/api/org/users",
      { email: "ivy.invite@durablelifeskills.com", fullName: "Ivy Invite", role: "Field_Staff" },
      lisaCookie
    );
    expect(created.status).toBe(201);
    expect(created.body.invite.sentTo).toBe("ivy.invite@durablelifeskills.com");
    // The one-time password is still issued as the fallback for a deployment
    // with no mail provider.
    expect(created.body.temporaryPassword).toEqual(expect.any(String));

    const invite = mailOf("account.invite").at(-1)!;
    expect(invite.to).toBe("ivy.invite@durablelifeskills.com");
    expect(invite.from).toBe("noreply@durablelifeskills.com");
    expect(invite.message.subject).toContain("Durable Life Skills");
    const token = tokenIn(invite.message.text);
    expect(token).toEqual(expect.any(String));

    const peek = await api("GET", `/api/auth/token/invite/${token}`);
    expect(peek.status).toBe(200);
    expect(peek.body.fullName).toBe("Ivy Invite");

    expect((await api("POST", "/api/auth/accept-invite", { token, password: "short1" })).status).toBe(400);
    const accepted = await api("POST", "/api/auth/accept-invite", { token, password: "Ivy-Invite-2026" });
    expect(accepted.status).toBe(200);
    expect(accepted.cookie).toMatch(/^dls_session=/);
    expect(accepted.body.mustChangePassword).toBe(false);
    // The link cannot be used twice, and the one-time password is now dead.
    expect((await api("POST", "/api/auth/accept-invite", { token, password: "Ivy-Invite-2026" })).status).toBe(400);
    expect((await api("GET", `/api/auth/token/invite/${token}`)).status).toBe(400);
    expect((await login("ivy.invite@durablelifeskills.com", created.body.temporaryPassword)).status).toBe(401);
    expect((await login("ivy.invite@durablelifeskills.com", "Ivy-Invite-2026")).status).toBe(200);
  });

  it("answers a forgotten password the same way whether or not the address exists", async () => {
    const known = await api("POST", "/api/auth/forgot-password", { email: "ivy.invite@durablelifeskills.com" });
    const unknown = await api("POST", "/api/auth/forgot-password", { email: "nobody-at-all@example.test" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    const reset = mailOf("account.password_reset").at(-1)!;
    expect(reset.to).toBe("ivy.invite@durablelifeskills.com");
    const token = tokenIn(reset.message.text);
    const done = await api("POST", "/api/auth/reset-password", { token, password: "Ivy-Reset-2026" });
    expect(done.status).toBe(200);
    expect((await login("ivy.invite@durablelifeskills.com", "Ivy-Invite-2026")).status).toBe(401);
    expect((await login("ivy.invite@durablelifeskills.com", "Ivy-Reset-2026")).status).toBe(200);
  });

  // ── hardening: the support role ───────────────────────────────────────
  it("cuts a support account that can read the console but change nothing", async () => {
    const created = await api(
      "POST",
      "/api/platform/provider-users",
      { email: "sasha.support@agilityengineers.com", fullName: "Sasha Support", password: "Sasha-2026-ok" },
      superCookie
    );
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe("Platform_Support");
    expect(created.body.user.orgId).toBeNull();

    const signIn = await login("sasha.support@agilityengineers.com", "Sasha-2026-ok");
    expect(signIn.status).toBe(200);
    const supportCookie = signIn.cookie!;

    // Reads the console.
    for (const path of ["/api/platform/overview", "/api/platform/organizations", "/api/platform/sessions", "/api/platform/audit", "/api/platform/system"]) {
      expect((await api("GET", path, undefined, supportCookie)).status).toBe(200);
    }
    // Changes nothing.
    expect((await api("PUT", "/api/platform/features/qa.flags", { enabled: false }, supportCookie)).status).toBe(403);
    expect((await api("POST", "/api/platform/organizations", { name: "Sneaky Agency" }, supportCookie)).status).toBe(403);
    expect(
      (await api("POST", "/api/platform/users", { orgId, email: "x@y.example", fullName: "X", role: "Admin" }, supportCookie)).status
    ).toBe(403);
    expect((await api("POST", `/api/platform/users/${schedulerId}/reset-password`, {}, supportCookie)).status).toBe(403);
    expect(
      (await api("POST", "/api/platform/provider-users", { email: "more@support.example", fullName: "More" }, supportCookie)).status
    ).toBe(403);
    // Support cannot view as anyone without a window either, and never upward.
    expect((await api("POST", "/api/auth/impersonate", { userId: lisaId }, supportCookie)).body.error.code).toBe("NO_SUPPORT_WINDOW");

    // The Super Admin can suspend the support account it cut.
    expect((await api("PATCH", `/api/platform/users/${created.body.user.id}`, { status: "Suspended" }, superCookie)).status).toBe(200);
    expect((await api("GET", "/api/auth/me", undefined, supportCookie)).status).toBe(401);
  });

  // ── hardening: an organization's middle and end ───────────────────────
  it("records the contract, then decommissions an organization for good reason", async () => {
    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    const target = orgs.body.organizations.find((o: any) => o.name === "Empty Agency");

    const patched = await api(
      "PATCH",
      `/api/platform/organizations/${target.id}`,
      {
        primaryContactName: "Dana Owner",
        primaryContactEmail: "dana@empty.example",
        baaSignedOn: "2026-01-15",
        baaExpiresOn: "2027-01-15",
        timeZone: "America/Denver",
        contractNotes: "Pilot agreement, renews yearly.",
      },
      superCookie
    );
    expect(patched.status).toBe(200);
    expect(
      (await api("PATCH", `/api/platform/organizations/${target.id}`, { baaSignedOn: "2026-06-01", baaExpiresOn: "2026-01-01" }, superCookie))
        .status
    ).toBe(400);

    const exported = await api("GET", `/api/platform/organizations/${target.id}/export`, undefined, superCookie);
    expect(exported.status).toBe(200);
    expect(exported.body.organization.slug).toBe(target.slug);
    expect(exported.body.organization.primaryContactEmail).toBe("dana@empty.example");
    expect(Array.isArray(exported.body.features)).toBe(true);
    expect(Array.isArray(exported.body.auditLog)).toBe(true);
    // Nothing that could be replayed as a credential leaves the building.
    expect(JSON.stringify(exported.body)).not.toContain("passwordHash");
    expect(JSON.stringify(exported.body)).not.toContain("scrypt$");

    // Closing down needs the slug typed and a reason given.
    expect((await api("POST", `/api/platform/organizations/${target.id}/decommission`, { confirmSlug: "wrong", reason: "Contract ended" }, superCookie)).status).toBe(400);
    const done = await api(
      "POST",
      `/api/platform/organizations/${target.id}/decommission`,
      { confirmSlug: target.slug, reason: "Pilot finished; data exported 2026-09-12" },
      superCookie
    );
    expect(done.status).toBe(200);
    const after = await api("GET", "/api/platform/organizations", undefined, superCookie);
    const closed = after.body.organizations.find((o: any) => o.id === target.id);
    expect(closed.status).toBe("decommissioned");
    expect(closed.decommissionReason).toContain("Pilot finished");
    expect((await api("POST", `/api/platform/organizations/${target.id}/decommission`, { confirmSlug: target.slug, reason: "again" }, superCookie)).status).toBe(409);
  });

  // ── hardening: audit chain, jobs and mail ─────────────────────────────
  it("verifies the audit chain and exports it", async () => {
    const verify = await api("GET", "/api/platform/audit/verify", undefined, superCookie);
    expect(verify.status).toBe(200);
    expect(verify.body.ok).toBe(true);
    expect(verify.body.checked).toBeGreaterThan(10);
    expect(verify.body.firstBadSeq).toBeNull();
    expect(verify.body.lastHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verify.body.retentionYears).toBe(6);

    const csv = await fetch(`${base}/api/platform/audit/export?category=support`, { headers: { cookie: superCookie } });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\n")[0]).toBe("seq,when,actor,acting_as,action,organization,target_type,target_id,details,ip,hash");
    expect(text).toContain("support.window_granted");
    // The export is itself an event worth recording.
    const audit = await api("GET", "/api/platform/audit?action=platform.audit_exported", undefined, superCookie);
    expect(audit.body.entries[0].details.rows).toBeGreaterThan(0);
  });

  it("runs a maintenance job on demand and remembers that it ran", async () => {
    const before = await api("GET", "/api/platform/jobs", undefined, superCookie);
    expect(before.status).toBe(200);
    expect(before.body.jobs.length).toBeGreaterThan(4);
    expect(before.body.externalCronConfigured).toBe(true);
    expect(before.body.jobs.every((j: any) => j.lastRun === null)).toBe(true);

    const run = await api("POST", "/api/platform/jobs/audit.verify_chain/run", {}, superCookie);
    expect(run.status).toBe(200);
    expect(run.body.ok).toBe(true);
    expect(run.body.items).toBeGreaterThan(0);

    const after = await api("GET", "/api/platform/jobs", undefined, superCookie);
    const verified = after.body.jobs.find((j: any) => j.name === "audit.verify_chain");
    expect(verified.lastRun.ok).toBe(true);
    expect(verified.lastRun.trigger).toBe("manual");
    expect((await api("POST", "/api/platform/jobs/nope.not.a.job/run", {}, superCookie)).status).toBe(404);

    // An external cron drives the same jobs with the shared secret.
    const denied = await fetch(`${base}/api/jobs/sessions.prune/run`, { method: "POST", headers: { "x-cron-secret": "wrong" } });
    expect(denied.status).toBe(403);
    const allowed = await fetch(`${base}/api/jobs/sessions.prune/run`, {
      method: "POST",
      headers: { "x-cron-secret": "cron-secret-for-tests" },
    });
    expect(allowed.status).toBe(200);
    expect(((await allowed.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("shows what the system tried to send, subjects only", async () => {
    const res = await api("GET", "/api/platform/mail?limit=100", undefined, superCookie);
    expect(res.status).toBe(200);
    const kinds = res.body.messages.map((m: any) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining(["account.invite", "account.password_reset", "support.window_requested"]));
    const invite = res.body.messages.find((m: any) => m.kind === "account.invite");
    expect(invite.sender).toBe("noreply");
    expect(invite.status).toBe("sent");
    // A body would eventually carry a name; only the subject is kept.
    expect(Object.keys(invite)).not.toContain("body");
    expect(JSON.stringify(res.body)).not.toContain("set-password?token=");
  });

  it("reports readiness for an uptime check", async () => {
    const ready = await fetch(`${base}/api/readyz`);
    expect(ready.status).toBe(200);
    const body = (await ready.json()) as { status: string; database: { ok: boolean }; migrations: { pending: string[] } };
    expect(body.status).toBe("ready");
    expect(body.database.ok).toBe(true);
    expect(body.migrations.pending).toEqual([]);
    // The shallow check stays cheap and needs no session.
    const shallow = (await (await fetch(`${base}/api/healthz`)).json()) as { status: string };
    expect(shallow.status).toBe("ok");
  });

  it("rate-limits repeated failures per email and address", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await login("nobody@example.com", "wrong-password-1")).status).toBe(401);
    }
    const limited = await login("nobody@example.com", "wrong-password-1");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });

  it("signs out", async () => {
    expect((await api("POST", "/api/auth/logout", undefined, lisaCookie)).status).toBe(200);
    expect((await api("GET", "/api/auth/me", undefined, lisaCookie)).status).toBe(401);
  });
});
