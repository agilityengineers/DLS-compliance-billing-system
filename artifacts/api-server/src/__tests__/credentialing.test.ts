// artifacts/api-server/src/__tests__/credentialing.test.ts — the credentialing
// registry over HTTP, against a real PostgreSQL (TEST_DATABASE_URL).
//
// End-to-end proof that the registry persists AND that it is not an open write
// surface: the routes run behind the same session/role gate as the rest of the
// API, so the suite signs in before it can read, and a non-Admin is refused
// the toggles that stop claims.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DbHandle } from "@workspace/db";
import { seedRequirements } from "@workspace/db/seed";
import { createApp } from "../app";
import { bootstrapPlatform } from "../lib/bootstrap";
import { loadConfig } from "../lib/config";

const TEST_URL = process.env.TEST_DATABASE_URL;

interface ApiResponse<T = any> {
  status: number;
  body: T;
  cookie: string | null;
}

describe.skipIf(!TEST_URL)("credentialing registry api", () => {
  let handle: DbHandle;
  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  const config = loadConfig({ NODE_ENV: "test" });

  let adminCookie: string;
  let schedulerCookie: string;

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

  beforeAll(async () => {
    handle = createDb(TEST_URL!);
    await handle.db.execute(sql`drop schema public cascade; drop schema if exists drizzle cascade; create schema public;`);
    await runMigrations(handle.db);
    await bootstrapPlatform(handle.db, config);
    await seedRequirements((text, params) => handle.pool.query(text, params));

    const app = createApp({ db: handle.db, config, quiet: true });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    // The registry is an ORGANIZATION capability: /requirements is gated on
    // the org Admin role, the same way /org is. A Super_Admin reaches it by
    // being in the org, not by outranking it — so the suite creates a real
    // org Admin and a Scheduler through the platform console, exactly as an
    // operator would.
    const superLogin = await api("POST", "/api/auth/login", {
      email: config.superAdminEmail,
      password: "Success2026",
    });
    expect(superLogin.status).toBe(200);
    const superCookie = superLogin.cookie!;

    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    const orgId = orgs.body.organizations[0].id;

    adminCookie = await createAndSignIn(superCookie, orgId, "registry.admin@durablelifeskills.com", "Reggie Admin", "Admin", "Registry-2026-ok");
    schedulerCookie = await createAndSignIn(superCookie, orgId, "registry.sched@durablelifeskills.com", "Sam Scheduler", "Scheduler", "Schedule-2026-ok");
  });

  /** Create an org account, then trade its temporary password for a session. */
  async function createAndSignIn(
    superCookie: string, orgId: string, email: string, fullName: string, role: string, newPassword: string
  ): Promise<string> {
    const created = await api("POST", "/api/platform/users", { orgId, email, fullName, role }, superCookie);
    expect(created.status).toBe(201);
    const temporaryPassword = created.body.temporaryPassword as string;

    const first = await api("POST", "/api/auth/login", { email, password: temporaryPassword });
    expect(first.status).toBe(200);
    const changed = await api("POST", "/api/auth/change-password", {
      currentPassword: temporaryPassword, newPassword,
    }, first.cookie);
    expect(changed.status).toBe(200);
    return changed.cookie ?? first.cookie!;
  }

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await handle.pool.end();
  });

  describe("the registry is not an open surface", () => {
    it("refuses an anonymous read", async () => {
      const { status } = await api("GET", "/api/requirements");
      expect(status).toBe(401);
    });

    it("refuses an anonymous write", async () => {
      const { status } = await api("PATCH", "/api/requirements/hipaa", { required: false });
      expect(status).toBe(401);
    });
  });

  describe("GET /requirements", () => {
    it("serves the registry in display order to a signed-in caller", async () => {
      const { status, body } = await api("GET", "/api/requirements", undefined, adminCookie);
      expect(status).toBe(200);
      const rows = body as { id: string; sortOrder: number }[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.map((r) => r.sortOrder)).toEqual([...rows.map((r) => r.sortOrder)].sort((a, b) => a - b));
    });

    it("round-trips the jsonb columns as real values, not strings", async () => {
      const { body } = await api("GET", "/api/requirements", undefined, adminCookie);
      const qmap = (body as { id: string; source: { kind: string }; appliesTo: string[]; renewsMonths: number | null }[])
        .find((r) => r.id === "qmap")!;
      expect(qmap.source.kind).toBe("training");
      expect(qmap.appliesTo).toEqual(["Field_Staff"]);
      // QMAP registration does not expire — the correction this registry carries.
      expect(qmap.renewsMonths).toBeNull();
    });
  });

  describe("PATCH /requirements/:id", () => {
    it("persists a toggle — the whole point of the registry", async () => {
      const written = await api("PATCH", "/api/requirements/hipaa", { required: false }, adminCookie);
      expect(written.status).toBe(200);

      // Read it back through a fresh request, not the write's own response.
      const { body } = await api("GET", "/api/requirements", undefined, adminCookie);
      const hipaa = (body as { id: string; required: boolean; gating: boolean }[]).find((r) => r.id === "hipaa")!;
      expect(hipaa.required).toBe(false);
      // Gating cannot outlive Required.
      expect(hipaa.gating).toBe(false);

      await api("PATCH", "/api/requirements/hipaa", { required: true, gating: true }, adminCookie);
    });

    it("records a verification sign-off", async () => {
      const { status, body } = await api("PATCH", "/api/requirements/caps_check", {
        verificationStatus: "confirmed",
        verifiedOn: "2026-09-12",
        verifiedBy: "K. Sandoval",
        verificationNote: "Read C.R.S. 26-3.1-111 and confirmed scope with the CAPS Check Unit.",
      }, adminCookie);
      expect(status).toBe(200);
      expect((body as { verificationStatus: string }).verificationStatus).toBe("confirmed");

      const fresh = await api("GET", "/api/requirements", undefined, adminCookie);
      const caps = (fresh.body as { id: string; verifiedBy: string; verifiedOn: string }[])
        .find((r) => r.id === "caps_check")!;
      expect(caps.verifiedBy).toBe("K. Sandoval");
      expect(caps.verifiedOn).toBe("2026-09-12");
    });

    it("refuses a sign-off with nobody behind it", async () => {
      const { status, body } = await api("PATCH", "/api/requirements/tb_screening", {
        verificationStatus: "confirmed",
        verificationNote: "looks fine",
      }, adminCookie);
      expect(status).toBe(400);
      expect(JSON.stringify(body)).toMatch(/who verified it/i);
    });

    it("404s an unknown requirement", async () => {
      const { status } = await api("PATCH", "/api/requirements/not_a_requirement", { required: false }, adminCookie);
      expect(status).toBe(404);
    });

    it("rejects a malformed body", async () => {
      const { status } = await api("PATCH", "/api/requirements/hipaa", { required: "yes please" }, adminCookie);
      expect(status).toBe(400);
    });

    it("leaves fields the caller did not send alone", async () => {
      await api("PATCH", "/api/requirements/cpr_first_aid", { gating: false }, adminCookie);
      const { body } = await api("GET", "/api/requirements", undefined, adminCookie);
      const cpr = (body as { id: string; label: string; renewsMonths: number | null }[])
        .find((r) => r.id === "cpr_first_aid")!;
      expect(cpr.label).toBe("CPR / First Aid");
      expect(cpr.renewsMonths).toBe(24);
      await api("PATCH", "/api/requirements/cpr_first_aid", { gating: true }, adminCookie);
    });

    it("will not let a Scheduler change what blocks a claim", async () => {
      if (!schedulerCookie) return; // no scheduler account in this build
      const { status } = await api("PATCH", "/api/requirements/hipaa", { required: false }, schedulerCookie);
      expect(status).toBe(403);
    });
  });

  describe("GET /staff-credentials", () => {
    const vega = "00000000-0000-4000-a000-000000000003";
    const price = "00000000-0000-4000-a000-000000000004";

    beforeAll(async () => {
      await handle.pool.query(
        `insert into staff_credentials (staff_id, requirement_id, status, completed_on)
         values ($1, 'hipaa', 'verified', '2026-01-15'), ($2, 'hipaa', 'in_progress', null)
         on conflict (staff_id, requirement_id) do nothing`,
        [vega, price]
      );
    });

    it("narrows to one staff member", async () => {
      const { status, body } = await api("GET", `/api/staff-credentials?staffId=${vega}`, undefined, adminCookie);
      expect(status).toBe(200);
      const rows = body as { staff_id: string; status: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].staff_id).toBe(vega);
      expect(rows[0].status).toBe("verified");
    });

    it("serves snake_case keys — the shape the engine reads", async () => {
      const { body } = await api("GET", `/api/staff-credentials?staffId=${price}`, undefined, adminCookie);
      const row = (body as Record<string, unknown>[])[0];
      expect(Object.keys(row).sort()).toEqual([
        "completed_on", "expires_on", "note", "requirement_id", "staff_id", "status", "waive_reason", "waived_by",
      ]);
    });
  });
});
