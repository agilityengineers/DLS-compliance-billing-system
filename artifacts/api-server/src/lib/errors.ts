import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod/v4";
import { logger } from "./logger";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Sign in to continue.") => new HttpError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have access to that.") => new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found.") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details ?? undefined } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION",
        message: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
        details: err.issues,
      },
    });
    return;
  }
  // Body-parser and friends set `status`/`type`; treat those as client errors.
  const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
  if (status >= 500) logger.error({ err }, "Unhandled request error");
  res.status(status).json({
    error: {
      code: status >= 500 ? "SERVER_ERROR" : "BAD_REQUEST",
      message: status >= 500 ? "Something went wrong on our side." : (err as Error).message,
    },
  });
};
