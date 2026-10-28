import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@workspace/db";
import { consultationsRouter } from "../routes/consultations";

describe("public consultation storage", () => {
  const pg = new PGlite();
  let base: string;
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  const lead = () => ({
    requestId: randomUUID(), firstName: "Test", lastName: "Visitor",
    email: "consultation-test@example.test", phone: "+1 (719) 555-0123",
    role: "Individual", service: "", message: "Synthetic test request",
    consent: "yes", company_website: "",
  });
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${base}/consultation-requests`, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  beforeAll(async () => {
    await pg.exec(readFileSync("lib/db/migrations/0003_consultations.sql", "utf8"));
    const app = express();
    app.use(express.json());
    app.use(consultationsRouter(drizzle(pg) as unknown as Db));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });
  beforeEach(async () => {
    await pg.exec("TRUNCATE consultation_requests, consultation_limits");
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pg.close();
  });
  it("stores all fields and consent with a server timestamp; retries are idempotent", async () => {
    const input = lead();
    expect((await post(input)).status).toBe(201);
    expect((await post(input)).body).toEqual({ ok: true });
    const { rows } = await pg.query<any>("SELECT * FROM consultation_requests");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: input.requestId, first_name: input.firstName, last_name: input.lastName,
      email: input.email, phone: input.phone, role: input.role, service: "",
      message: input.message, consent: "yes",
    });
    expect(rows[0].created_at).toBeTruthy();
    expect((await post({ ...input, message: "changed" })).status).toBe(409);
    expect((await fetch(`${base}/consultation-requests`)).status).toBe(404);
  });
  it.each([
    { firstName: "  " }, { lastName: "" }, { email: "not-email" },
    { phone: "not a phone" }, { consent: "no" }, { consent: undefined },
    { role: "Admin" }, { service: "unknown" }, { requestId: "bad" },
    { company_website: "https://spam.test" }, { message: "x".repeat(5001) },
  ])("rejects invalid input without storing it: %j", async (invalid) => {
    expect((await post({ ...lead(), ...invalid })).status).toBe(400);
    expect((await pg.query("SELECT * FROM consultation_requests")).rows).toHaveLength(0);
  });
  it("rejects cross-site submissions", async () => {
    expect((await post(lead(), { "sec-fetch-site": "cross-site" })).status).toBe(400);
  });
  it("limits attempts atomically and includes retry timing", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => post(lead())));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    const limited = results.filter((r) => r.status === 429);
    expect(limited).toHaveLength(3);
    expect(Number(limited[0]!.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("never confirms or exposes details when storage fails", async () => {
    await pg.exec("ALTER TABLE consultation_requests RENAME TO unavailable_requests");
    try {
      const result = await post(lead());
      expect(result.status).toBe(503);
      expect(result.body).not.toHaveProperty("ok");
      expect(JSON.stringify(result.body)).not.toContain("consultation-test");
    } finally {
      await pg.exec("ALTER TABLE unavailable_requests RENAME TO consultation_requests");
    }
  });
});
