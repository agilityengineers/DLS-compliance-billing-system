// components/admin/clients/format.ts — small formatters the client screens share.
import type { ClientStatus } from "@/lib/api/admin";

export const selectClass = "h-10 w-full rounded-btn border border-border bg-card px-2 text-sm disabled:opacity-60";

/** "03/14/1998" from an ISO date; "—" when there is none. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function clientName(c: { firstName: string; middleName?: string | null; lastName: string }): string {
  return [c.firstName, c.middleName, c.lastName].filter(Boolean).join(" ");
}

export const STATUS_VARIANT: Record<ClientStatus, "success" | "muted" | "warning" | "destructive" | "default"> = {
  Active: "success",
  Interim: "warning",
  Inactive: "muted",
  Discharged: "muted",
  Deceased: "destructive",
};

/** Days from today to `iso` (negative when it has passed); null when there is no date. */
export function daysUntil(iso: string | null | undefined, today: string): number | null {
  if (!iso) return null;
  const a = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const b = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.round((a - b) / 86_400_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
