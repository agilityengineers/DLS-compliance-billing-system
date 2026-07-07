// Shim for `next/headers` cookies() backed by document.cookie. httpOnly is a
// no-op in the browser (demo mode only — synthetic data, no PHI).

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

function readAll(): CookieEntry[] {
  if (typeof document === "undefined" || !document.cookie) return [];
  return document.cookie
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const name = decodeURIComponent(pair.slice(0, eq));
      const value = decodeURIComponent(pair.slice(eq + 1));
      return { name, value };
    });
}

function writeCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (typeof document === "undefined") return;
  let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  str += `; path=${options.path ?? "/"}`;
  if (options.maxAge !== undefined) str += `; max-age=${options.maxAge}`;
  if (options.expires) str += `; expires=${options.expires.toUTCString()}`;
  if (options.sameSite) {
    const s = options.sameSite === true ? "lax" : options.sameSite;
    str += `; samesite=${s}`;
  }
  if (options.secure) str += "; secure";
  document.cookie = str;
}

export function cookies() {
  return {
    get(name: string): CookieEntry | undefined {
      return readAll().find((c) => c.name === name);
    },
    getAll(): CookieEntry[] {
      return readAll();
    },
    has(name: string): boolean {
      return readAll().some((c) => c.name === name);
    },
    set(name: string, value: string, options?: CookieOptions): void {
      writeCookie(name, value, options);
    },
    delete(name: string): void {
      writeCookie(name, "", { maxAge: 0 });
    },
  };
}

export function headers() {
  return new Headers();
}
