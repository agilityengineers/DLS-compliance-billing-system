// lib/api/client.ts — the one way the web app talks to the API server.
// Same-origin (/api) with the httpOnly session cookie; JSON in, JSON out;
// errors carry the server's { code, message } so screens can react to them.

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiClientError(e: unknown, code?: string): e is ApiClientError {
  return e instanceof ApiClientError && (code === undefined || e.code === code);
}

const API_BASE = "/api";

export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "same-origin",
      ...rest,
      headers: {
        accept: "application/json",
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...(headers as Record<string, string> | undefined),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    throw new ApiClientError(0, "NETWORK", "Cannot reach the sign-in service. Check your connection and try again.", e);
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? (res.status === 401 ? "UNAUTHENTICATED" : "SERVER_ERROR"),
      err?.message ?? `Request failed (${res.status}).`,
      err?.details
    );
  }
  return body as T;
}

/** Message safe to show a user for any thrown value. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
