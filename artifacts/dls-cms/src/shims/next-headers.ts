// Shim for `next/headers` cookies() in the client-only SPA (demo mode).
//
// Backed by an in-memory Map (survives client-side/wouter navigation, which is
// the same JS context) plus localStorage for persistence across full reloads.
// We intentionally do NOT use document.cookie: when the app is embedded in a
// cross-site iframe (e.g. the Replit canvas preview), browsers silently block
// third-party cookie writes, so a cookie-backed demo session never sticks and
// sign-in appears to do nothing. localStorage works inside partitioned iframe
// storage, so the demo session persists reliably everywhere.
//
// httpOnly/secure/sameSite are accepted for API-compatibility but are no-ops
// (demo mode only — synthetic data, no PHI).

interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none" | boolean;
  path?: string;
  maxAge?: number;
  expires?: Date;
}

interface CookieEntry {
  name: string;
  value: string;
}

const STORAGE_KEY = "dls_demo_cookies";

const store = new Map<string, string>();
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [name, value] of Object.entries(parsed)) store.set(name, value);
  } catch {
    // ignore malformed/blocked storage — fall back to in-memory only
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, string> = {};
    for (const [name, value] of store) obj[name] = value;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // storage may be unavailable/full — in-memory state still works this session
  }
}

function readAll(): CookieEntry[] {
  hydrate();
  return Array.from(store, ([name, value]) => ({ name, value }));
}

export function cookies() {
  return {
    get(name: string): CookieEntry | undefined {
      hydrate();
      return store.has(name) ? { name, value: store.get(name)! } : undefined;
    },
    getAll(): CookieEntry[] {
      return readAll();
    },
    has(name: string): boolean {
      hydrate();
      return store.has(name);
    },
    set(name: string, value: string, options?: CookieOptions): void {
      hydrate();
      // maxAge === 0 (or negative) is a deletion, matching cookie semantics.
      if (options && options.maxAge !== undefined && options.maxAge <= 0) {
        store.delete(name);
      } else {
        store.set(name, value);
      }
      persist();
    },
    delete(name: string): void {
      hydrate();
      store.delete(name);
      persist();
    },
  };
}

export function headers() {
  return new Headers();
}
