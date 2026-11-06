// artifacts/api-server/src/__tests__/clients.test.ts — the client record and
// what hangs off it, over HTTP against a real PostgreSQL (TEST_DATABASE_URL).
//
// The record itself rides clients.core; contacts, insurance, authorizations
// and files each ride a switch of their own, so the suite checks both that
// the data round-trips and that each part closes when its switch is off,
// stays scoped to one organization, and leaves an audit trail that names
// what changed without repeating the chart.
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

describe.skipIf(!TEST_URL)("client records", () => {
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
  let clientId: string;

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

  /** The raw upload the paperwork folder takes: bytes in the body, the record in the query string. */
  async function upload(path: string, bytes: Uint8Array, contentType: string, cookie: string): Promise<ApiResponse> {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": contentType, cookie }, body: bytes });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, cookie: null, headers: res.headers };
  }

  async function createAndSignIn(org: string, email: string, role: string): Promise<string> {
    const created = await api("POST", "/api/platform/users", { orgId: org, email, fullName: "Someone", role }, superCookie);
    expect(created.status).toBe(201);
    const temporaryPassword = created.body.temporaryPassword as string;
    const first = await api("POST", "/api/auth/login", { email, password: temporaryPassword });
    expect(first.status).toBe(200);
    const changed = await api("POST", "/api/auth/change-password", { currentPassword: temporaryPassword, newPassword: "Chart-2026-ok!" }, first.cookie);
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
    const rotated = await api("POST", "/api/auth/change-password", { currentPassword: "Setup-Owner-2026", newPassword: "Owner-Chart-2026" }, superLogin.cookie);
    superCookie = rotated.cookie!;
    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    orgId = orgs.body.organizations[0].id;
    const other = await api("POST", "/api/platform/organizations", { name: "Other Agency", slug: "other-agency" }, superCookie);
    const otherOrgId = other.body.organization.id as string;

    adminCookie = await createAndSignIn(orgId, "lisa.chart@durablelifeskills.com", "Admin");
    schedulerCookie = await createAndSignIn(orgId, "sam.chart@durablelifeskills.com", "Scheduler");
    otherAdminCookie = await createAndSignIn(otherOrgId, "ann.other@example.test", "Admin");

    // The record's tabs ship switched off. The provider makes each available
    // (tier 1), then the Admin turns it on and grants it to the Scheduler
    // (tier 2) — the same two steps DLS goes through.
    for (const key of ["clients.contacts", "clients.insurance", "clients.authorizations", "clients.paperwork", "clients.health"]) {
      expect((await api("PUT", `/api/platform/features/${key}`, { enabled: true }, superCookie)).status).toBe(200);
      for (const cookie of [adminCookie, otherAdminCookie]) {
        expect((await api("PUT", `/api/org/features/${key}`, { enabled: true, roles: { Scheduler: true } }, cookie)).status).toBe(200);
      }
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await handle.pool.end();
  });

  it("creates a client with the full intake and reads it back", async () => {
    const res = await api(
      "POST",
      "/api/clients",
      {
        firstName: "Alma",
        middleName: "R",
        lastName: "Reyes",
        email: "Alma@Example.test",
        phone: "970-555-0100",
        phoneCell: "970-555-0101",
        medicaidId: "CO4481920",
        dateOfBirth: "1998-03-14",
        gender: "Female",
        guardianshipStatus: "Guardian",
        admissionDate: "2026-01-15",
        address1: "123 Main St",
        city: "Greeley",
        state: "co",
        county: "Weld",
        zip: "80631",
        activeDiagnoses: [
          { code: "G40.909", description: "Epilepsy" },
          { code: "F71", description: "Moderate intellectual disability", isPrimary: true },
        ],
        allergies: "Penicillin",
        supervisionRequirements: "Line of sight in the community.",
        hasBehaviorSupportPlan: true,
      },
      adminCookie
    );
    expect(res.status).toBe(201);
    const c = res.body.client;
    clientId = c.id;
    expect(c).toMatchObject({
      firstName: "Alma",
      middleName: "R",
      email: "alma@example.test",
      phoneCell: "970-555-0101",
      gender: "Female",
      guardianshipStatus: "Guardian",
      admissionDate: "2026-01-15",
      state: "CO",
      county: "Weld",
      status: "Active",
      allergies: "Penicillin",
      hasBehaviorSupportPlan: true,
    });
    // One principal diagnosis, the one that was marked; the other is explicitly not.
    expect(c.activeDiagnoses).toEqual([
      { code: "G40.909", description: "Epilepsy", isPrimary: false },
      { code: "F71", description: "Moderate intellectual disability", isPrimary: true },
    ]);
    const read = await api("GET", `/api/clients/${clientId}`, undefined, schedulerCookie);
    expect(read.status).toBe(200);
    expect(read.body.client.id).toBe(clientId);
  });

  it("marks the first diagnosis principal when none is marked", async () => {
    const res = await api("POST", "/api/clients", { firstName: "Ben", lastName: "Okafor", activeDiagnoses: [{ code: "F84.0", description: "Autism" }, { code: "F70", description: "" }] }, adminCookie);
    expect(res.status).toBe(201);
    expect(res.body.client.activeDiagnoses.map((d: any) => d.isPrimary)).toEqual([true, false]);
  });

  it("edits the record, clearing a field with an empty string and leaving unsent fields alone", async () => {
    const res = await api("PATCH", `/api/clients/${clientId}`, { city: "Loveland", phoneCell: "", medicalConcerns: "Seizure precautions." }, schedulerCookie);
    expect(res.status).toBe(200);
    expect(res.body.client).toMatchObject({ city: "Loveland", phoneCell: null, medicalConcerns: "Seizure precautions.", allergies: "Penicillin", state: "CO" });
    const refused = await api("PATCH", `/api/clients/${clientId}`, { gender: "Robot" }, adminCookie);
    expect(refused.status).toBe(400);
  });

  it("keeps the Case Management Agency's own phone, email and address with its name", async () => {
    const created = await api(
      "POST",
      "/api/clients",
      {
        firstName: "Cora",
        lastName: "Lindqvist",
        ccbName: "Weld County CMA",
        ccbPhone: "970-555-0199",
        ccbEmail: "Intake@WeldCMA.example.test",
        ccbAddress1: "800 8th Ave",
        ccbCity: "Greeley",
        ccbState: "co",
        ccbZip: "80631",
      },
      adminCookie
    );
    expect(created.status).toBe(201);
    expect(created.body.client).toMatchObject({
      ccbName: "Weld County CMA",
      ccbPhone: "970-555-0199",
      ccbEmail: "intake@weldcma.example.test",
      ccbAddress1: "800 8th Ave",
      ccbCity: "Greeley",
      ccbState: "CO",
      ccbZip: "80631",
    });
    const id = created.body.client.id as string;

    // An edit touches only what it sends; an empty string clears a field.
    const edited = await api("PATCH", `/api/clients/${id}`, { ccbPhone: "970-555-0123", ccbZip: "" }, schedulerCookie);
    expect(edited.status).toBe(200);
    expect(edited.body.client).toMatchObject({ ccbPhone: "970-555-0123", ccbZip: null, ccbCity: "Greeley", ccbEmail: "intake@weldcma.example.test" });

    const badEmail = await api("PATCH", `/api/clients/${id}`, { ccbEmail: "not-an-email" }, adminCookie);
    expect(badEmail.status).toBe(400);

    // A client entered without them just has none.
    const plain = await api("POST", "/api/clients", { firstName: "Dev", lastName: "Patel" }, adminCookie);
    expect(plain.status).toBe(201);
    expect(plain.body.client).toMatchObject({ ccbPhone: null, ccbEmail: null, ccbAddress1: null, ccbCity: null, ccbState: null, ccbZip: null });
  });

  it("lets only an Admin change the status, and audits it without the chart", async () => {
    const office = await api("PATCH", `/api/clients/${clientId}`, { status: "Inactive" }, schedulerCookie);
    expect(office.status).toBe(403);
    expect((await api("GET", `/api/clients/${clientId}`, undefined, adminCookie)).body.client.status).toBe("Active");

    const admin = await api("PATCH", `/api/clients/${clientId}`, { status: "Discharged", dischargeDate: "2026-10-31" }, adminCookie);
    expect(admin.status).toBe(200);
    expect(admin.body.client).toMatchObject({ status: "Discharged", dischargeDate: "2026-10-31" });

    const listed = await api("GET", "/api/clients?status=Discharged", undefined, adminCookie);
    expect(listed.body.clients.map((c: any) => c.id)).toEqual([clientId]);
    expect((await api("GET", "/api/clients?status=Active", undefined, adminCookie)).body.clients.some((c: any) => c.id === clientId)).toBe(false);

    const audit = await api("GET", "/api/org/audit?limit=20", undefined, adminCookie);
    const entries = audit.body.entries as any[];
    const statusEntry = entries.find((e) => e.action === "client.status_changed" && e.targetId === clientId);
    expect(statusEntry.details).toEqual({ from: "Active", to: "Discharged" });
    const updateEntry = entries.find((e) => e.action === "client.updated" && e.targetId === clientId && e.details.fields.includes("dischargeDate"));
    expect(updateEntry).toBeTruthy();
    expect(JSON.stringify(entries)).not.toContain("Penicillin");
    expect(JSON.stringify(entries)).not.toContain("Loveland");

    expect((await api("PATCH", `/api/clients/${clientId}`, { status: "Active" }, adminCookie)).status).toBe(200);
  });

  it("refuses a duplicate Medicaid ID on edit as on create", async () => {
    const res = await api("POST", "/api/clients", { firstName: "Cora", lastName: "Whitfield", medicaidId: "CO4481920" }, adminCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MEDICAID_ID_TAKEN");
    const other = await api("POST", "/api/clients", { firstName: "Cora", lastName: "Whitfield", medicaidId: "CO6120944" }, adminCookie);
    expect(other.status).toBe(201);
    const edit = await api("PATCH", `/api/clients/${other.body.client.id}`, { medicaidId: "CO4481920" }, adminCookie);
    expect(edit.status).toBe(409);
  });

  it("copies a practice client once, flags it, and keeps real clients unflagged", async () => {
    const sample = { firstName: "Dev", lastName: "Ramírez", sampleKey: "demo-client-ramirez" };
    const first = await api("POST", "/api/clients", sample, schedulerCookie);
    expect(first.status).toBe(201);
    expect(first.body.client.sampleKey).toBe("demo-client-ramirez");

    // Asking again (a second tab, a double click) returns the same copy.
    const again = await api("POST", "/api/clients", { ...sample, firstName: "Changed" }, adminCookie);
    expect(again.status).toBe(200);
    expect(again.body.client.id).toBe(first.body.client.id);
    expect(again.body.client.firstName).toBe("Dev");

    // A practice record cannot also be a converted inquiry.
    const mixed = await api("POST", "/api/clients", { ...sample, sampleKey: "x", sourceLeadId: "00000000-0000-4000-8000-000000000000" }, adminCookie);
    expect(mixed.status).toBe(400);

    const real = await api("GET", `/api/clients/${clientId}`, undefined, adminCookie);
    expect(real.body.client.sampleKey).toBeNull();

    const audit = await api("GET", "/api/org/audit?limit=50", undefined, adminCookie);
    const created = (audit.body.entries as any[]).find((e) => e.action === "client.created" && e.targetId === first.body.client.id);
    expect(created.details.practiceRecord).toBe(true);
  });

  describe("contacts", () => {
    let contactId: string;

    it("adds, lists, edits and removes the people around the client", async () => {
      const added = await api(
        "POST",
        `/api/clients/${clientId}/contacts`,
        { kind: "guardian", name: "Maria Reyes", relationship: "Mother", phone: "970-555-0102", email: "Maria@Example.test", isPrimary: true },
        schedulerCookie
      );
      expect(added.status).toBe(201);
      contactId = added.body.contact.id;
      expect(added.body.contact).toMatchObject({ kind: "guardian", name: "Maria Reyes", email: "maria@example.test", isPrimary: true });

      const physician = await api("POST", `/api/clients/${clientId}/contacts`, { kind: "physician", name: "Dr. Patel", npi: "1234567893" }, adminCookie);
      expect(physician.status).toBe(201);
      const badNpi = await api("POST", `/api/clients/${clientId}/contacts`, { kind: "physician", name: "Dr. Nobody", npi: "12345" }, adminCookie);
      expect(badNpi.status).toBe(400);

      const list = await api("GET", `/api/clients/${clientId}/contacts`, undefined, schedulerCookie);
      expect(list.status).toBe(200);
      // The primary contact comes first.
      expect(list.body.contacts.map((c: any) => c.name)).toEqual(["Maria Reyes", "Dr. Patel"]);

      const edited = await api("PATCH", `/api/clients/${clientId}/contacts/${contactId}`, { phone: "", notes: "Prefers text messages." }, schedulerCookie);
      expect(edited.status).toBe(200);
      expect(edited.body.contact).toMatchObject({ phone: null, notes: "Prefers text messages.", name: "Maria Reyes" });

      expect((await api("DELETE", `/api/clients/${clientId}/contacts/${physician.body.contact.id}`, undefined, adminCookie)).status).toBe(200);
      expect((await api("GET", `/api/clients/${clientId}/contacts`, undefined, adminCookie)).body.contacts).toHaveLength(1);
      expect((await api("DELETE", `/api/clients/${clientId}/contacts/${physician.body.contact.id}`, undefined, adminCookie)).status).toBe(404);
    });

    it("closes when the provider withholds the capability, while the record stays open", async () => {
      expect((await api("PUT", "/api/platform/features/clients.contacts", { enabled: false }, superCookie)).status).toBe(200);
      expect((await api("GET", `/api/clients/${clientId}/contacts`, undefined, adminCookie)).status).toBe(403);
      expect((await api("GET", `/api/clients/${clientId}`, undefined, adminCookie)).status).toBe(200);
      expect((await api("PUT", "/api/platform/features/clients.contacts", { enabled: true }, superCookie)).status).toBe(200);
      expect((await api("GET", `/api/clients/${clientId}/contacts`, undefined, adminCookie)).status).toBe(200);
    });

    it("closes for a role the Admin has not granted it to", async () => {
      expect((await api("PUT", "/api/org/features/clients.contacts", { roles: { Scheduler: false } }, adminCookie)).status).toBe(200);
      expect((await api("GET", `/api/clients/${clientId}/contacts`, undefined, schedulerCookie)).status).toBe(403);
      expect((await api("GET", `/api/clients/${clientId}`, undefined, schedulerCookie)).status).toBe(200);
      expect((await api("PUT", "/api/org/features/clients.contacts", { roles: { Scheduler: true } }, adminCookie)).status).toBe(200);
      expect((await api("GET", `/api/clients/${clientId}/contacts`, undefined, schedulerCookie)).status).toBe(200);
    });
  });

  describe("health access", () => {
    const health = {
      allergies: "Restricted allergy", medicalConcerns: "Restricted concern",
      supervisionRequirements: "Restricted supervision", generalInformation: "Restricted note",
      hasBehaviorSupportPlan: true, behaviorSupportPlanNotes: "Restricted plan",
    };

    async function checkDenied(cookie: string) {
      const list = await api("GET", "/api/clients", undefined, cookie);
      const detail = await api("GET", `/api/clients/${clientId}`, undefined, cookie);
      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
      for (const field of Object.keys(health)) {
        expect(detail.body.client).not.toHaveProperty(field);
        for (const row of list.body.clients) expect(row).not.toHaveProperty(field);
        expect((await api("PATCH", `/api/clients/${clientId}`, { [field]: health[field as keyof typeof health] }, cookie)).status).toBe(403);
      }
      expect((await api("POST", "/api/clients", { firstName: "Denied", lastName: "Health", ...health }, cookie)).status).toBe(403);
      const patch = await api("PATCH", `/api/clients/${clientId}`, { city: "Loveland" }, cookie);
      const noop = await api("PATCH", `/api/clients/${clientId}`, {}, cookie);
      const created = await api("POST", "/api/clients", { firstName: "Core", lastName: "Only" }, cookie);
      expect(patch.status).toBe(200);
      expect(noop.status).toBe(200);
      expect(created.status).toBe(201);
      for (const field of Object.keys(health)) {
        expect(patch.body.client).not.toHaveProperty(field);
        expect(noop.body.client).not.toHaveProperty(field);
        expect(created.body.client).not.toHaveProperty(field);
      }
    }

    it("protects reads and writes when disabled globally or for a role", async () => {
      expect((await api("PATCH", `/api/clients/${clientId}`, health, adminCookie)).status).toBe(200);
      expect((await api("PUT", "/api/platform/features/clients.health", { enabled: false }, superCookie)).status).toBe(200);
      try { await checkDenied(adminCookie); }
      finally { await api("PUT", "/api/platform/features/clients.health", { enabled: true }, superCookie); }
      expect((await api("PUT", "/api/org/features/clients.health", { roles: { Scheduler: false } }, adminCookie)).status).toBe(200);
      try { await checkDenied(schedulerCookie); }
      finally { await api("PUT", "/api/org/features/clients.health", { roles: { Scheduler: true } }, adminCookie); }
      const detail = await api("GET", `/api/clients/${clientId}`, undefined, schedulerCookie);
      expect(detail.body.client).toMatchObject(health);
    });
  });

  describe("insurance policies", () => {
    it("keeps primary and secondary coverage with the numbers a claim needs", async () => {
      const primary = await api(
        "POST",
        `/api/clients/${clientId}/policies`,
        { policyType: "primary", payerName: "Health First Colorado", memberId: "CO4481920", startDate: "2026-01-01" },
        schedulerCookie
      );
      expect(primary.status).toBe(201);
      const secondary = await api(
        "POST",
        `/api/clients/${clientId}/policies`,
        { policyType: "secondary", payerName: "Blue Cross", memberId: "XYZ123", groupNumber: "G-77", policyHolderName: "Maria Reyes", policyHolderRelationship: "Parent" },
        schedulerCookie
      );
      expect(secondary.status).toBe(201);
      const backwards = await api("POST", `/api/clients/${clientId}/policies`, { payerName: "Nope", startDate: "2026-02-01", endDate: "2026-01-01" }, adminCookie);
      expect(backwards.status).toBe(400);

      const list = await api("GET", `/api/clients/${clientId}/policies`, undefined, adminCookie);
      expect(list.body.policies.map((p: any) => p.policyType)).toEqual(["primary", "secondary"]);

      const ended = await api("PATCH", `/api/clients/${clientId}/policies/${secondary.body.policy.id}`, { status: "inactive", endDate: "2026-06-30" }, adminCookie);
      expect(ended.status).toBe(200);
      expect(ended.body.policy).toMatchObject({ status: "inactive", endDate: "2026-06-30", groupNumber: "G-77" });
      expect((await api("DELETE", `/api/clients/${clientId}/policies/${secondary.body.policy.id}`, undefined, adminCookie)).status).toBe(200);
      expect((await api("GET", `/api/clients/${clientId}/policies`, undefined, adminCookie)).body.policies).toHaveLength(1);
    });
  });

  describe("prior authorizations", () => {
    it("records an authorization as a record of its own", async () => {
      const res = await api(
        "POST",
        `/api/clients/${clientId}/authorizations`,
        {
          authNumber: "PA-2026-44817",
          payerName: "Health First Colorado",
          service: "SCC",
          billingCode: "t2021",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          approvedUnits: 2080,
          unitBasis: "unit",
          weeklyCapUnits: 40,
          ratePerUnit: 15.5,
        },
        schedulerCookie
      );
      expect(res.status).toBe(201);
      expect(res.body.authorization).toMatchObject({ authNumber: "PA-2026-44817", billingCode: "T2021", approvedUnits: 2080, weeklyCapUnits: 40, status: "active", permitOverBudget: false });

      const trips = await api(
        "POST",
        `/api/clients/${clientId}/authorizations`,
        { service: "NMT", startDate: "2026-01-01", endDate: "2026-06-30", approvedUnits: 52, unitBasis: "trip", weeklyCapUnits: 2 },
        adminCookie
      );
      expect(trips.status).toBe(201);

      const backwards = await api("POST", `/api/clients/${clientId}/authorizations`, { service: "SCC", startDate: "2026-06-01", endDate: "2026-01-01", approvedUnits: 10 }, adminCookie);
      expect(backwards.status).toBe(400);
      const negative = await api("POST", `/api/clients/${clientId}/authorizations`, { service: "SCC", startDate: "2026-01-01", endDate: "2026-02-01", approvedUnits: -1 }, adminCookie);
      expect(negative.status).toBe(400);

      const list = await api("GET", `/api/clients/${clientId}/authorizations`, undefined, adminCookie);
      // Latest end date first.
      expect(list.body.authorizations.map((a: any) => a.service)).toEqual(["SCC", "NMT"]);

      const flagged = await api(
        "PATCH",
        `/api/clients/${clientId}/authorizations/${res.body.authorization.id}`,
        { permitOverBudget: true, status: "pending", endDate: "2025-01-01" },
        adminCookie
      );
      // The database refuses the end date before the start date, with a usable message.
      expect(flagged.status).toBe(400);
      expect(flagged.body.error.message).toMatch(/end date/i);
      const ok = await api("PATCH", `/api/clients/${clientId}/authorizations/${res.body.authorization.id}`, { permitOverBudget: true, status: "pending" }, adminCookie);
      expect(ok.status).toBe(200);
      expect(ok.body.authorization).toMatchObject({ permitOverBudget: true, status: "pending", authNumber: "PA-2026-44817" });
      expect((await api("DELETE", `/api/clients/${clientId}/authorizations/${trips.body.authorization.id}`, undefined, adminCookie)).status).toBe(200);
    });
  });

  describe("files on record", () => {
    let fileId: string;
    const pdf = new TextEncoder().encode("%PDF-1.4\n% a tiny test document\n");

    it("stores a document with its category and dates, lists it without the bytes, and serves it as a download", async () => {
      const q = new URLSearchParams({ fileName: "Alma Reyes - consent.pdf", category: "Consent", startDate: "2026-01-01", endDate: "2026-12-31" });
      const res = await upload(`/api/clients/${clientId}/files?${q}`, pdf, "application/pdf", schedulerCookie);
      expect(res.status).toBe(201);
      fileId = res.body.file.id;
      expect(res.body.file).toMatchObject({ category: "Consent", fileName: "Alma Reyes - consent.pdf", contentType: "application/pdf", sizeBytes: pdf.length, endDate: "2026-12-31" });
      expect("content" in res.body.file).toBe(false);

      const list = await api("GET", `/api/clients/${clientId}/files`, undefined, adminCookie);
      expect(list.status).toBe(200);
      expect(list.body.files).toHaveLength(1);
      expect(list.body.categories).toContain("Birth certificate");
      expect(list.body.maxBytes).toBe(10 * 1024 * 1024);

      const download = await fetch(`${base}/api/clients/${clientId}/files/${fileId}/content`, { headers: { cookie: adminCookie } });
      expect(download.status).toBe(200);
      expect(download.headers.get("content-type")).toBe("application/pdf");
      expect(download.headers.get("content-disposition")).toBe('attachment; filename="Alma Reyes - consent.pdf"');
      expect(download.headers.get("content-security-policy")).toBe("sandbox");
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(pdf);

      // The audit names the category and size, never the file name.
      const audit = await api("GET", "/api/org/audit?limit=10", undefined, adminCookie);
      const entry = (audit.body.entries as any[]).find((e) => e.action === "client.file_added");
      expect(entry.details).toEqual({ fileId, category: "Consent", sizeBytes: pdf.length });
      expect(JSON.stringify(entry)).not.toContain("consent.pdf");
    });

    it("refuses what the folder does not take: other file types, empty uploads, bad dates, unknown categories", async () => {
      const q = new URLSearchParams({ fileName: "setup.exe", category: "Other" });
      expect((await upload(`/api/clients/${clientId}/files?${q}`, pdf, "application/x-msdownload", adminCookie)).status).toBe(400);
      expect((await upload(`/api/clients/${clientId}/files?${q}`, new Uint8Array(0), "application/pdf", adminCookie)).status).toBe(400);
      const dates = new URLSearchParams({ fileName: "x.pdf", category: "Other", startDate: "2026-02-01", endDate: "2026-01-01" });
      expect((await upload(`/api/clients/${clientId}/files?${dates}`, pdf, "application/pdf", adminCookie)).status).toBe(400);
      const category = new URLSearchParams({ fileName: "x.pdf", category: "Tax return" });
      expect((await upload(`/api/clients/${clientId}/files?${category}`, pdf, "application/pdf", adminCookie)).status).toBe(400);
    });

    it("updates the record and removes the file", async () => {
      const edited = await api("PATCH", `/api/clients/${clientId}/files/${fileId}`, { category: "Acknowledgement form", endDate: "2027-12-31", notes: "Renewed early." }, adminCookie);
      expect(edited.status).toBe(200);
      expect(edited.body.file).toMatchObject({ category: "Acknowledgement form", endDate: "2027-12-31", notes: "Renewed early." });
      expect((await api("DELETE", `/api/clients/${clientId}/files/${fileId}`, undefined, adminCookie)).status).toBe(200);
      expect((await fetch(`${base}/api/clients/${clientId}/files/${fileId}/content`, { headers: { cookie: adminCookie } })).status).toBe(404);
      expect((await api("GET", `/api/clients/${clientId}/files`, undefined, adminCookie)).body.files).toHaveLength(0);
    });
  });

  it("keeps everything inside one organization", async () => {
    expect((await api("GET", `/api/clients/${clientId}`, undefined, otherAdminCookie)).status).toBe(404);
    expect((await api("PATCH", `/api/clients/${clientId}`, { city: "Elsewhere" }, otherAdminCookie)).status).toBe(404);
    expect((await api("GET", `/api/clients/${clientId}/contacts`, undefined, otherAdminCookie)).status).toBe(404);
    expect((await api("POST", `/api/clients/${clientId}/authorizations`, { service: "SCC", startDate: "2026-01-01", endDate: "2026-02-01", approvedUnits: 1 }, otherAdminCookie)).status).toBe(404);
    expect((await api("GET", "/api/clients", undefined, otherAdminCookie)).body.clients).toHaveLength(0);
  });
});
