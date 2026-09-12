// artifacts/api-server/__tests__/credentialing.test.ts — the registry over HTTP,
// against a real in-process PostgreSQL.
//
// This is the end-to-end proof that the registry persists: the Express router
// and Drizzle mapping run against pglite with the real migration applied, and
// a toggle flipped through the API is still flipped when read back.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seedRequirements } from "@workspace/db/seed";
import { createCredentialingRouter, type CredentialingDb } from "../src/routes/credentialing";

const MIGRATION = join(
  import.meta.dirname, "..", "..", "..", "lib", "db", "migrations", "0001_credentialing.sql"
);

let client: PGlite;
let server: Server;
let base: string;

const api = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${base}${path}`, init);
  return { status: res.status, body: await res.json() as never };
};
const json = (body: unknown): RequestInit => ({
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

beforeAll(async () => {
  client = new PGlite({ extensions: { pgcrypto } });
  await client.exec(readFileSync(MIGRATION, "utf8"));
  const db = drizzle(client) as unknown as CredentialingDb;

  const app = express();
  app.use(express.json());
  app.use("/api", createCredentialingRouter(db));
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  base = `http://127.0.0.1:${addr.port}/api`;
}, 120_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await client.close();
});

beforeEach(async () => {
  await client.exec("delete from staff_credentials; delete from requirements;");
  await seedRequirements((sql, params) => client.query(sql, params));
});

describe("GET /requirements", () => {
  it("serves the registry in display order", async () => {
    const { status, body } = await api("/requirements");
    expect(status).toBe(200);
    const rows = body as { id: string; sortOrder: number }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.sortOrder)).toEqual([...rows.map((r) => r.sortOrder)].sort((a, b) => a - b));
  });

  it("round-trips the jsonb columns as real values, not strings", async () => {
    const { body } = await api("/requirements");
    const qmap = (body as { id: string; source: { kind: string }; appliesTo: string[] }[])
      .find((r) => r.id === "qmap")!;
    expect(qmap.source.kind).toBe("training");
    expect(qmap.appliesTo).toEqual(["Field_Staff"]);
  });
});

describe("PATCH /requirements/:id", () => {
  it("persists a toggle — the whole point of the registry", async () => {
    const before = await api("/requirements/hipaa", json({ required: false }));
    expect(before.status).toBe(200);

    // Read it back through a fresh request, not the write's own response.
    const { body } = await api("/requirements");
    const hipaa = (body as { id: string; required: boolean; gating: boolean }[])
      .find((r) => r.id === "hipaa")!;
    expect(hipaa.required).toBe(false);
    // Gating cannot outlive Required.
    expect(hipaa.gating).toBe(false);
  });

  it("records a verification sign-off", async () => {
    const { status, body } = await api("/requirements/caps_check", json({
      verificationStatus: "confirmed",
      verifiedOn: "2026-09-12",
      verifiedBy: "K. Sandoval",
      verificationNote: "Read C.R.S. 26-3.1-111 and confirmed with the CAPS Check Unit."
    }));
    expect(status).toBe(200);
    expect((body as { verificationStatus: string }).verificationStatus).toBe("confirmed");

    const fresh = await api("/requirements");
    const caps = (fresh.body as { id: string; verifiedBy: string; verifiedOn: string }[])
      .find((r) => r.id === "caps_check")!;
    expect(caps.verifiedBy).toBe("K. Sandoval");
    expect(caps.verifiedOn).toBe("2026-09-12");
  });

  it("refuses a sign-off with nobody behind it", async () => {
    const { status, body } = await api("/requirements/caps_check", json({
      verificationStatus: "confirmed",
      verificationNote: "looks fine"
    }));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/who verified it/i);
  });

  it("404s an unknown requirement", async () => {
    const { status } = await api("/requirements/not_a_requirement", json({ required: false }));
    expect(status).toBe(404);
  });

  it("rejects a malformed body", async () => {
    const { status } = await api("/requirements/hipaa", json({ required: "yes please" }));
    expect(status).toBe(400);
  });

  it("leaves fields the caller did not send alone", async () => {
    await api("/requirements/hipaa", json({ required: false }));
    const { body } = await api("/requirements");
    const hipaa = (body as { id: string; label: string; verificationNote: string | null }[])
      .find((r) => r.id === "hipaa")!;
    expect(hipaa.label).toBe("HIPAA privacy & security");
    expect(hipaa.verificationNote).toContain("no fixed interval");
  });
});

describe("GET /staff-credentials", () => {
  const vega = "00000000-0000-4000-a000-000000000003";
  const price = "00000000-0000-4000-a000-000000000004";

  beforeEach(async () => {
    await client.query(
      `insert into staff_credentials (staff_id, requirement_id, status, completed_on)
       values ($1, 'hipaa', 'verified', '2026-01-15'), ($2, 'hipaa', 'in_progress', null)`,
      [vega, price]
    );
  });

  it("returns every row when unfiltered", async () => {
    const { status, body } = await api("/staff-credentials");
    expect(status).toBe(200);
    expect(body as unknown[]).toHaveLength(2);
  });

  it("narrows to one staff member", async () => {
    const { body } = await api(`/staff-credentials?staffId=${vega}`);
    const rows = body as { staff_id: string; status: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].staff_id).toBe(vega);
    expect(rows[0].status).toBe("verified");
  });

  it("serves snake_case keys — the shape the engine reads", async () => {
    const { body } = await api(`/staff-credentials?staffId=${price}`);
    const row = (body as Record<string, unknown>[])[0];
    expect(Object.keys(row).sort()).toEqual([
      "completed_on", "expires_on", "note", "requirement_id", "staff_id", "status", "waive_reason", "waived_by"
    ]);
  });
});
