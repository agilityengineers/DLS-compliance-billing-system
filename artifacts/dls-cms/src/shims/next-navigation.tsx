// Shim for `next/navigation` on top of wouter.
import { useLocation, useSearch, useParams as useWouterParams } from "wouter";
import { RedirectError } from "./redirect-error";
import { bumpRevalidate, scheduleNavigate } from "./nav-bridge";

export { RedirectError } from "./redirect-error";

/** Next-style redirect: schedules client nav and throws to short-circuit. */
export function redirect(to: string): never {
  scheduleNavigate(to);
  throw new RedirectError(to);
}

export function permanentRedirect(to: string): never {
  return redirect(to);
}

class NotFoundError extends Error {
  readonly digest = "NEXT_NOT_FOUND";
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export function notFound(): never {
  throw new NotFoundError();
}

export function useRouter() {
  const [, navigate] = useLocation();
  return {
    push: (to: string) => navigate(to),
    replace: (to: string) => navigate(to, { replace: true }),
    refresh: () => bumpRevalidate(),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    prefetch: () => {},
  };
}

export function usePathname(): string {
  const [location] = useLocation();
  return location || "/";
}

export function useSearchParams(): URLSearchParams {
  const search = useSearch();
  return new URLSearchParams(search);
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useWouterParams() as T;
}
