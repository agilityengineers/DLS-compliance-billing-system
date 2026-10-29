// What may reach the log, and what a temporary password may reach. Pure
// logic — no database, no network.
import { describe, expect, it } from "vitest";
import { redactUrlForLog } from "../app";
import { configProblems, loadConfig } from "../lib/config";
import { LogTransport, inviteEmail, passwordResetEmail } from "../lib/mail";
import { passwordChangeGate } from "../middlewares/auth";

const ENVELOPE = { to: "ivy@example.test", from: "noreply@durablelifeskills.com", fromName: "Durable Life Skills", replyTo: null };

describe("mail fallback logging", () => {
  const invite = inviteEmail({
    fullName: "Ivy Invite",
    orgName: "Durable Life Skills, Inc.",
    roleLabel: "Admin",
    link: "https://portal.example.test/auth/set-password?token=SECRET-INVITE-TOKEN",
    expiresAt: new Date("2026-11-05T00:00:00Z"),
  });
  const reset = passwordResetEmail({
    fullName: "Ivy Invite",
    link: "https://portal.example.test/auth/set-password?token=SECRET-RESET-TOKEN&reset=1",
    expiresAt: new Date("2026-10-29T13:00:00Z"),
  });

  it("writes the envelope and never the text, so a single-use link never reaches the log", async () => {
    const lines: { fields: Record<string, unknown>; message: string }[] = [];
    const transport = new LogTransport({ logBodies: false, log: (fields, message) => lines.push({ fields, message }) });
    await transport.deliver(invite, ENVELOPE);
    await transport.deliver(reset, ENVELOPE);
    expect(lines).toHaveLength(2);
    expect(JSON.stringify(lines)).not.toContain("SECRET-INVITE-TOKEN");
    expect(JSON.stringify(lines)).not.toContain("SECRET-RESET-TOKEN");
    expect(JSON.stringify(lines)).not.toContain("set-password");
    expect(lines[0]!.fields).toEqual({
      kind: "account.invite",
      to: "ivy@example.test",
      from: "noreply@durablelifeskills.com",
      subject: invite.subject,
    });
    expect(lines[0]!.fields).not.toHaveProperty("body");
    expect(lines[0]!.message).toContain("recorded in the outbox");
  });

  it("writes the text only when a developer asks for it", async () => {
    const lines: { fields: Record<string, unknown>; message: string }[] = [];
    const transport = new LogTransport({ logBodies: true, log: (fields, message) => lines.push({ fields, message }) });
    await transport.deliver(invite, ENVELOPE);
    expect(String(lines[0]!.fields.body)).toContain("SECRET-INVITE-TOKEN");
    expect(lines[0]!.message).toContain("development only");
  });

  it("defaults to redacted everywhere but development, and production cannot opt in", () => {
    expect(loadConfig({ NODE_ENV: "production" }).mail.logBodies).toBe(false);
    expect(loadConfig({ NODE_ENV: "production", MAIL_LOG_BODIES: "true" }).mail.logBodies).toBe(false);
    expect(loadConfig({ NODE_ENV: "test" }).mail.logBodies).toBe(false);
    expect(loadConfig({}).mail.logBodies).toBe(false);
    expect(loadConfig({ NODE_ENV: "development" }).mail.logBodies).toBe(true);
    expect(loadConfig({ NODE_ENV: "development", MAIL_LOG_BODIES: "false" }).mail.logBodies).toBe(false);
    expect(loadConfig({ NODE_ENV: "test", MAIL_LOG_BODIES: "true" }).mail.logBodies).toBe(true);
  });

  it("refuses to start with a mail key but no link base", () => {
    expect(configProblems(loadConfig({ NODE_ENV: "production", SENDGRID_API_KEY: "SG.key" }))).toHaveLength(1);
    expect(configProblems(loadConfig({ NODE_ENV: "production", SENDGRID_API_KEY: "SG.key" }))[0]).toContain("APP_BASE_URL");
    expect(
      configProblems(loadConfig({ NODE_ENV: "production", SENDGRID_API_KEY: "SG.key", APP_BASE_URL: "https://portal.example.test/" }))
    ).toEqual([]);
    expect(configProblems(loadConfig({ NODE_ENV: "production" }))).toEqual([]);
  });
});

describe("request log redaction", () => {
  it("drops the query string and blanks the token in the link-check path", () => {
    expect(redactUrlForLog("/api/auth/set-password?token=abc")).toBe("/api/auth/set-password");
    expect(redactUrlForLog("/api/auth/token/invite/0123456789abcdef?x=1")).toBe("/api/auth/token/invite/[redacted]");
    expect(redactUrlForLog("/api/auth/token/password_reset/0123456789abcdef")).toBe("/api/auth/token/password_reset/[redacted]");
    expect(redactUrlForLog("/api/leads")).toBe("/api/leads");
    expect(redactUrlForLog(undefined)).toBeUndefined();
  });
});

describe("password change gate", () => {
  function outcome(path: string, mustChangePassword: boolean | null): { code?: string } | undefined {
    const res = { locals: mustChangePassword === null ? {} : { auth: { realUser: { mustChangePassword } } } };
    let passed: { code?: string } | undefined = { code: "next was not called" };
    // Only `path` on the request and `locals` on the response are read.
    passwordChangeGate({ path } as never, res as never, ((err?: { code?: string }) => {
      passed = err;
    }) as never);
    return passed;
  }

  it("lets a temporary password see itself, replace itself and sign out, and nothing else", () => {
    for (const path of ["/api/auth/me", "/api/auth/actor", "/api/auth/change-password", "/api/auth/logout"]) {
      expect(outcome(path, true)).toBeUndefined();
    }
    for (const path of ["/api/healthz", "/api/readyz", "/api/public/leads", "/api/jobs/all/run", "/api/auth/login", "/api/auth/login/mfa", "/api/auth/forgot-password", "/api/auth/token/invite/abc", "/api/auth/accept-invite", "/api/auth/reset-password"]) {
      expect(outcome(path, true)).toBeUndefined();
    }
    for (const path of ["/api/platform/system", "/api/org/users", "/api/leads", "/api/auth/totp/setup", "/api/auth/impersonate", "/api/auth/totp"]) {
      expect(outcome(path, true)?.code).toBe("PASSWORD_CHANGE_REQUIRED");
    }
  });

  it("is invisible to everyone else", () => {
    expect(outcome("/api/platform/system", false)).toBeUndefined();
    expect(outcome("/api/platform/system", null)).toBeUndefined();
  });
});
