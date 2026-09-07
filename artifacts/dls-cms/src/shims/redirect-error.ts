// Mirrors Next.js's redirect() control-flow: redirect() throws this, and the
// async-route runner (or a global handler) catches it to perform client nav.
export class RedirectError extends Error {
  readonly to: string;
  readonly digest = "NEXT_REDIRECT";
  constructor(to: string) {
    super(`NEXT_REDIRECT:${to}`);
    this.name = "RedirectError";
    this.to = to;
  }
}

export function isRedirectError(e: unknown): e is RedirectError {
  return e instanceof RedirectError;
}
