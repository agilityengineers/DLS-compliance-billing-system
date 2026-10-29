// artifacts/api-server/src/__tests__/leads-concurrency.test.ts — the leads
// workflow when things happen at the same time, against a PostgreSQL database
// created for this file alone and dropped afterwards (helpers/isolated-db.ts),
// never the database TEST_DATABASE_URL itself names.
//
// The production-readiness audit of 2026-10-29 (H3, H4) found three places
// where "read, then write" could lose or duplicate work: converting an
// inquiry into a client, importing the rows the earlier storage-only endpoint
// left behind, and the public form's treatment of a second submission from the
// same email. Each test here makes the race happen — the same request many
// times at once, a transaction holding the row while another request arrives,
// several "boot processes" importing one table — and checks what is left.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createApp } from "../app";
import { bootstrapPlatform } from "../lib/bootstrap";
import { loadConfig } from "../lib/config";
import { importConsultationRequests, resolveConsultationImportOrg } from "../lib/leads";
import { Mailer, MemoryTransport } from "../lib/mail";
import { countRows, createIsolatedDb, type IsolatedDb } from "./helpers/isolated-db";

const TEST_URL = process.env.TEST_DATABASE_URL;
const SITE = "https://www.durablelifeskills.com";

interface ApiResponse<T = any> {
  status: number;
  body: T;
  cookie: string | null;
  headers: Headers;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** "done" if `p` settles inside `ms`, else "waiting" — for asserting that a request is blocked. */
async function settledWithin(p: Promise<unknown>, ms: number): Promise<"done" | "waiting"> {
  return Promise.race([p.then(() => "done" as const, () => "done" as const), sleep(ms).then(() => "waiting" as const)]);
}

describe.skipIf(!TEST_URL)("leads under concurrency", () => {
  let iso: IsolatedDb;
  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  const env = {
    NODE_ENV: "test",
    PUBLIC_FORM_ORIGINS: SITE,
    LEAD_MAX_PER_IP: "3",
    LEAD_WINDOW_MINUTES: "10",
    APP_BASE_URL: "https://portal.example.test",
  };
  const config = loadConfig(env);
  const mailTransport = new MemoryTransport();

  let superCookie: string;
  let orgId: string;
  let adminCookie: string;
  let stages: Record<string, string>;

  async function api<T = any>(method: string, path: string, body?: unknown, cookie?: string | null, headers: Record<string, string> = {}): Promise<ApiResponse<T>> {
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

  async function createAndSignIn(email: string, fullName: string, role: string, newPassword: string): Promise<string> {
    const created = await api("POST", "/api/platform/users", { orgId, email, fullName, role }, superCookie);
    expect(created.status).toBe(201);
    const temporaryPassword = created.body.temporaryPassword as string;
    const first = await api("POST", "/api/auth/login", { email, password: temporaryPassword });
    expect(first.status).toBe(200);
    const changed = await api("POST", "/api/auth/change-password", { currentPassword: temporaryPassword, newPassword }, first.cookie);
    expect(changed.status).toBe(200);
    return changed.cookie ?? first.cookie!;
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
    page: `${SITE}/contact.html`,
    ...over,
  });
  const fromIp = (ip: string) => ({ "x-forwarded-for": ip, origin: SITE });
  const submit = (body: Record<string, unknown>, ip: string) => api("POST", "/api/public/leads", body, null, fromIp(ip));

  interface LeadDbRow {
    id: string;
    org_id: string;
    stage_id: string;
    email: string | null;
    answers: Record<string, unknown>;
    submission_id: string | null;
    converted_client_id: string | null;
    import_source: string | null;
    import_source_id: string | null;
  }
  const leadsByEmail = async (email: string): Promise<LeadDbRow[]> =>
    (await iso.db.execute(sql`select * from leads where email = ${email} order by created_at, id`)).rows as unknown as LeadDbRow[];
  const activitiesOf = async (leadId: string): Promise<{ type: string; details: Record<string, unknown> | null }[]> =>
    (await iso.db.execute(sql`select type, details from lead_activities where lead_id = ${leadId} order by created_at, id`)).rows as any[];
  const auditsFor = async (action: string, targetId: string): Promise<{ details: Record<string, unknown> }[]> =>
    (await iso.db.execute(sql`select details from audit_log where action = ${action} and target_id = ${targetId}`)).rows as any[];
  const attemptOutcomes = async (where: ReturnType<typeof sql>): Promise<Record<string, number>> => {
    const rows = (await iso.db.execute(sql`select outcome, count(*)::int as n from lead_submission_attempts where ${where} group by outcome`)).rows as {
      outcome: string;
      n: number;
    }[];
    return Object.fromEntries(rows.map((r) => [r.outcome, Number(r.n)]));
  };

  /** A website inquiry to work with; returns its row. */
  async function freshLead(email: string, ip: string): Promise<LeadDbRow> {
    const res = await submit(submission({ email, submissionId: randomUUID() }), ip);
    expect(res.status).toBe(202);
    const [lead] = await leadsByEmail(email);
    expect(lead).toBeDefined();
    return lead!;
  }

  const insertLegacy = (email: string, message: string) =>
    iso.db.execute(sql`
      insert into consultation_requests (id, first_name, last_name, email, phone, role, service, message, consent, created_at)
      values (gen_random_uuid(), 'Legacy', 'Row', ${email}, '', 'Individual', '', ${message}, 'yes', now() - interval '10 days')`);

  beforeAll(async () => {
    iso = await createIsolatedDb(TEST_URL!, "dls_leads_cc");
    // A request the storage-only endpoint stored before the inbox existed,
    // present at the very first boot, when the default organization is the
    // only one there is.
    await insertLegacy("legacy@example.com", "Stored before the inbox existed");
    const boot = await bootstrapPlatform(iso.db, config);
    expect(boot.consultationsImported).toBe(1);
    expect(boot.consultationImportSkipped).toBeNull();

    const app = createApp({ db: iso.db, config, quiet: true, mailer: new Mailer(iso.db, config, mailTransport) });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const superLogin = await api("POST", "/api/auth/login", { email: config.superAdminEmail, password: "Success2026" });
    expect(superLogin.status).toBe(200);
    superCookie = superLogin.cookie!;
    const orgs = await api("GET", "/api/platform/organizations", undefined, superCookie);
    orgId = orgs.body.organizations[0].id;
    adminCookie = await createAndSignIn("cc.admin@durablelifeskills.com", "Cass Admin", "Admin", "Leads-2026-ok!");
    const box = await api("GET", "/api/leads?limit=0", undefined, adminCookie);
    expect(box.status).toBe(200);
    stages = Object.fromEntries((box.body.stages as { key: string; id: string }[]).map((s) => [s.key, s.id]));
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (iso) await iso.destroy();
  });

  // ── H4: retries and changed submissions ──────────────────────────────
  describe("the public form", () => {
    it("folds a retry carrying the same submission key into one inquiry, even when every copy arrives at once", async () => {
      const key = randomUUID();
      const body = submission({ email: "retry@example.com", submissionId: key });
      // Six copies from six addresses, so the per-address lock is not what
      // saves us: only the unique key on the lead row can.
      const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => submit(body, `198.51.100.${n}`)));
      expect(results.map((r) => r.status)).toEqual([202, 202, 202, 202, 202, 202]);

      const leads = await leadsByEmail("retry@example.com");
      expect(leads).toHaveLength(1);
      expect(leads[0]!.submission_id).toBe(key);
      expect(await attemptOutcomes(sql`submission_id = ${key}`)).toEqual({ created: 1, retry: 5 });
      const activities = await activitiesOf(leads[0]!.id);
      expect(activities.filter((a) => a.type === "submitted")).toHaveLength(6);
      expect(activities.filter((a) => a.details?.duplicate === true)).toHaveLength(5);

      // The website sends the receipt again a moment later: still the same inquiry.
      expect((await submit(body, "198.51.100.7")).status).toBe(202);
      expect(await leadsByEmail("retry@example.com")).toHaveLength(1);

      // …and the administrators heard about it once.
      await sleep(300);
      const notices = mailTransport.sent.filter((m) => m.message.kind === "lead.received" && m.message.text.includes(`/admin/leads/${leads[0]!.id}`));
      expect(notices).toHaveLength(1);
    });

    it("treats identical answers without a key as a retry, and changed answers from the same email as a second inquiry", async () => {
      const first = submission({ email: "family@example.com" }); // no submissionId: an older copy of the website script
      expect((await submit(first, "198.51.100.20")).status).toBe(202);
      expect((await submit(first, "198.51.100.21")).status).toBe(202);
      let leads = await leadsByEmail("family@example.com");
      expect(leads).toHaveLength(1);
      expect((await activitiesOf(leads[0]!.id)).filter((a) => a.details?.duplicate === true)).toHaveLength(1);

      // The same person corrects the message a minute later.
      const corrected = submission({ email: "family@example.com", message: "Correction: my daughter, not my son, and she finishes in May.", submissionId: randomUUID() });
      expect((await submit(corrected, "198.51.100.22")).status).toBe(202);
      leads = await leadsByEmail("family@example.com");
      expect(leads).toHaveLength(2);
      expect(leads[0]!.answers.message).toBe(first.message);
      expect(leads[1]!.answers.message).toContain("Correction");

      // Cross-referenced on both timelines, so whoever is working the first one looks at the second.
      const newer = await activitiesOf(leads[1]!.id);
      expect(newer).toHaveLength(1);
      expect(newer[0]!.details?.earlierLeadId).toBe(leads[0]!.id);
      const older = await activitiesOf(leads[0]!.id);
      expect(older.some((a) => a.type === "submitted" && a.details?.resubmittedAs === leads[1]!.id)).toBe(true);

      // Audit entries never carry what was written.
      const received = await auditsFor("lead.received", leads[1]!.id);
      expect(received).toHaveLength(1);
      expect(JSON.stringify(received[0]!.details)).not.toMatch(/daughter|lovelace/i);

      // The same corrected answers again, under a new key: the answers say it is a retry.
      expect((await submit({ ...corrected, submissionId: randomUUID() }, "198.51.100.23")).status).toBe(202);
      expect(await leadsByEmail("family@example.com")).toHaveLength(2);
    });

    it("counts every attempt toward the per-address limit: a rejected form, a honeypot hit and a retry included", async () => {
      const ip = "198.51.100.40";
      expect((await submit(submission({ email: "" }), ip)).status).toBe(400);
      expect((await submit(submission({ email: "bot@example.com", company_website: "http://spam.example" }), ip)).status).toBe(202);
      expect((await submit(submission({ email: "limit@example.com", submissionId: randomUUID() }), ip)).status).toBe(202);
      const fourth = await submit(submission({ email: "limit-refused@example.com", submissionId: randomUUID() }), ip);
      expect(fourth.status).toBe(429);
      expect(fourth.body.error.code).toBe("RATE_LIMITED");
      expect(fourth.headers.get("retry-after")).toBe("600");
      expect(await attemptOutcomes(sql`ip = ${ip}`)).toEqual({ invalid: 1, ignored: 1, created: 1, rate_limited: 1 });
      expect(await leadsByEmail("limit-refused@example.com")).toHaveLength(0);
      expect(await leadsByEmail("bot@example.com")).toHaveLength(0);
    });

    it("lets exactly the allowed number through when one address sends a burst at once", async () => {
      const ip = "198.51.100.41";
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, n) => submit(submission({ email: `burst${n}@example.com`, submissionId: randomUUID() }), ip))
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 202)).toHaveLength(3);
      expect(statuses.filter((s) => s === 429)).toHaveLength(9);
      expect(await countRows(iso.db, "leads", `ip = '${ip}'`)).toBe(3);
      expect(await attemptOutcomes(sql`ip = ${ip}`)).toEqual({ created: 3, rate_limited: 9 });
    });
  });

  // ── H3: conversion ────────────────────────────────────────────────────
  describe("conversion", () => {
    it("creates one client when the same inquiry is converted eight times at once, and tells the rest it is already converted", async () => {
      const lead = await freshLead("convert-burst@example.com", "198.51.100.60");
      const results = await Promise.all(
        Array.from({ length: 8 }, () => api("POST", "/api/clients", { firstName: "Con", lastName: "Verted", sourceLeadId: lead.id }, adminCookie))
      );
      const created = results.filter((r) => r.status === 201);
      const refused = results.filter((r) => r.status === 409);
      expect(created).toHaveLength(1);
      expect(refused).toHaveLength(7);
      expect(refused.every((r) => r.body.error.code === "LEAD_ALREADY_CONVERTED")).toBe(true);
      const clientId = created[0]!.body.client.id as string;
      expect(created[0]!.body.client.sourceLeadId).toBe(lead.id);

      expect(await countRows(iso.db, "clients", `source_lead_id = '${lead.id}'`)).toBe(1);
      expect(await countRows(iso.db, "clients", `first_name = 'Con' and last_name = 'Verted'`)).toBe(1);
      const [after] = await leadsByEmail("convert-burst@example.com");
      expect(after!.converted_client_id).toBe(clientId);
      expect(after!.stage_id).toBe(stages.converted);
      expect((await activitiesOf(lead.id)).filter((a) => a.type === "converted")).toHaveLength(1);
      expect(await auditsFor("lead.converted", lead.id)).toHaveLength(1);
    });

    it("refuses a stage change that was waiting on an in-flight conversion once that conversion lands", async () => {
      const lead = await freshLead("convert-locked@example.com", "198.51.100.61");

      // A conversion that has taken the lead's row lock and not yet committed:
      // a connection of its own, holding a transaction open.
      const other = await iso.pool.connect();
      try {
        await other.query("begin");
        await other.query("select id from leads where id = $1 for update", [lead.id]);

        const patch = api("PATCH", `/api/leads/${lead.id}`, { stageId: stages.contacted }, adminCookie);
        expect(await settledWithin(patch, 400)).toBe("waiting");

        const client = (
          await other.query<{ id: string }>(
            "insert into clients (org_id, first_name, last_name, source_lead_id) values ($1, 'Locked', 'Winner', $2) returning id",
            [orgId, lead.id]
          )
        ).rows[0]!;
        await other.query("update leads set stage_id = $2, converted_client_id = $3 where id = $1", [lead.id, stages.converted, client.id]);
        await other.query("commit");

        const res = await patch;
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("LEAD_CONVERTED");
        const [after] = await leadsByEmail("convert-locked@example.com");
        expect(after!.stage_id).toBe(stages.converted);
        expect(after!.converted_client_id).toBe(client.id);
        expect((await activitiesOf(lead.id)).some((a) => a.type === "stage_changed")).toBe(false);
      } finally {
        other.release();
      }
    });

    it("makes a conversion wait for an in-flight stage change and record the stage it then finds", async () => {
      const lead = await freshLead("convert-after-move@example.com", "198.51.100.62");

      const other = await iso.pool.connect();
      try {
        await other.query("begin");
        await other.query("update leads set stage_id = $2 where id = $1", [lead.id, stages.contacted]);

        const convert = api("POST", "/api/clients", { firstName: "After", lastName: "Move", sourceLeadId: lead.id }, adminCookie);
        expect(await settledWithin(convert, 400)).toBe("waiting");
        await other.query("commit");

        const res = await convert;
        expect(res.status).toBe(201);
        const [after] = await leadsByEmail("convert-after-move@example.com");
        expect(after!.stage_id).toBe(stages.converted);
        expect(after!.converted_client_id).toBe(res.body.client.id);
        const [audit] = await auditsFor("lead.converted", lead.id);
        expect(audit!.details).toMatchObject({ from: "contacted", to: "converted" });
      } finally {
        other.release();
      }
    });

    it("still reports a Medicaid ID clash as such, and leaves the inquiry unconverted when it does", async () => {
      const taken = await api("POST", "/api/clients", { firstName: "Already", lastName: "Here", medicaidId: "CO7777777" }, adminCookie);
      expect(taken.status).toBe(201);
      const lead = await freshLead("medicaid-clash@example.com", "198.51.100.63");
      const clash = await api("POST", "/api/clients", { firstName: "Clash", lastName: "Case", medicaidId: "CO7777777", sourceLeadId: lead.id }, adminCookie);
      expect(clash.status).toBe(409);
      expect(clash.body.error.code).toBe("MEDICAID_ID_TAKEN");
      const [after] = await leadsByEmail("medicaid-clash@example.com");
      expect(after!.converted_client_id).toBeNull();
      expect(after!.stage_id).not.toBe(stages.converted);
      expect(await countRows(iso.db, "clients", `source_lead_id = '${lead.id}'`)).toBe(0);
      // It can still be converted properly afterwards.
      const ok = await api("POST", "/api/clients", { firstName: "Clash", lastName: "Case", sourceLeadId: lead.id }, adminCookie);
      expect(ok.status).toBe(201);
    });
  });

  // ── H3: the legacy import ─────────────────────────────────────────────
  describe("the legacy import", () => {
    it("filed the row found at first boot under the default organization, because it was the only one, and says so", async () => {
      const leads = await leadsByEmail("legacy@example.com");
      expect(leads).toHaveLength(1);
      const lead = leads[0]!;
      expect(lead.org_id).toBe(orgId);
      expect(lead.import_source).toBe("consultation_requests");
      expect(lead.import_source_id).toMatch(/^[0-9a-f-]{36}$/);
      const [audit] = await auditsFor("lead.imported", lead.id);
      expect(audit!.details).toMatchObject({ from: "consultation_requests", sourceId: lead.import_source_id, attribution: "sole_organization" });
      expect(JSON.stringify(audit!.details)).not.toMatch(/legacy@|before the inbox/i);
    });

    it("imports each stored request exactly once when three processes boot at the same time", async () => {
      for (let n = 0; n < 15; n += 1) await insertLegacy(`legacy-${n}@example.com`, `Stored request ${n}`);
      const before = await countRows(iso.db, "leads", "import_source = 'consultation_requests'");

      // Three pools: three API processes, each running the boot-time import.
      const processes = [iso, iso.openAnother(), iso.openAnother()];
      const counts = await Promise.all(processes.map((h) => importConsultationRequests(h.db, orgId, { attribution: "explicit" })));
      expect(counts.reduce((a, b) => a + b, 0)).toBe(15);

      expect(await countRows(iso.db, "consultation_requests")).toBe(0);
      expect(await countRows(iso.db, "leads", "import_source = 'consultation_requests'")).toBe(before + 15);
      const distinct = await iso.db.execute(sql`select count(distinct import_source_id)::int as n from leads where import_source = 'consultation_requests'`);
      expect((distinct.rows[0] as { n: number }).n).toBe(before + 15);
      for (let n = 0; n < 15; n += 1) {
        const rows = await leadsByEmail(`legacy-${n}@example.com`);
        expect(rows).toHaveLength(1);
        expect((await activitiesOf(rows[0]!.id)).filter((a) => a.details?.importedFrom === "consultation_requests")).toHaveLength(1);
        expect(await auditsFor("lead.imported", rows[0]!.id)).toHaveLength(1);
      }
      // Nothing left for the next boot.
      expect(await importConsultationRequests(iso.db, orgId)).toBe(0);
    });

    it("will not guess the organization once there are two, and imports where the operator points", async () => {
      const made = await api("POST", "/api/platform/organizations", { name: "Second Agency" }, superCookie);
      expect(made.status).toBe(201);
      const secondOrgId = made.body.organization.id as string;
      await insertLegacy("legacy-late@example.com", "Arrived after a second organization existed");

      const boot = await bootstrapPlatform(iso.db, config);
      expect(boot.consultationsImported).toBe(0);
      expect(boot.consultationImportSkipped).toMatch(/2 organizations exist/);
      expect(await countRows(iso.db, "consultation_requests")).toBe(1);
      expect(await leadsByEmail("legacy-late@example.com")).toHaveLength(0);

      const wrong = await resolveConsultationImportOrg(iso.db, { defaultOrgSlug: config.defaultOrgSlug, consultationImportOrgSlug: "nobody-here" });
      expect(wrong.ok).toBe(false);

      const named = loadConfig({ ...env, CONSULTATION_IMPORT_ORG_SLUG: "second-agency" });
      const boot2 = await bootstrapPlatform(iso.db, named);
      expect(boot2.consultationsImported).toBe(1);
      expect(boot2.consultationImportSkipped).toBeNull();
      const [lead] = await leadsByEmail("legacy-late@example.com");
      expect(lead!.org_id).toBe(secondOrgId);
      const [audit] = await auditsFor("lead.imported", lead!.id);
      expect(audit!.details).toMatchObject({ attribution: "configured" });
      expect(await countRows(iso.db, "consultation_requests")).toBe(0);
    });
  });
});
