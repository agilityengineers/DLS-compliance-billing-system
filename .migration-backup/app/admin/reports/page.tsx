// app/admin/reports/page.tsx — units delivered vs authorized, current week.
// Over-authorization is highlighted (the same condition that blocks claims).
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listClients } from "@/lib/data/repo-core";
import { listNotes } from "@/lib/data/repo-field";
import type { Client, VisitType } from "@/lib/supabase/types";

const SERVICES: { type: VisitType; label: string; field: keyof Client }[] = [
  { type: "SCC", label: "SCC", field: "authorized_scc_hours_per_week" },
  { type: "Job_Coaching", label: "Job Coaching", field: "authorized_jc_hours_per_week" },
  { type: "Day_Habilitation", label: "Day Habilitation", field: "authorized_dh_hours_per_week" },
  { type: "Early_Intervention", label: "Early Intervention", field: "authorized_ei_hours_per_week" }
];

function sundayOfCurrentWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ReportsPage() {
  try {
    await requireRole("Admin", "Scheduler");
  } catch {
    redirect("/admin");
  }

  const weekStart = sundayOfCurrentWeek();
  const weekEnd = addDays(weekStart, 6);
  const [clients, notes] = await Promise.all([
    listClients(),
    listNotes({ from: weekStart, to: weekEnd })
  ]);

  const rows = clients.flatMap((client) =>
    SERVICES.map((svc) => {
      const authorizedUnits = Math.round(Number(client[svc.field] ?? 0) * 4);
      if (authorizedUnits <= 0) return null;
      const delivered = notes
        .filter((n) => n.client_id === client.id && n.visit_type === svc.type && !n.cancellation_reason)
        .reduce((s, n) => s + (n.calculated_billing_units ?? 0), 0);
      return {
        key: `${client.id}:${svc.type}`,
        client: `${client.last_name}, ${client.first_name}`,
        service: svc.label,
        delivered,
        authorized: authorizedUnits,
        over: delivered > authorizedUnits
      };
    }).filter(Boolean)
  ) as { key: string; client: string; service: string; delivered: number; authorized: number; over: boolean }[];

  const anyOver = rows.some((r) => r.over);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Units delivered vs authorized · week of{" "}
          {new Date(`${weekStart}T12:00:00`).toLocaleDateString([], { month: "long", day: "numeric" })}.
          {anyOver && (
            <span className="ml-1 font-medium text-pill-danger-fg">
              Over-authorization detected — the affected claims are blocked.
            </span>
          )}
        </p>
      </div>

      <div className="space-y-4 rounded-card border border-border bg-card p-5">
        {rows.map((r) => {
          const pct = Math.min(100, Math.round((r.delivered / r.authorized) * 100));
          const overflowPct = r.over ? Math.min(40, Math.round(((r.delivered - r.authorized) / r.authorized) * 100)) : 0;
          return (
            <div key={r.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">
                  {r.client} <span className="text-muted-foreground">· {r.service}</span>
                </span>
                <span className={r.over ? "font-semibold text-pill-danger-fg" : "text-muted-foreground"}>
                  {r.delivered} / {r.authorized} units{r.over && " — OVER AUTHORIZATION"}
                </span>
              </div>
              <div
                className="flex h-3 overflow-hidden rounded-pill bg-muted"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={r.authorized}
                aria-valuenow={r.delivered}
                aria-label={`${r.client} ${r.service}: ${r.delivered} of ${r.authorized} authorized units`}
              >
                <div
                  className={r.over ? "bg-pill-danger-fg" : "bg-primary"}
                  style={{ width: `${pct}%` }}
                />
                {r.over && <div className="bg-destructive" style={{ width: `${overflowPct}%` }} />}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No clients with weekly authorizations.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Units are 15-minute increments (CMS 8-minute rounding). Cancelled visits are excluded.
        Over-authorization also appears as a claim blocker on the Billing screen.
      </p>
    </div>
  );
}
