// components/admin/leads/format.ts — small formatters the inbox screens share.
import type { LeadQuestionType } from "@/lib/api/admin";

/** "just now", "12 min ago", "3 hrs ago", "2 days ago", then a date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** An answer as given, in words a person reads. */
export function formatAnswer(value: string | boolean | null | undefined, type: LeadQuestionType): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "yes_no" || typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** The person's name as the inbox shows it. */
export function leadName(lead: { firstName: string; lastName: string }): string {
  return `${lead.firstName} ${lead.lastName}`.trim();
}
