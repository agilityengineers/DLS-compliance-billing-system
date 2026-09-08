// End-to-end API tests against a real PostgreSQL (TEST_DATABASE_URL). They
// exercise the whole stack: migrations → bootstrap → login → hierarchy →
// two-tier feature switches → impersonation → audit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DbHandle } from "@workspace/db";
import { createApp } from "../app";
import { bootstrapPlatform } from "../lib/bootstrap";
import { loadConfig } from "../lib/config";

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
  const config = loadConfig({ NODE_ENV: "test", LOGIN_MAX_FAILURES: "3", LOGIN_WINDOW_MINUTES: "15" });

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
    const app = createApp({ db: handle.db, config, quiet: true });
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

  it("supports view-as for the super admin and the admin, with audit attribution", async () => {
    const start = await api("POST", "/api/auth/impersonate", { userId: lisaId }, superCookie);
    expect(start.status).toBe(200);
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

    // Admin may view as her own employee, never upward or across orgs.
    expect((await api("POST", "/api/auth/impersonate", { userId: schedulerId }, lisaCookie)).status).toBe(200);
    me = await api("GET", "/api/auth/me", undefined, lisaCookie);
    expect(me.body.effectiveUser.role).toBe("Scheduler");
    expect((await api("GET", "/api/org/users", undefined, lisaCookie)).status).toBe(403);
    expect((await api("DELETE", "/api/auth/impersonate", undefined, lisaCookie)).status).toBe(200);
    expect((await api("POST", "/api/auth/impersonate", { userId: me.body.realUser.id }, schedulerCookie)).status).toBe(403);
    expect((await api("POST", "/api/auth/impersonate", { userId: schedulerId }, schedulerCookie)).status).toBe(403);
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
