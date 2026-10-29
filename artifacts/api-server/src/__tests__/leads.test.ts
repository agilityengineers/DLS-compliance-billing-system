// artifacts/api-server/src/__tests__/leads.test.ts — website inquiries over
// HTTP, against a real PostgreSQL (TEST_DATABASE_URL).
//
// Three things have to be true at once. The public form must work with no
// session and from another origin, so the website can use it. It must not be
// an open door: bots, floods, duplicates and malformed answers all get the
// same polite 202 or a clear refusal, and nothing a person wrote ends up in
// the audit log or an email. And the inbox behind it must be scoped to one
// organization, gated on the feature switch and role grant, and keep a
// timeline the owner can trust.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DbHandle } from "@workspace/db";
import { createApp } from "../app";
import { bootstrapPlatform } from "../lib/bootstrap";
import { loadConfig } from "../lib/config";
import { importConsultationRequests } from "../lib/leads";
import { Mailer, MemoryTransport } from "../lib/mail";

const TEST_URL = process.env.TEST_DATABASE_URL;
const SITE = "https://www.durablelifeskills.com";

interface ApiResponse<T = any> {
  status: number;
  body: T;
  cookie: string | null;
  headers: Headers;
}

describe.skipIf(!TEST_URL)("leads api", () => {
  let handle: DbHandle;
  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  const config = loadConfig({
    NODE_ENV: "test",
    SUPER_ADMIN_PASSWORD: "Setup-Owner-2026",
    PUBLIC_FORM_ORIGINS: SITE,
    LEAD_MAX_PER_IP: "3",
    LEAD_WINDOW_MINUTES: "10",
    APP_BASE_URL: "https://portal.example.test",
    CRON_SECRET: "cron-secret-for-tests",
  });
  const mailTransport = new MemoryTransport();
  const mailOf = (kind: string) => mailTransport.sent.filter((m) => m.message.kind === kind);

  let superCookie: string;
  let orgId: string;
  let adminCookie: string;
  let adminId: string;
  let schedulerCookie: string;
  let schedulerId: string;
  let fieldStaffId: string;

  async function api<T = any>(
    method: string,
    path: string,
    body?: unknown,
    cookie?: string | null,
    headers: Record<string, string> = {}
  ): Promise<ApiResponse<T>> {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
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

  /** Create an org account, then trade its temporary password for a session. */
  async function createAndSignIn(email: string, fullName: string, role: string, newPassword: string): Promise<{ cookie: string; id: string }> {
    const created = await api("POST", "/api/platform/users", { orgId, email, fullName, role }, superCookie);
    expect(created.status).toBe(201);
    const temporaryPassword = created.body.temporaryPassword as string;
    const first = await api("POST", "/api/auth/login", { email, password: temporaryPassword });
    expect(first.status).toBe(200);
    const changed = await api("POST", "/api/auth/change-password", { currentPassword: temporaryPassword, newPassword }, first.cookie);
    expect(changed.status).toBe(200);
    return { cookie: changed.cookie ?? first.cookie!, id: created.body.user.id as string };
  }

  async function waitFor(predicate: () => boolean, ms = 4000): Promise<void> {
    const until = Date.now() + ms;
    while (!predicate()) {
      if (Date.now() > until) throw new Error("timed out waiting");
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  const submission = (over: Record<string, unknown> = {}) => ({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "(719) 555-0100",
    role: "Family / guardian",
    service: "Customized Support Plans",
    message: "My son is finishing school next spring and we are looking at job coaching.",
    consent: "yes",
    page: `${SITE}/contact.html?utm_source=test`,
    submittedAt: new Date().toISOString(),
    ...over,
  });

  /** A submission from a distinct address, so the per-IP limit does not bleed between tests. */
  const fromIp = (ip: string) => ({ "x-forwarded-for": ip, origin: SITE });

  async function inbox(cookie: string, query = "") {
    const res = await api("GET", `/api/leads${query}`, undefined, cookie);
    expect(res.status).toBe(200);
    return res.body as {
      leads: any[];
      stages: { id: string; key: string; kind: string; label: string }[];
      counts: { byStage: Record<string, number>; total: number; unassigned: number };
      assignees: { id: string; fullName: string; role: string }[];
    };
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

    // The setup password is single-use: nothing opens until it is replaced.
    const superLogin = await api("POST", "/api/auth/login", { email: config.superAdminEmail, password: "Setup-Owner-2026" });
    expect(superLogin.status).toBe(200);
    expect(superLogin.body.mustChangePassword).toBe(true);
    const rotated = await api(
      "POST",
      "/api/auth/change-password",
      { currentPassword: "Setup-Owner-2026", newPassword: "Owner-Leads-2026" },
      superLogin.cookie
    );
    expect(rotated.status).toBe(200);
    superCookie = rotated.cookie!;
    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    orgId = orgs.body.organizations[0].id;

    const admin = await createAndSignIn("lisa.leads@durablelifeskills.com", "Lisa Torres", "Admin", "Leads-2026-ok!");
    adminCookie = admin.cookie;
    adminId = admin.id;
    const sched = await createAndSignIn("sam.leads@durablelifeskills.com", "Sam Scheduler", "Scheduler", "Leads-2026-ok!");
    schedulerCookie = sched.cookie;
    schedulerId = sched.id;
    const field = await createAndSignIn("fay.leads@durablelifeskills.com", "Fay Field", "Field_Staff", "Leads-2026-ok!");
    fieldStaffId = field.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await handle.pool.end();
  });

  // ── the public form ───────────────────────────────────────────────────
  describe("the public form", () => {
    it("tells the website which questions to ask, in order, without row ids", async () => {
      const { status, body, headers } = await api("GET", "/api/public/forms/contact", undefined, null, { origin: SITE });
      expect(status).toBe(200);
      expect(headers.get("access-control-allow-origin")).toBe(SITE);
      const keys = body.questions.map((q: any) => q.key);
      expect(keys).toEqual(["firstName", "lastName", "email", "phone", "role", "service", "message", "consent"]);
      expect(body.questions.every((q: any) => !("id" in q))).toBe(true);
      const consent = body.questions.find((q: any) => q.key === "consent");
      expect(consent.type).toBe("yes_no");
      expect(consent.required).toBe(true);
      const role = body.questions.find((q: any) => q.key === "role");
      expect(role.options).toContain("Referring someone");
    });

    it("answers a preflight from the website and nothing to an unlisted origin", async () => {
      const preflight = await fetch(`${base}/api/public/leads`, {
        method: "OPTIONS",
        headers: { origin: SITE, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(SITE);
      expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();

      const other = await api("GET", "/api/public/forms/contact", undefined, null, { origin: "https://evil.example" });
      expect(other.status).toBe(200);
      expect(other.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("stores a submission, starts its timeline, audits it without the answers, and tells the admins", async () => {
      const { status, body } = await api("POST", "/api/public/leads", submission(), null, fromIp("203.0.113.1"));
      expect(status).toBe(202);
      expect(body).toEqual({ ok: true });

      const box = await inbox(adminCookie);
      expect(box.leads).toHaveLength(1);
      const lead = box.leads[0];
      expect(lead.firstName).toBe("Ada");
      expect(lead.email).toBe("ada@example.com");
      expect(lead.source).toBe("website");
      expect(lead.sourcePage).toBe("/contact.html");
      expect(lead.consentAt).not.toBeNull();
      expect(lead.answers.role).toBe("Family / guardian");
      expect(lead.answers.consent).toBe(true);
      expect(lead.questionSnapshot).toHaveLength(8);
      const stage = box.stages.find((s) => s.id === lead.stageId)!;
      expect(stage.key).toBe("new");
      expect(box.counts.byStage[stage.id]).toBe(1);
      expect(box.counts.unassigned).toBe(1);
      // Who it can be handed to: the Admin and the Scheduler, not Field Staff.
      expect(box.assignees.map((a) => a.id).sort()).toEqual([adminId, schedulerId].sort());
      expect(box.assignees.some((a) => a.id === fieldStaffId)).toBe(false);

      const detail = await api("GET", `/api/leads/${lead.id}`, undefined, adminCookie);
      expect(detail.status).toBe(200);
      expect(detail.body.activities).toHaveLength(1);
      expect(detail.body.activities[0].type).toBe("submitted");
      expect(detail.body.activities[0].actorUserId).toBeNull();

      const audit = await api("GET", "/api/org/audit?limit=20", undefined, adminCookie);
      const received = audit.body.entries.find((e: any) => e.action === "lead.received");
      expect(received).toBeDefined();
      expect(received.actorUserId).toBeNull();
      expect(received.targetId).toBe(lead.id);
      expect(JSON.stringify(received.details)).not.toMatch(/ada|lovelace/i);

      await waitFor(() => mailOf("lead.received").length >= 1);
      const mail = mailOf("lead.received");
      expect(mail.map((m) => m.to)).toEqual(["lisa.leads@durablelifeskills.com"]);
      expect(mail[0]!.message.text).not.toMatch(/ada|lovelace|example\.com/i);
      expect(mail[0]!.message.text).toContain(`https://portal.example.test/admin/leads/${lead.id}`);
    });

    it("quietly ignores a submission that filled the honeypot", async () => {
      const before = (await inbox(adminCookie)).counts.total;
      const { status, body } = await api(
        "POST",
        "/api/public/leads",
        submission({ email: "bot@example.com", company_website: "http://spam.example" }),
        null,
        fromIp("203.0.113.2")
      );
      expect(status).toBe(202);
      expect(body).toEqual({ ok: true });
      expect((await inbox(adminCookie)).counts.total).toBe(before);
    });

    it("refuses missing required answers and options that are not on the list, naming each one", async () => {
      const { status, body } = await api(
        "POST",
        "/api/public/leads",
        submission({ email: "", lastName: "", consent: "", service: "Something we do not offer" }),
        null,
        fromIp("203.0.113.3")
      );
      expect(status).toBe(400);
      expect(body.error.code).toBe("VALIDATION");
      const keys = body.error.details.map((d: any) => d.key).sort();
      expect(keys).toEqual(["consent", "email", "lastName", "service"]);
    });

    it("folds a repeat from the same address into the first inquiry", async () => {
      const before = await inbox(adminCookie);
      const { status } = await api("POST", "/api/public/leads", submission(), null, fromIp("203.0.113.4"));
      expect(status).toBe(202);
      const after = await inbox(adminCookie);
      expect(after.counts.total).toBe(before.counts.total);
      const detail = await api("GET", `/api/leads/${before.leads.find((l) => l.email === "ada@example.com").id}`, undefined, adminCookie);
      expect(detail.body.activities.filter((a: any) => a.type === "submitted")).toHaveLength(2);
      expect(detail.body.activities[0].details.duplicate).toBe(true);
    });

    it("limits how many inquiries one address can send inside the window", async () => {
      const headers = fromIp("203.0.113.9");
      for (const n of [1, 2, 3]) {
        const { status } = await api("POST", "/api/public/leads", submission({ email: `flood${n}@example.com` }), null, headers);
        expect(status).toBe(202);
      }
      const fourth = await api("POST", "/api/public/leads", submission({ email: "flood4@example.com" }), null, headers);
      expect(fourth.status).toBe(429);
      expect(fourth.body.error.code).toBe("RATE_LIMITED");
      expect(Number(fourth.headers.get("retry-after"))).toBeGreaterThan(0);
      // A different address is not affected.
      const elsewhere = await api("POST", "/api/public/leads", submission({ email: "flood5@example.com" }), null, fromIp("203.0.113.10"));
      expect(elsewhere.status).toBe(202);
    });

    it("closes completely when the organization switches the feature off", async () => {
      const off = await api("PUT", "/api/org/features/leads.inbox", { enabled: false }, adminCookie);
      expect(off.status).toBe(200);
      expect((await api("GET", "/api/public/forms/contact")).status).toBe(404);
      expect((await api("POST", "/api/public/leads", submission(), null, fromIp("203.0.113.5"))).status).toBe(404);
      expect((await api("GET", "/api/leads", undefined, adminCookie)).status).toBe(403);
      const on = await api("PUT", "/api/org/features/leads.inbox", { enabled: true }, adminCookie);
      expect(on.status).toBe(200);
      expect((await api("GET", "/api/public/forms/contact")).status).toBe(200);
    });
  });

  // ── who may work the inbox ────────────────────────────────────────────
  describe("access to the inbox", () => {
    it("refuses anonymous callers", async () => {
      expect((await api("GET", "/api/leads")).status).toBe(401);
    });

    it("refuses a Scheduler until the Admin grants the role, and Field Staff always", async () => {
      expect((await api("GET", "/api/leads", undefined, schedulerCookie)).status).toBe(403);
      const grant = await api("PUT", "/api/org/features/leads.inbox", { roles: { Scheduler: true } }, adminCookie);
      expect(grant.status).toBe(200);
      expect((await api("GET", "/api/leads", undefined, schedulerCookie)).status).toBe(200);
      const fieldGrant = await api("PUT", "/api/org/features/leads.inbox", { roles: { Field_Staff: true } }, adminCookie);
      expect(fieldGrant.status).toBe(409);
    });

    it("has nothing to show a provider account acting as itself", async () => {
      const { status } = await api("GET", "/api/leads", undefined, superCookie);
      expect(status).toBe(400);
    });

    it("is scoped to the caller's organization", async () => {
      const created = await api("POST", "/api/platform/organizations", { name: "Other Agency" }, superCookie);
      expect(created.status).toBe(201);
      const otherOrgId = created.body.organization.id as string;
      const made = await api(
        "POST",
        "/api/platform/users",
        { orgId: otherOrgId, email: "owner@other.example", fullName: "Olive Other", role: "Admin" },
        superCookie
      );
      const first = await api("POST", "/api/auth/login", { email: "owner@other.example", password: made.body.temporaryPassword });
      const changed = await api(
        "POST",
        "/api/auth/change-password",
        { currentPassword: made.body.temporaryPassword, newPassword: "Other-2026-ok!" },
        first.cookie
      );
      const otherCookie = changed.cookie ?? first.cookie!;

      // A new organization starts with the default funnel and form.
      const theirs = await inbox(otherCookie);
      expect(theirs.leads).toHaveLength(0);
      expect(theirs.stages.map((s) => s.key)).toEqual(["new", "contacted", "consultation", "qualified", "converted", "closed"]);
      const theirForm = await api("GET", "/api/public/forms/contact?org=other-agency");
      expect(theirForm.status).toBe(200);
      expect(theirForm.body.questions).toHaveLength(8);

      const ours = await inbox(adminCookie);
      const notTheirs = await api("GET", `/api/leads/${ours.leads[0].id}`, undefined, otherCookie);
      expect(notTheirs.status).toBe(404);
    });
  });

  // ── working a lead ────────────────────────────────────────────────────
  describe("working an inquiry", () => {
    let leadId: string;
    let stages: Record<string, string>;

    beforeAll(async () => {
      const box = await inbox(adminCookie);
      leadId = box.leads.find((l) => l.email === "ada@example.com").id;
      stages = Object.fromEntries(box.stages.map((s) => [s.key, s.id]));
    });

    it("moves along the funnel and records the move", async () => {
      const moved = await api("PATCH", `/api/leads/${leadId}`, { stageId: stages.contacted }, adminCookie);
      expect(moved.status).toBe(200);
      expect(moved.body.lead.stage.key).toBe("contacted");
      expect(moved.body.activities[0].type).toBe("stage_changed");
      expect(moved.body.activities[0].details.toKey).toBe("contacted");
      expect(moved.body.activities[0].actorName).toBe("Lisa Torres");
      const audit = await api("GET", "/api/org/audit?limit=10", undefined, adminCookie);
      expect(audit.body.entries[0].action).toBe("lead.stage_changed");
      expect(audit.body.entries[0].details).toEqual({ from: "new", to: "contacted", closedReason: null });
    });

    it("hands it to a Scheduler, tells them, and refuses Field Staff or a stranger", async () => {
      const assigned = await api("PATCH", `/api/leads/${leadId}`, { assignedToUserId: schedulerId }, adminCookie);
      expect(assigned.status).toBe(200);
      expect(assigned.body.lead.assignedToName).toBe("Sam Scheduler");
      expect(assigned.body.activities[0].type).toBe("assigned");
      await waitFor(() => mailOf("lead.assigned").length >= 1);
      const mail = mailOf("lead.assigned")[0]!;
      expect(mail.to).toBe("sam.leads@durablelifeskills.com");
      expect(mail.message.text).toContain("Lisa Torres");
      expect(mail.message.text).not.toMatch(/ada|lovelace/i);

      const box = await inbox(adminCookie, "?assignee=unassigned");
      expect(box.leads.some((l) => l.id === leadId)).toBe(false);
      const mine = await inbox(schedulerCookie, "?assignee=me");
      expect(mine.leads.map((l) => l.id)).toEqual([leadId]);

      expect((await api("PATCH", `/api/leads/${leadId}`, { assignedToUserId: fieldStaffId }, adminCookie)).status).toBe(400);
      expect(
        (await api("PATCH", `/api/leads/${leadId}`, { assignedToUserId: "00000000-0000-4000-a000-000000000099" }, adminCookie)).status
      ).toBe(400);
    });

    it("finds it by name or email", async () => {
      expect((await inbox(adminCookie, "?q=lovel")).leads.map((l) => l.id)).toContain(leadId);
      expect((await inbox(adminCookie, "?q=ada%20love")).leads.map((l) => l.id)).toContain(leadId);
      expect((await inbox(adminCookie, "?q=nobody-here")).leads).toHaveLength(0);
    });

    it("keeps a note on the timeline but out of the audit log", async () => {
      const noted = await api("POST", `/api/leads/${leadId}/notes`, { note: "Spoke with her mother; wants a tour next week." }, schedulerCookie);
      expect(noted.status).toBe(201);
      expect(noted.body.activities[0].type).toBe("note");
      expect(noted.body.activities[0].note).toContain("tour next week");
      expect(noted.body.activities[0].actorName).toBe("Sam Scheduler");
      const audit = await api("GET", "/api/org/audit?limit=5", undefined, adminCookie);
      const entry = audit.body.entries.find((e: any) => e.action === "lead.note_added");
      expect(entry).toBeDefined();
      expect(JSON.stringify(entry.details)).not.toMatch(/tour/);
    });

    it("needs a reason to close, drops the reason on reopening, and will not fake a conversion", async () => {
      expect((await api("PATCH", `/api/leads/${leadId}`, { stageId: stages.closed }, adminCookie)).status).toBe(400);
      const closed = await api("PATCH", `/api/leads/${leadId}`, { stageId: stages.closed, closedReason: "no_response" }, adminCookie);
      expect(closed.status).toBe(200);
      expect(closed.body.lead.closedReason).toBe("no_response");
      const reopened = await api("PATCH", `/api/leads/${leadId}`, { stageId: stages.qualified }, adminCookie);
      expect(reopened.status).toBe(200);
      expect(reopened.body.lead.closedReason).toBeNull();
      const faked = await api("PATCH", `/api/leads/${leadId}`, { stageId: stages.converted }, adminCookie);
      expect(faked.status).toBe(409);
      expect(faked.body.error.code).toBe("USE_CONVERSION");
    });

    it("takes an inquiry that came in by phone", async () => {
      const created = await api(
        "POST",
        "/api/leads",
        { firstName: "Grace", lastName: "Hopper", phone: "719-555-0199", note: "Called the office, asking about day habilitation." },
        schedulerCookie
      );
      expect(created.status).toBe(201);
      expect(created.body.lead.source).toBe("manual");
      expect(created.body.lead.stage.key).toBe("new");
      expect(created.body.activities.map((a: any) => a.type).sort()).toEqual(["note", "submitted"]);
    });
  });

  // ── becoming a client ─────────────────────────────────────────────────
  describe("conversion", () => {
    it("creates the client and moves the inquiry to the won stage in one step", async () => {
      const box = await inbox(adminCookie);
      const lead = box.leads.find((l) => l.email === "ada@example.com");
      const created = await api(
        "POST",
        "/api/clients",
        {
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          medicaidId: "CO1234567",
          dateOfBirth: "2008-04-15",
          activeDiagnoses: [{ code: "F84.0", description: "Autism spectrum disorder" }],
          authorizedSccHoursPerWeek: 10,
          sourceLeadId: lead.id,
        },
        adminCookie
      );
      expect(created.status).toBe(201);
      expect(created.body.client.medicaidId).toBe("CO1234567");
      expect(created.body.convertedLeadId).toBe(lead.id);

      const detail = await api("GET", `/api/leads/${lead.id}`, undefined, adminCookie);
      expect(detail.body.lead.stage.kind).toBe("won");
      expect(detail.body.lead.convertedClientId).toBe(created.body.client.id);
      expect(detail.body.lead.convertedClient.lastName).toBe("Lovelace");
      expect(detail.body.activities[0].type).toBe("converted");

      const audit = await api("GET", "/api/org/audit?limit=5", undefined, adminCookie);
      const actions = audit.body.entries.map((e: any) => e.action);
      expect(actions).toContain("client.created");
      expect(actions).toContain("lead.converted");
      const clientEntry = audit.body.entries.find((e: any) => e.action === "client.created");
      expect(JSON.stringify(clientEntry.details)).not.toMatch(/ada|lovelace|CO1234567/i);

      const list = await api("GET", "/api/clients", undefined, adminCookie);
      expect(list.status).toBe(200);
      expect(list.body.clients.map((c: any) => c.id)).toContain(created.body.client.id);
    });

    it("will not convert the same inquiry twice, change it afterwards, or reuse a Medicaid ID", async () => {
      const box = await inbox(adminCookie);
      const lead = box.leads.find((l) => l.email === "ada@example.com");
      const again = await api("POST", "/api/clients", { firstName: "Ada", lastName: "Lovelace", sourceLeadId: lead.id }, adminCookie);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("LEAD_ALREADY_CONVERTED");
      const stages = Object.fromEntries(box.stages.map((s) => [s.key, s.id]));
      const locked = await api("PATCH", `/api/leads/${lead.id}`, { stageId: stages.contacted }, adminCookie);
      expect(locked.status).toBe(409);
      expect(locked.body.error.code).toBe("LEAD_CONVERTED");
      const dup = await api("POST", "/api/clients", { firstName: "Someone", lastName: "Else", medicaidId: "CO1234567" }, adminCookie);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("MEDICAID_ID_TAKEN");
    });

    it("refuses an inquiry from another organization", async () => {
      const made = await api("POST", "/api/clients", { firstName: "No", lastName: "Body", sourceLeadId: "00000000-0000-4000-a000-000000000001" }, adminCookie);
      expect(made.status).toBe(404);
    });
  });

  // ── the form and the funnel ───────────────────────────────────────────
  describe("configuring the form", () => {
    let hearId: string;
    let phoneId: string;

    it("is for Admins only", async () => {
      expect((await api("GET", "/api/leads/config/questions", undefined, schedulerCookie)).status).toBe(403);
      expect((await api("GET", "/api/leads/config/stages", undefined, schedulerCookie)).status).toBe(403);
    });

    it("adds a choice question and the website starts asking it", async () => {
      const created = await api(
        "POST",
        "/api/leads/config/questions",
        { label: "How did you hear about us?", type: "select", options: ["A friend", "Our website", " A friend ", "Case manager"], required: true },
        adminCookie
      );
      expect(created.status).toBe(201);
      expect(created.body.question.key).toBe("how_did_you_hear_about_us");
      expect(created.body.question.options).toEqual(["A friend", "Our website", "Case manager"]);
      hearId = created.body.question.id;

      const form = await api("GET", "/api/public/forms/contact");
      const keys = form.body.questions.map((q: any) => q.key);
      expect(keys[keys.length - 1]).toBe("how_did_you_hear_about_us");

      // …and a submission without it is now refused.
      const missing = await api("POST", "/api/public/leads", submission({ email: "newq@example.com" }), null, fromIp("203.0.113.20"));
      expect(missing.status).toBe(400);
      expect(missing.body.error.details.map((d: any) => d.key)).toEqual(["how_did_you_hear_about_us"]);
      const ok = await api(
        "POST",
        "/api/public/leads",
        submission({ email: "newq@example.com", how_did_you_hear_about_us: "Case manager" }),
        null,
        fromIp("203.0.113.20")
      );
      expect(ok.status).toBe(202);
      const box = await inbox(adminCookie, "?q=newq");
      expect(box.leads[0].answers.how_did_you_hear_about_us).toBe("Case manager");
      expect(box.leads[0].questionSnapshot.some((q: any) => q.key === "how_did_you_hear_about_us")).toBe(true);
    });

    it("needs two options for a choice and refuses a seventh-hundred question", async () => {
      const one = await api("POST", "/api/leads/config/questions", { label: "Pick", type: "select", options: ["Only"] }, adminCookie);
      expect(one.status).toBe(400);
      const bad = await api("POST", "/api/leads/config/questions", { label: "", type: "short_text" }, adminCookie);
      expect(bad.status).toBe(400);
    });

    it("keeps old answers readable after a question is reworded or retired", async () => {
      const all = await api("GET", "/api/leads/config/questions", undefined, adminCookie);
      phoneId = all.body.questions.find((q: any) => q.key === "phone").id;
      const renamed = await api("PATCH", `/api/leads/config/questions/${hearId}`, { label: "Where did you first hear of DLS?" }, adminCookie);
      expect(renamed.status).toBe(200);
      expect(renamed.body.question.key).toBe("how_did_you_hear_about_us");

      const retired = await api("DELETE", `/api/leads/config/questions/${phoneId}`, undefined, adminCookie);
      expect(retired.status).toBe(200);
      expect(retired.body.question.active).toBe(false);
      const form = await api("GET", "/api/public/forms/contact");
      expect(form.body.questions.some((q: any) => q.key === "phone")).toBe(false);

      // The lead that answered before the change still shows the words it was asked.
      const box = await inbox(adminCookie, "?q=newq");
      const snap = box.leads[0].questionSnapshot.find((q: any) => q.key === "how_did_you_hear_about_us");
      expect(snap.label).toBe("How did you hear about us?");
      expect(box.leads[0].answers.phone).toBe("(719) 555-0100");

      // A submission that still sends the retired key has it dropped, not refused.
      const sent = await api("POST", "/api/public/leads", submission({ email: "nophone@example.com", how_did_you_hear_about_us: "A friend" }), null, fromIp("203.0.113.21"));
      expect(sent.status).toBe(202);
      const again = await inbox(adminCookie, "?q=nophone");
      expect(again.leads[0].phone).toBeNull();
      expect("phone" in again.leads[0].answers).toBe(false);

      const restored = await api("PATCH", `/api/leads/config/questions/${phoneId}`, { active: true }, adminCookie);
      expect(restored.status).toBe(200);
    });

    it("protects the identity and consent questions", async () => {
      const all = await api("GET", "/api/leads/config/questions", undefined, adminCookie);
      const consent = all.body.questions.find((q: any) => q.key === "consent");
      expect((await api("DELETE", `/api/leads/config/questions/${consent.id}`, undefined, adminCookie)).status).toBe(409);
      expect((await api("PATCH", `/api/leads/config/questions/${consent.id}`, { required: false }, adminCookie)).status).toBe(409);
      const reworded = await api("PATCH", `/api/leads/config/questions/${consent.id}`, { label: "Yes, DLS may contact me about this request." }, adminCookie);
      expect(reworded.status).toBe(200);
      expect(reworded.body.question.required).toBe(true);
    });

    it("reorders questions", async () => {
      const all = await api("GET", "/api/leads/config/questions", undefined, adminCookie);
      const ids = all.body.questions.map((q: any) => q.id) as string[];
      const moved = [ids[ids.length - 1], ...ids.slice(0, -1)];
      const res = await api("PUT", "/api/leads/config/questions/order", { ids: moved }, adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.questions.map((q: any) => q.id)).toEqual(moved);
      const form = await api("GET", "/api/public/forms/contact");
      expect(form.body.questions[0].key).toBe("how_did_you_hear_about_us");
      await api("PUT", "/api/leads/config/questions/order", { ids }, adminCookie);
    });
  });

  describe("configuring the funnel", () => {
    let paperworkId: string;

    it("adds a stage before Converted and Closed", async () => {
      const created = await api("POST", "/api/leads/config/stages", { label: "Waiting on paperwork" }, adminCookie);
      expect(created.status).toBe(201);
      expect(created.body.stage.kind).toBe("open");
      paperworkId = created.body.stage.id;
      const { stages } = (await api("GET", "/api/leads/config/stages", undefined, adminCookie)).body;
      expect(stages.map((s: any) => s.key)).toEqual(["new", "contacted", "consultation", "qualified", "waiting_on_paperwork", "converted", "closed"]);
      expect(stages.map((s: any) => s.sortOrder)).toEqual([10, 20, 30, 40, 50, 60, 70]);
    });

    it("renames a system stage but will not retire or remove it", async () => {
      const { stages } = (await api("GET", "/api/leads/config/stages", undefined, adminCookie)).body;
      const closed = stages.find((s: any) => s.key === "closed");
      expect((await api("PATCH", `/api/leads/config/stages/${closed.id}`, { active: false }, adminCookie)).status).toBe(409);
      expect((await api("DELETE", `/api/leads/config/stages/${closed.id}`, undefined, adminCookie)).status).toBe(409);
      const renamed = await api("PATCH", `/api/leads/config/stages/${closed.id}`, { label: "Not proceeding" }, adminCookie);
      expect(renamed.status).toBe(200);
      expect(renamed.body.stage.key).toBe("closed");
    });

    it("will not remove a stage that holds inquiries, and removes an empty one", async () => {
      const box = await inbox(adminCookie, "?q=newq");
      const lead = box.leads[0];
      const moved = await api("PATCH", `/api/leads/${lead.id}`, { stageId: paperworkId }, adminCookie);
      expect(moved.status).toBe(200);
      const blocked = await api("DELETE", `/api/leads/config/stages/${paperworkId}`, undefined, adminCookie);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("STAGE_IN_USE");
      expect(blocked.body.error.message).toMatch(/1 inquiry is/);
      const { stages } = (await api("GET", "/api/leads/config/stages", undefined, adminCookie)).body;
      const contacted = stages.find((s: any) => s.key === "contacted");
      await api("PATCH", `/api/leads/${lead.id}`, { stageId: contacted.id }, adminCookie);
      const removed = await api("DELETE", `/api/leads/config/stages/${paperworkId}`, undefined, adminCookie);
      expect(removed.status).toBe(200);
      const after = (await api("GET", "/api/leads/config/stages", undefined, adminCookie)).body.stages.map((s: any) => s.key);
      expect(after).not.toContain("waiting_on_paperwork");
    });

    it("reorders the open stages", async () => {
      const { stages } = (await api("GET", "/api/leads/config/stages", undefined, adminCookie)).body;
      const ids = stages.map((s: any) => s.id) as string[];
      const swapped = [ids[0], ids[2], ids[1], ...ids.slice(3)];
      const res = await api("PUT", "/api/leads/config/stages/order", { ids: swapped }, adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.stages.map((s: any) => s.key)).toEqual(["new", "consultation", "contacted", "qualified", "converted", "closed"]);
      await api("PUT", "/api/leads/config/stages/order", { ids }, adminCookie);
    });
  });

  // ── housekeeping ──────────────────────────────────────────────────────
  describe("housekeeping", () => {
    it("brings in inquiries the earlier storage-only endpoint saved before the inbox existed", async () => {
      await handle.db.execute(sql`
        insert into consultation_requests (id, first_name, last_name, email, phone, role, service, message, consent, created_at)
        values (gen_random_uuid(), 'Early', 'Bird', 'Early@Example.com', '', 'Individual', '', 'Sent before the inbox existed', 'yes', now() - interval '3 days')`);
      expect(await importConsultationRequests(handle.db, orgId)).toBe(1);
      const box = await inbox(adminCookie, "?q=early");
      expect(box.leads).toHaveLength(1);
      const lead = box.leads[0];
      expect(lead.source).toBe("website");
      expect(lead.email).toBe("early@example.com");
      expect(lead.phone).toBeNull();
      expect(lead.answers.message).toBe("Sent before the inbox existed");
      expect(lead.answers.consent).toBe(true);
      expect(Date.parse(lead.submittedAt)).toBeLessThan(Date.now() - 2 * 86_400_000);
      expect(box.stages.find((s) => s.id === lead.stageId)?.key).toBe("new");
      const left = await handle.db.execute(sql`select count(*)::int as n from consultation_requests`);
      expect((left.rows[0] as { n: number }).n).toBe(0);
      expect(await importConsultationRequests(handle.db, orgId)).toBe(0);
      const audit = await api("GET", "/api/org/audit?limit=5", undefined, adminCookie);
      expect(audit.body.entries.some((e: any) => e.action === "lead.imported" && e.actorUserId === null)).toBe(true);
    });

    it("scrubs the submitting address once the retention period has passed", async () => {
      const box = await inbox(adminCookie);
      const old = box.leads.find((l) => l.email === "flood1@example.com");
      await handle.db.execute(sql`update leads set created_at = now() - interval '100 days' where id = ${old.id}`);
      const run = await api("POST", "/api/platform/jobs/leads.scrub_ip/run", {}, superCookie);
      expect(run.status).toBe(200);
      expect(run.body.ok).toBe(true);
      expect(run.body.items).toBe(1);
      const rows = await handle.db.execute(sql`select ip from leads where id = ${old.id}`);
      expect((rows.rows[0] as { ip: string | null }).ip).toBeNull();
      const kept = await handle.db.execute(sql`select count(*)::int as n from leads where ip is not null`);
      expect((kept.rows[0] as { n: number }).n).toBeGreaterThan(0);
    });
  });
});
