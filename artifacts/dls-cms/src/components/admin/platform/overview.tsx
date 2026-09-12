// components/admin/platform/overview.tsx — the provider's landing screen.
// Three questions, in order: what needs me (attention), what happened this
// week (activity), and where is everything (the console map). Every number
// is a link to the screen that explains it.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Info } from "lucide-react";
import { platformApi, type PlatformOverview } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { PLATFORM_LINKS } from "@/components/admin/nav-config";
import { ConfigAudit } from "@/components/admin/config-audit";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function PlatformOverviewPanel() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void platformApi.overview().then(setData).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading overview…</p>;

  const employees = data.accounts.byRole.Scheduler + data.accounts.byRole.Field_Staff;
  const warnings = data.attention.filter((a) => a.severity === "warning").length;
  const notes = data.attention.length - warnings;

  const stats = [
    {
      label: "Organizations",
      value: data.organizations.active,
      sub: data.organizations.suspended > 0 ? `${plural(data.organizations.suspended, "suspended organization")}` : "all active",
      href: "/admin/platform/organizations",
    },
    {
      label: "Active accounts",
      value: data.accounts.active,
      sub: `${plural(data.accounts.byRole.Admin, "admin")} · ${plural(employees, "employee")}`,
      href: "/admin/platform/accounts",
    },
    {
      label: "Capabilities available",
      value: `${data.features.available} of ${data.features.total}`,
      sub: `${data.features.byStatus.ready.available} ready · ${data.features.byStatus.preview.available} preview · ${data.features.byStatus.in_development.available} in development`,
      href: "/admin/platform/features",
    },
    {
      label: "Active sessions",
      value: data.sessions.active,
      sub: data.sessions.supportSessions > 0 ? `${plural(data.sessions.supportSessions, "support session")} running` : "no support sessions running",
      href: "/admin/platform/sessions",
    },
  ];

  const breakdown: [string, number][] = [
    ["Admins", data.accounts.byRole.Admin],
    ["Schedulers", data.accounts.byRole.Scheduler],
    ["Field Staff", data.accounts.byRole.Field_Staff],
    ["Provider accounts", data.accounts.platform],
    ["Suspended", data.accounts.suspended],
    ["Holding a temporary password", data.accounts.temporaryPassword],
    ["Never signed in", data.accounts.neverSignedIn],
    ["No sign-in for 90 days", data.accounts.dormant],
  ];

  return (
    <div className="space-y-6">
      {/* ── needs attention ─────────────────────────────────────────── */}
      <section className="rounded-card border border-border bg-card">
        <h2 className="flex items-center justify-between border-b border-border px-4 py-3 font-medium">
          Needs attention
          <span className="text-xs font-normal text-muted-foreground">
            {data.attention.length === 0 ? "Nothing right now" : `${plural(warnings, "warning")} · ${plural(notes, "note")}`}
          </span>
        </h2>
        {data.attention.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Every organization has a working administrator and nothing is waiting on you.
          </p>
        ) : (
          <ul>
            {data.attention.map((a, i) => (
              <li key={`${a.kind}-${i}`} className="border-b border-border last:border-0">
                <Link href={a.href} className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                  {a.severity === "warning" ? (
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-pill-warning-fg" aria-label="warning" />
                  ) : (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-plum-accent" aria-label="note" />
                  )}
                  <span className="flex-1">{a.message}</span>
                  <span className="shrink-0 text-xs text-plum underline">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── the numbers ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-card border border-border bg-card p-4 transition-colors hover:border-plum-accent">
            <div className="label-caps text-muted-foreground">{s.label}</div>
            <div className="stat-number mt-1.5">{s.value}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">{s.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-medium">Activity</h2>
          <dl className="grid grid-cols-3 divide-x divide-border text-center">
            <div className="p-4">
              <dt className="label-caps text-muted-foreground">Sign-ins, 7 days</dt>
              <dd className="stat-number mt-1">{data.activity.signInsLast7Days}</dd>
            </div>
            <div className="p-4">
              <dt className="label-caps text-muted-foreground">Config changes, 7 days</dt>
              <dd className="stat-number mt-1">{data.activity.configChangesLast7Days}</dd>
            </div>
            <div className="p-4">
              <dt className="label-caps text-muted-foreground">Support sessions, 30 days</dt>
              <dd className="stat-number mt-1">{data.activity.supportSessionsLast30Days}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-card border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-medium">Accounts</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 p-4 text-sm sm:grid-cols-4 lg:grid-cols-2">
            {breakdown.map(([label, n]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* ── recent changes ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-plum">Recent changes</h2>
          <Link href="/admin/platform/audit" className="text-sm text-plum underline">Full audit log</Link>
        </div>
        <ConfigAudit scope="platform" limit={10} />
      </section>

      {/* ── console map ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-plum">Console map</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLATFORM_LINKS.filter((l) => l.href !== "/admin/platform").map((l) => (
            <Link key={l.href} href={l.href} className="rounded-card border border-border bg-card p-4 transition-colors hover:border-plum-accent">
              <div className="font-medium">{l.label}</div>
              <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
