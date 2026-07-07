// app/admin/page.tsx — Agency overview: 4 stat cards + today's visits.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { listClients, listVisits } from "@/lib/data/repo-core";
import { computeQaFlags } from "@/lib/qa/flags";
import { evaluateUnbilledNotes } from "@/lib/billing/readiness";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT = {
  Scheduled: "muted", In_Progress: "warning", Completed: "success", Cancelled: "destructive", Billed: "default"
} as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AdminDashboard() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  const today = todayIso();

  const [clients, todaysVisits, qa, readiness] = await Promise.all([
    listClients(),
    listVisits({ from: today, to: today, excludeCancelled: true }),
    computeQaFlags(),
    evaluateUnbilledNotes()
  ]);

  const expiredPlans = clients.filter((c) => c.service_plan_end && c.service_plan_end < today).length;
  const staffToday = new Set(todaysVisits.map((v) => v.staff_id)).size;
  const ready = readiness.filter((r) => r.ok);
  const readyUnits = ready.reduce((s, r) => s + (r.note.calculated_billing_units ?? 0), 0);

  const stats = [
    {
      label: "Active clients",
      value: clients.length,
      sub: expiredPlans === 0 ? "All plans current" : `${expiredPlans} plan${expiredPlans > 1 ? "s" : ""} expired`,
      href: "/admin/clients"
    },
    { label: "Visits today", value: todaysVisits.length, sub: `${staffToday} staff scheduled`, href: "/admin/schedule" },
    { label: "Open QA flags", value: qa.open.length, sub: "Resolve before export", href: "/admin/qa" },
    { label: "Claim-ready notes", value: ready.length, sub: `${readyUnits} units unbilled`, href: "/admin/billing" }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Agency overview</h1>
        <p className="text-sm text-muted-foreground">Visits, documentation, and claim readiness at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-card border border-border bg-card p-4 transition-colors hover:border-plum-accent">
            <div className="label-caps text-muted-foreground">{s.label}</div>
            <div className="stat-number mt-1.5">{s.value}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">{s.sub}</div>
          </Link>
        ))}
      </div>

      <section className="rounded-card border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-medium">
          Today&rsquo;s visits — {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </h2>
        <ul>
          {todaysVisits.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 text-sm last:border-0">
              <span className="w-14 tabular-nums text-muted-foreground">
                {new Date(v.scheduled_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(" ", "")}
              </span>
              <span className="flex-1 font-medium">{v.client_name}</span>
              <span className="text-muted-foreground">
                {v.visit_type === "Job_Coaching" ? "Job C." : v.visit_type.replace(/_/g, " ")} · {v.staff_name.split(" ").map((p, i) => (i === 0 ? `${p[0]}.` : p)).join(" ")}
              </span>
              <Badge variant={STATUS_VARIANT[v.status as keyof typeof STATUS_VARIANT]}>{v.status.replace(/_/g, " ")}</Badge>
            </li>
          ))}
          {todaysVisits.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">No visits scheduled today.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
