// Shim for `next/cache` — revalidation bumps a global counter that re-runs
// mounted async routes (see useRevalidate / AsyncRoute).
import { bumpRevalidate } from "./nav-bridge";

export function revalidatePath(_path?: string, _type?: "page" | "layout"): void {
  bumpRevalidate();
}

export function revalidateTag(_tag?: string): void {
  bumpRevalidate();
}

export function unstable_cache<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return fn;
}

export function unstable_noStore(): void {}
