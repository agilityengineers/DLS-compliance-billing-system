// artifacts/api-server/src/__tests__/platform-org-features.test.ts — tier 1
// for one organization, over HTTP against a real PostgreSQL (TEST_DATABASE_URL).
//
// The switchboard is what every organization follows. This suite proves the
// Super Admin can make a capability available to one organization only, or
// withhold it from one while the rest keep it, that the organization's own
// tier-2 switch still applies on top, that removing the override puts the
// organization back on the switchboard, and that every change is audited
// against the organization it concerns.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DbHandle } from "@workspace/db";
import { createApp } from "../app";
import { bootstrapPlatform } from "../lib/bootstrap";
import { loadConfig } from "../lib/config";
import { Mailer, MemoryTransport } from "../lib/mail";

const TEST_URL = process.env.TEST_DATABASE_URL;

interface ApiResponse<T = any> {
  status: number;
  body: T;
  cookie: string | null;
}

describe.skipIf(!TEST_URL)("per-organization feature switches", () => {
  let handle: DbHandle;
  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  const config = loadConfig({
    NODE_ENV: "test",
    SUPER_ADMIN_PASSWORD: "Setup-Owner-2026",
    APP_BASE_URL: "https://portal.example.test",
    CRON_SECRET: "cron-secret-for-tests",
  });

  let superCookie: string;
  let firstOrgId: string;
  let secondOrgId: string;
  let firstAdminCookie: string;
  let secondAdminCookie: string;

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

  async function createAdmin(orgId: string, email: string): Promise<string> {
    const created = await api("POST", "/api/platform/users", { orgId, email, fullName: "An Admin", role: "Admin" }, superCookie);
    expect(created.status).toBe(201);
    const temporaryPassword = created.body.temporaryPassword as string;
    const first = await api("POST", "/api/auth/login", { email, password: temporaryPassword });
    expect(first.status).toBe(200);
    const changed = await api("POST", "/api/auth/change-password", { currentPassword: temporaryPassword, newPassword: "Admin-2026-ok!" }, first.cookie);
    expect(changed.status).toBe(200);
    return changed.cookie ?? first.cookie!;
  }

  /** What one organization's Admin sees for a feature: both tiers and whether they may use it. */
  async function seenBy(cookie: string, key: string) {
    const me = await api("GET", "/api/auth/me", undefined, cookie);
    expect(me.status).toBe(200);
    const state = (me.body.features as any[]).find((f) => f.key === key);
    return { state, usable: (me.body.effectiveFeatures as string[]).includes(key) };
  }

  beforeAll(async () => {
    handle = createDb(TEST_URL!);
    await handle.db.execute(sql`drop schema public cascade; drop schema if exists drizzle cascade; create schema public;`);
    await runMigrations(handle.db);
    await bootstrapPlatform(handle.db, config);
    const app = createApp({ db: handle.db, config, quiet: true, mailer: new Mailer(handle.db, config, new MemoryTransport()) });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const superLogin = await api("POST", "/api/auth/login", { email: config.superAdminEmail, password: "Setup-Owner-2026" });
    expect(superLogin.status).toBe(200);
    const rotated = await api(
      "POST",
      "/api/auth/change-password",
      { currentPassword: "Setup-Owner-2026", newPassword: "Owner-Switches-2026" },
      superLogin.cookie
    );
    expect(rotated.status).toBe(200);
    superCookie = rotated.cookie!;

    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    firstOrgId = orgs.body.organizations[0].id;
    const second = await api("POST", "/api/platform/organizations", { name: "Second Agency", slug: "second-agency" }, superCookie);
    expect(second.status).toBe(201);
    secondOrgId = second.body.organization.id;

    firstAdminCookie = await createAdmin(firstOrgId, "admin.one@example.test");
    secondAdminCookie = await createAdmin(secondOrgId, "admin.two@example.test");
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await handle.pool.end();
  });

  it("starts every organization on the switchboard", async () => {
    // qa.flags is off at launch, so nobody has it and nobody has an override.
    for (const cookie of [firstAdminCookie, secondAdminCookie]) {
      const { state, usable } = await seenBy(cookie, "qa.flags");
      expect(state.platformEnabled).toBe(false);
      expect(state.platformDefault).toBe(false);
      expect(state.platformOverride).toBeNull();
      expect(usable).toBe(false);
    }
  });

  it("makes a capability available to one organization only", async () => {
    const res = await api("PUT", `/api/platform/organizations/${firstOrgId}/features/qa.flags`, { enabled: true }, superCookie);
    expect(res.status).toBe(200);
    expect(res.body.state).toMatchObject({ key: "qa.flags", platformEnabled: true, platformDefault: false, platformOverride: true });

    // Available to the first organization — but tier 2 is still off, so not usable yet.
    const before = await seenBy(firstAdminCookie, "qa.flags");
    expect(before.state.platformEnabled).toBe(true);
    expect(before.usable).toBe(false);
    const turnedOn = await api("PUT", "/api/org/features/qa.flags", { enabled: true }, firstAdminCookie);
    expect(turnedOn.status).toBe(200);
    expect((await seenBy(firstAdminCookie, "qa.flags")).usable).toBe(true);

    // The second organization still follows the switchboard, and its Admin cannot turn it on.
    const other = await seenBy(secondAdminCookie, "qa.flags");
    expect(other.state.platformEnabled).toBe(false);
    expect(other.state.platformOverride).toBeNull();
    const refused = await api("PUT", "/api/org/features/qa.flags", { enabled: true }, secondAdminCookie);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("withholds a capability from one organization while the rest keep it", async () => {
    // Both organizations have clients.core from the switchboard; it is spine, so it is on for both.
    expect((await seenBy(firstAdminCookie, "clients.core")).usable).toBe(true);
    expect((await seenBy(secondAdminCookie, "clients.core")).usable).toBe(true);

    const res = await api("PUT", `/api/platform/organizations/${secondOrgId}/features/clients.core`, { enabled: false }, superCookie);
    expect(res.status).toBe(200);
    expect(res.body.state).toMatchObject({ platformEnabled: false, platformDefault: true, platformOverride: false });

    const withheld = await seenBy(secondAdminCookie, "clients.core");
    expect(withheld.state.platformEnabled).toBe(false);
    expect(withheld.usable).toBe(false);
    // The route behind the feature closes with it.
    expect((await api("GET", "/api/clients", undefined, secondAdminCookie)).status).toBe(403);
    // The other organization is untouched.
    expect((await seenBy(firstAdminCookie, "clients.core")).usable).toBe(true);
    expect((await api("GET", "/api/clients", undefined, firstAdminCookie)).status).toBe(200);
  });

  it("puts an organization back on the switchboard when the override is removed", async () => {
    const res = await api("PUT", `/api/platform/organizations/${secondOrgId}/features/clients.core`, { enabled: null }, superCookie);
    expect(res.status).toBe(200);
    expect(res.body.state).toMatchObject({ platformEnabled: true, platformOverride: null });
    expect((await seenBy(secondAdminCookie, "clients.core")).usable).toBe(true);
    expect((await api("GET", "/api/clients", undefined, secondAdminCookie)).status).toBe(200);
  });

  it("keeps an override in force when the switchboard changes underneath it", async () => {
    // Switchboard on for everyone: the second organization inherits it, the first keeps its own "on".
    const flipped = await api("PUT", "/api/platform/features/qa.flags", { enabled: true }, superCookie);
    expect(flipped.status).toBe(200);
    expect((await seenBy(secondAdminCookie, "qa.flags")).state).toMatchObject({ platformEnabled: true, platformDefault: true, platformOverride: null });
    expect((await seenBy(firstAdminCookie, "qa.flags")).state).toMatchObject({ platformEnabled: true, platformDefault: true, platformOverride: true });

    // Switchboard back off: the first organization still has it by its own setting.
    expect((await api("PUT", "/api/platform/features/qa.flags", { enabled: false }, superCookie)).status).toBe(200);
    expect((await seenBy(firstAdminCookie, "qa.flags")).usable).toBe(true);
    expect((await seenBy(secondAdminCookie, "qa.flags")).state.platformEnabled).toBe(false);
  });

  it("shows the per-organization settings on the adoption matrix", async () => {
    const res = await api("GET", "/api/platform/adoption", undefined, superCookie);
    expect(res.status).toBe(200);
    const first = res.body.organizations.find((o: any) => o.id === firstOrgId);
    const second = res.body.organizations.find((o: any) => o.id === secondOrgId);
    expect(first.features.find((f: any) => f.key === "qa.flags")).toMatchObject({ platformOverride: true, platformEnabled: true });
    expect(second.features.find((f: any) => f.key === "qa.flags")).toMatchObject({ platformOverride: null, platformEnabled: false });
    expect(second.features.find((f: any) => f.key === "clients.core").platformOverride).toBeNull();
  });

  it("refuses an unknown feature or organization and an organization Admin", async () => {
    expect((await api("PUT", `/api/platform/organizations/${firstOrgId}/features/not.a.feature`, { enabled: true }, superCookie)).status).toBe(404);
    expect((await api("PUT", `/api/platform/organizations/00000000-0000-4000-8000-000000000000/features/qa.flags`, { enabled: true }, superCookie)).status).toBe(404);
    expect((await api("PUT", `/api/platform/organizations/${firstOrgId}/features/qa.flags`, { enabled: "yes" }, superCookie)).status).toBe(400);
    expect((await api("PUT", `/api/platform/organizations/${firstOrgId}/features/qa.flags`, { enabled: false }, firstAdminCookie)).status).toBe(403);
  });

  it("audits every change against the organization it concerns", async () => {
    const res = await api("GET", "/api/platform/audit?category=platform&limit=50", undefined, superCookie);
    expect(res.status).toBe(200);
    const entries = (res.body.entries as any[]).filter((e) => e.action === "platform.org_feature_toggled");
    expect(entries.length).toBeGreaterThanOrEqual(3);
    const withheld = entries.find((e) => e.orgId === secondOrgId && e.targetId === "clients.core" && e.details.enabled === false);
    expect(withheld).toBeTruthy();
    expect(withheld.details.effective).toBe(false);
    const cleared = entries.find((e) => e.orgId === secondOrgId && e.targetId === "clients.core" && e.details.enabled === null);
    expect(cleared.details.effective).toBe(true);
  });
});
