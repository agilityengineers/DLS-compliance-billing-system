// Bridge between the Next-style shims (which are called outside React, e.g.
// redirect() inside an async page/action) and wouter's router. A component
// mounted inside <Router> registers the base-aware navigate fn here.

type NavFn = (to: string, opts?: { replace?: boolean }) => void;

let _navigate: NavFn | null = null;

export function setNavigate(fn: NavFn): void {
  _navigate = fn;
}

export function doNavigate(to: string, opts?: { replace?: boolean }): void {
  if (_navigate) _navigate(to, opts);
  else window.location.assign(to);
}

/** Schedule navigation after the current microtask (covers action call sites). */
export function scheduleNavigate(to: string): void {
  queueMicrotask(() => doNavigate(to));
}

// ── revalidation bus (router.refresh() / revalidatePath()) ────────────────
let _rev = 0;
const listeners = new Set<() => void>();

export function bumpRevalidate(): void {
  _rev++;
  listeners.forEach((l) => l());
}

export function getRevalidate(): number {
  return _rev;
}

export function subscribeRevalidate(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
