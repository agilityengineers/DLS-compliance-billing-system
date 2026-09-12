import { createServer, request, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createStartupGate } from "../lib/startup-gate";

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) =>
    server!.close((err) => err ? reject(err) : resolve()));
  server = undefined;
});

async function setup() {
  const gate = createStartupGate();
  server = createServer(gate.listener);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener");
  const get = (path: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: address.port, path }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject);
    req.end();
  });
  return { gate, get };
}

describe("startup readiness gate", () => {
  it("rejects health checks and business requests until initialization finishes", async () => {
    const { get } = await setup();
    for (const path of ["/api/healthz", "/api", "/api/auth/me"]) {
      expect(await get(path)).toEqual({ status: 503, body: '{"status":"starting"}' });
    }
  });

  it("delegates to the application only after it is ready", async () => {
    const { gate, get } = await setup();
    expect((await get("/api/healthz")).status).toBe(503);
    gate.ready((_req, res) => {
      res.writeHead(200);
      res.end("ready");
    });
    expect(await get("/api/healthz")).toEqual({ status: 200, body: "ready" });
  });
});