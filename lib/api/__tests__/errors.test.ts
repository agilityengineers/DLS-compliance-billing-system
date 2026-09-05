// lib/api/__tests__/errors.test.ts — what an API route may say about a failure.
import { afterEach, describe, expect, it, vi } from "vitest";
import { logApiError, toPublicError } from "../errors";

describe("toPublicError", () => {
  it("echoes our own rule text from the code onward, as 409", () => {
    const r = toPublicError("P0001: EVV_GEOFENCE: clock-in 412 m from client residence exceeds 150 m");
    expect(r).toEqual({ error: "EVV_GEOFENCE: clock-in 412 m from client residence exceeds 150 m", status: 409 });
    expect(toPublicError("NMT_AUTHORIZATION_EXHAUSTED: 2 of 2 trips used this week").status).toBe(409);
  });

  it("collapses Postgres text that can carry row values to a bare code", () => {
    const dup = toPublicError(
      'duplicate key value violates unique constraint "clients_medicaid_id_key" DETAIL: Key (medicaid_id)=(CO4481920) already exists.'
    );
    expect(dup).toEqual({ error: "UNIQUE_VIOLATION", status: 409 });
    expect(JSON.stringify(dup)).not.toContain("CO4481920");
    expect(toPublicError('new row violates row-level security policy for table "visits"'))
      .toEqual({ error: "RLS_DENIED", status: 409 });
    expect(toPublicError('new row for relation "evv_logs" violates check constraint "evv_logs_check"'))
      .toEqual({ error: "CHECK_VIOLATION", status: 409 });
  });

  it("never echoes unknown text", () => {
    const r = toPublicError('connection to server at 10.0.0.5 failed: password authentication failed for user "postgres"');
    expect(r).toEqual({ error: "SERVER_ERROR", status: 500 });
    expect(toPublicError(undefined, 503)).toEqual({ error: "SERVER_ERROR", status: 503 });
    expect(toPublicError("TIMESHEET_APPEND_FAILED: Key (id)=(…)")).toEqual({ error: "TIMESHEET_APPEND_FAILED", status: 500 });
  });
});

describe("logApiError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_SENSITIVE_ERRORS;
  });

  it("logs the code only unless LOG_SENSITIVE_ERRORS=true", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logApiError("sync/x", "Key (medicaid_id)=(CO4481920)", "UNIQUE_VIOLATION");
    expect(spy).toHaveBeenLastCalledWith("[sync/x] UNIQUE_VIOLATION");
    process.env.LOG_SENSITIVE_ERRORS = "true";
    logApiError("sync/x", "Key (medicaid_id)=(CO4481920)", "UNIQUE_VIOLATION");
    expect(String(spy.mock.calls.at(-1)?.[0])).toContain("CO4481920");
  });
});
