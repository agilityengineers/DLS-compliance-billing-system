// artifacts/api-server/src/__tests__/billing.test.ts — payers, the fee
// schedule and the claim ledger, over HTTP against a real PostgreSQL
// (TEST_DATABASE_URL).
//
// Billing is Admin work behind two switches: billing.codes for the
// configuration, billing.claims for the ledger. The ledger is two-phase, so
// the suite walks a batch through open → finalize → the payer's answer, and
// checks that nothing can skip a step, that a sent batch is voided rather
// than deleted, and that every change is audited without the file.
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
  headers: Headers;
}

describe.skipIf(!TEST_URL)("billing api", () => {
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
  let orgId: string;
  let adminCookie: string;
  let schedulerCookie: string;
  let otherAdminCookie: string;

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
    return { status: res.status, body: parsed as T, cookie: setCookie ? setCookie.split(";")[0]! : null, headers: res.headers };
  }

  async function createAndSignIn(org: string, email: string, role: string): Promise<string> {
    const created = await api("POST", "/api/platform/users", { orgId: org, email, fullName: "Someone", role }, superCookie);
    expect(created.status).toBe(201);
    const temporaryPassword = created.body.temporaryPassword as string;
    const first = await api("POST", "/api/auth/login", { email, password: temporaryPassword });
    const changed = await api("POST", "/api/auth/change-password", { currentPassword: temporaryPassword, newPassword: "Billing-2026-ok!" }, first.cookie);
    expect(changed.status).toBe(200);
    return changed.cookie ?? first.cookie!;
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
    const rotated = await api("POST", "/api/auth/change-password", { currentPassword: "Setup-Owner-2026", newPassword: "Owner-Billing-2026" }, superLogin.cookie);
    superCookie = rotated.cookie!;
    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    orgId = orgs.body.organizations[0].id;
    const other = await api("POST", "/api/platform/organizations", { name: "Other Agency", slug: "other-agency" }, superCookie);
    const otherOrgId = other.body.organization.id as string;

    adminCookie = await createAndSignIn(orgId, "lisa.billing@durablelifeskills.com", "Admin");
    schedulerCookie = await createAndSignIn(orgId, "sam.billing@durablelifeskills.com", "Scheduler");
    otherAdminCookie = await createAndSignIn(otherOrgId, "ann.other@example.test", "Admin");

    // billing.claims is on at launch; billing.codes ships off and is switched on here, both tiers.
    expect((await api("PUT", "/api/platform/features/billing.codes", { enabled: true }, superCookie)).status).toBe(200);
    expect((await api("PUT", "/api/org/features/billing.codes", { enabled: true }, adminCookie)).status).toBe(200);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await handle.pool.end();
  });

  let payerId: string;
  let codeId: string;

  describe("payers and the fee schedule", () => {
    it("is Admin work: a Scheduler is refused even inside the organization", async () => {
      expect((await api("GET", "/api/billing/payers", undefined, schedulerCookie)).status).toBe(403);
      expect((await api("GET", "/api/billing/submissions", undefined, schedulerCookie)).status).toBe(403);
    });

    it("records a payer with the ids the envelope needs", async () => {
      const res = await api("POST", "/api/billing/payers", { name: "Health First Colorado", kind: "medicaid", payerId: "COMEDICAID", claimFilingCode: "MC", state: "co" }, adminCookie);
      expect(res.status).toBe(201);
      payerId = res.body.payer.id;
      expect(res.body.payer).toMatchObject({ name: "Health First Colorado", kind: "medicaid", payerId: "COMEDICAID", claimFilingCode: "MC", state: "CO", active: true });
      const dup = await api("POST", "/api/billing/payers", { name: "Health First Colorado" }, adminCookie);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("PAYER_EXISTS");
      expect((await api("POST", "/api/billing/payers", { name: "DVR", kind: "dvr", claimFilingCode: "OF" }, adminCookie)).status).toBe(201);
      expect((await api("GET", "/api/billing/payers", undefined, adminCookie)).body.payers.map((p: any) => p.name)).toEqual(["DVR", "Health First Colorado"]);
    });

    it("keeps a fee schedule of codes with modifiers, units, rates and dates", async () => {
      const res = await api(
        "POST",
        "/api/billing/codes",
        { payerId, code: "t2021", modifier1: "hq", description: "Day habilitation, 15 min", service: "Day_Habilitation", billingUnit: "15_min", ratePerUnit: 12.75, effectiveDate: "2026-01-01" },
        adminCookie
      );
      expect(res.status).toBe(201);
      codeId = res.body.code.id;
      expect(res.body.code).toMatchObject({ code: "T2021", modifier1: "HQ", modifier2: null, service: "Day_Habilitation", ratePerUnit: 12.75, endDate: null, archived: false });

      expect((await api("POST", "/api/billing/codes", { code: "T2021", description: "SCC", service: "SCC", ratePerUnit: 15.5, effectiveDate: "2026-01-01" }, adminCookie)).status).toBe(201);
      expect((await api("POST", "/api/billing/codes", { code: "H2023", description: "Job coaching", service: "Job_Coaching", ratePerUnit: 18.25, effectiveDate: "2026-01-01" }, adminCookie)).status).toBe(201);

      const badCode = await api("POST", "/api/billing/codes", { code: "T-20", description: "x", service: "SCC", ratePerUnit: 1, effectiveDate: "2026-01-01" }, adminCookie);
      expect(badCode.status).toBe(400);
      const badModifier = await api("POST", "/api/billing/codes", { code: "T2021", modifier1: "HQX", description: "x", service: "SCC", ratePerUnit: 1, effectiveDate: "2026-01-01" }, adminCookie);
      expect(badModifier.status).toBe(400);
      const badDates = await api("POST", "/api/billing/codes", { code: "T2021", description: "x", service: "SCC", ratePerUnit: 1, effectiveDate: "2026-06-01", endDate: "2026-01-01" }, adminCookie);
      expect(badDates.status).toBe(400);
      const foreignPayer = await api("POST", "/api/billing/codes", { payerId: "00000000-0000-4000-8000-000000000000", code: "T2021", description: "x", service: "SCC", ratePerUnit: 1, effectiveDate: "2026-01-01" }, adminCookie);
      expect(foreignPayer.status).toBe(400);

      const list = await api("GET", "/api/billing/codes", undefined, adminCookie);
      expect(list.body.codes.map((c: any) => `${c.service}:${c.code}`)).toEqual(["Day_Habilitation:T2021", "Job_Coaching:H2023", "SCC:T2021"]);
    });

    it("ends a rate, archives a code and copies one, keeping archived codes out of the working list", async () => {
      const ended = await api("PATCH", `/api/billing/codes/${codeId}`, { endDate: "2026-12-31", ratePerUnit: 13 }, adminCookie);
      expect(ended.status).toBe(200);
      expect(ended.body.code).toMatchObject({ endDate: "2026-12-31", ratePerUnit: 13, modifier1: "HQ" });
      expect((await api("PATCH", `/api/billing/codes/${codeId}`, { endDate: "2025-01-01" }, adminCookie)).status).toBe(400);

      const copy = await api("POST", `/api/billing/codes/${codeId}/duplicate`, undefined, adminCookie);
      expect(copy.status).toBe(201);
      expect(copy.body.code).toMatchObject({ code: "T2021", modifier1: "HQ", ratePerUnit: 13, archived: false });
      expect(copy.body.code.notes).toContain("Copy of T2021");

      expect((await api("PATCH", `/api/billing/codes/${copy.body.code.id}`, { archived: true }, adminCookie)).status).toBe(200);
      const working = await api("GET", "/api/billing/codes", undefined, adminCookie);
      expect(working.body.codes.some((c: any) => c.id === copy.body.code.id)).toBe(false);
      const all = await api("GET", "/api/billing/codes?archived=true", undefined, adminCookie);
      expect(all.body.codes.some((c: any) => c.id === copy.body.code.id)).toBe(true);
      expect((await api("DELETE", `/api/billing/codes/${copy.body.code.id}`, undefined, adminCookie)).status).toBe(200);
    });

    it("closes when the provider withholds billing.codes, while the ledger stays open", async () => {
      expect((await api("PUT", "/api/platform/features/billing.codes", { enabled: false }, superCookie)).status).toBe(200);
      expect((await api("GET", "/api/billing/codes", undefined, adminCookie)).status).toBe(403);
      expect((await api("GET", "/api/billing/submissions", undefined, adminCookie)).status).toBe(200);
      expect((await api("PUT", "/api/platform/features/billing.codes", { enabled: true }, superCookie)).status).toBe(200);
    });
  });

  describe("the claim ledger", () => {
    let submissionId: string;
    let controlNumber: number;
    const wire = "ISA*00*          *00*          *ZZ*DLS0001        *ZZ*COMEDICAID     *261103*1200*^*00501*000000001*0*P*:~GS*HC*DLS0001*COMEDICAID*20261103*1200*1*X*005010X222A1~";

    it("opens a batch, reserving a control number and billing nothing", async () => {
      const res = await api(
        "POST",
        "/api/billing/submissions",
        { noteIds: ["note-1", "note-2"], totalUnits: 12, totalCharge: 186, payerKey: "COLORADO_MEDICAID", payerId, periodStart: "2026-10-01", periodEnd: "2026-10-31" },
        adminCookie
      );
      expect(res.status).toBe(201);
      submissionId = res.body.submission.id;
      controlNumber = res.body.submission.controlNumber;
      expect(controlNumber).toBeGreaterThan(0);
      expect(res.body.submission).toMatchObject({ status: "open", noteCount: 2, totalUnits: 12, totalCharge: 186, payerKey: "COLORADO_MEDICAID", testMode: false, fileName: null });
      // No file yet, so no download and no payer answer.
      expect((await api("GET", `/api/billing/submissions/${submissionId}/file`, undefined, adminCookie)).status).toBe(409);
      expect((await api("PATCH", `/api/billing/submissions/${submissionId}`, { status: "paid" }, adminCookie)).status).toBe(409);
    });

    it("finalizes it with the file exactly once, and serves the file as a download", async () => {
      const res = await api("POST", `/api/billing/submissions/${submissionId}/finalize`, { fileContent: wire, fileName: "dls-837p-2026-11-03-cn1.txt" }, adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.submission).toMatchObject({ status: "submitted", fileName: "dls-837p-2026-11-03-cn1.txt" });
      expect(res.body.submission.submittedAt).toBeTruthy();
      expect("fileContent" in res.body.submission).toBe(false);
      expect((await api("POST", `/api/billing/submissions/${submissionId}/finalize`, { fileContent: wire, fileName: "again.txt" }, adminCookie)).status).toBe(409);

      const download = await fetch(`${base}/api/billing/submissions/${submissionId}/file`, { headers: { cookie: adminCookie } });
      expect(download.status).toBe(200);
      expect(download.headers.get("content-disposition")).toBe('attachment; filename="dls-837p-2026-11-03-cn1.txt"');
      expect(await download.text()).toBe(wire);
    });

    it("records what the payer said, in an order that makes sense", async () => {
      expect((await api("PATCH", `/api/billing/submissions/${submissionId}`, { status: "open" }, adminCookie)).status).toBe(400);
      const accepted = await api("PATCH", `/api/billing/submissions/${submissionId}`, { status: "accepted", statusNote: "999 received 11/04" }, adminCookie);
      expect(accepted.status).toBe(200);
      expect(accepted.body.submission).toMatchObject({ status: "accepted", statusNote: "999 received 11/04" });
      expect(accepted.body.submission.respondedAt).toBeTruthy();
      // Accepted cannot go back to submitted; it can be paid.
      const back = await api("PATCH", `/api/billing/submissions/${submissionId}`, { status: "submitted" }, adminCookie);
      expect(back.status).toBe(409);
      expect(back.body.error.code).toBe("SUBMISSION_STATUS");
      expect((await api("PATCH", `/api/billing/submissions/${submissionId}`, { status: "paid", statusNote: "835 check 4471" }, adminCookie)).status).toBe(200);
      // A sent batch is voided, never deleted.
      expect((await api("DELETE", `/api/billing/submissions/${submissionId}`, undefined, adminCookie)).status).toBe(409);
      expect((await api("PATCH", `/api/billing/submissions/${submissionId}`, { status: "voided", statusNote: "Resubmitted under CN 2" }, adminCookie)).status).toBe(200);
      expect((await api("PATCH", `/api/billing/submissions/${submissionId}`, { status: "paid" }, adminCookie)).status).toBe(409);
    });

    it("discards an open batch whose file could not be built", async () => {
      const opened = await api("POST", "/api/billing/submissions", { noteIds: ["note-3"], totalUnits: 4, totalCharge: 62, payerKey: "COLORADO_MEDICAID", testMode: true }, adminCookie);
      expect(opened.status).toBe(201);
      expect(opened.body.submission.controlNumber).toBeGreaterThan(controlNumber);
      expect(opened.body.submission.testMode).toBe(true);
      expect((await api("DELETE", `/api/billing/submissions/${opened.body.submission.id}`, undefined, adminCookie)).status).toBe(200);
      const list = await api("GET", "/api/billing/submissions", undefined, adminCookie);
      expect(list.body.submissions.map((s: any) => s.id)).toEqual([submissionId]);
      expect(list.body.submissions[0].status).toBe("voided");
    });

    it("audits the export and every answer without the file, inside the organization only", async () => {
      const audit = await api("GET", "/api/org/audit?limit=30", undefined, adminCookie);
      const entries = audit.body.entries as any[];
      const exported = entries.find((e) => e.action === "billing.claims_exported");
      expect(exported.details).toMatchObject({ controlNumber, notes: 2, totalUnits: 12, totalCharge: 186, payer: "COLORADO_MEDICAID", testMode: false });
      expect(JSON.stringify(entries)).not.toContain("ISA*00");
      const changes = entries.filter((e) => e.action === "billing.submission_status_changed").map((e) => `${e.details.from}>${e.details.to}`);
      expect(changes).toEqual(expect.arrayContaining(["submitted>accepted", "accepted>paid", "paid>voided"]));
      const platform = await api("GET", "/api/platform/audit?category=billing&limit=50", undefined, superCookie);
      expect(platform.status).toBe(200);
      expect((platform.body.entries as any[]).every((e) => e.action.startsWith("billing."))).toBe(true);

      expect((await api("GET", "/api/billing/submissions", undefined, otherAdminCookie)).body.submissions).toHaveLength(0);
      expect((await api("GET", `/api/billing/submissions/${submissionId}/file`, undefined, otherAdminCookie)).status).toBe(404);
      expect((await api("PATCH", `/api/billing/codes/${codeId}`, { ratePerUnit: 1 }, otherAdminCookie)).status).toBe(403);
    });
  });
});
