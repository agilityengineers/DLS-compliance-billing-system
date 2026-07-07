// app/field/page.tsx — Today home. Offline-first: renders from Dexie
// (hydrated by /api/field/bootstrap). User-switchable style: Visits list
// (DEFAULT) or Dashboard — the preference persists per user.
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/offline/db";
import { Badge } from "@/components/ui/badge";
import { setFieldHome } from "./actions";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = {
  Scheduled: "muted", In_Progress: "warning", Completed: "success", Cancelled: "destructive", Billed: "default"
} as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type HomeStyle = "visits" | "dashboard";

export default function FieldHome() {
  const [style, setStyle] = useState<HomeStyle>("visits");
  const [, startTransition] = useTransition();
  const today = todayIso();

  useEffect(() => {
    const saved = localStorage.getItem("dls_field_home");
    if (saved === "dashboard" || saved === "visits") setStyle(saved);
  }, []);

  const visits = useLiveQuery(async () => {
    const all = await db.visits.toArray();
    const clients = await db.clients.toArray();
    return all
      .filter((v) => v.scheduled_start.slice(0, 10) === today && v.status !== "Cancelled")
      .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
      .map((v) => {
        const c = clients.find((x) => x.id === v.client_id);
        return { ...v, client_name: c ? `${c.first_name} ${c.last_name}` : "Client" };
      });
  }, [today]);

  const weekStats = useLiveQuery(async () => {
    const notes = await db.progress_notes.toArray();
    const meds = await db.medication_logs.toArray();
    const pendingMeds = meds.filter((m) => m.scheduled_time.slice(0, 10) === today && m.status === "Missed").length;
    const notesToday = notes.filter((n) => n.date === today).length;
    const pendingSync = await db.sync_queue.count();
    return { notesToday, pendingMeds, pendingSync };
  }, [today]);

  const dateLabel = useMemo(
    () => new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }),
    []
  );

  function switchStyle(next: HomeStyle) {
    setStyle(next);
    localStorage.setItem("dls_field_home", next);
    startTransition(() => void setFieldHome(next)); // persists per user, server-side
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {dateLabel} · {visits?.length ?? 0} visits
        </p>
        <div className="flex rounded-btn border border-border bg-card p-0.5" role="tablist" aria-label="Home style">
          {(["visits", "dashboard"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={style === s}
              onClick={() => switchStyle(s)}
              className={cn(
                "rounded-[8px] px-3 py-1.5 text-xs font-medium capitalize",
                style === s ? "bg-plum text-white" : "text-muted-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {style === "dashboard" && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Visits today" value={visits?.length ?? 0} sub={`${visits?.filter((v) => v.status === "Completed").length ?? 0} completed`} />
          <StatCard label="Notes today" value={weekStats?.notesToday ?? 0} sub="submitted" />
          <StatCard label="Meds due" value={weekStats?.pendingMeds ?? 0} sub="pending action" />
          <StatCard label="Pending sync" value={weekStats?.pendingSync ?? 0} sub="queued offline" />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {(visits ?? []).map((v) => (
          <Link
            key={v.id}
            href={`/field/visits/${v.id}`}
            className="flex min-h-touch items-center justify-between gap-3 rounded-card-m border border-border bg-card p-4 active:bg-muted"
          >
            <div>
              <div className="text-base font-medium">{v.client_name}</div>
              <div className="text-sm text-muted-foreground">
                {fmtTime(v.scheduled_start)} – {fmtTime(v.scheduled_end)} · {v.visit_type.replace(/_/g, " ")}
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[v.status as keyof typeof STATUS_VARIANT]}>
              {v.status.replace(/_/g, " ")}
            </Badge>
          </Link>
        ))}
        {visits && visits.length === 0 && (
          <p className="rounded-card-m border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No visits scheduled today.
          </p>
        )}
        {!visits && <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>}
      </div>

      <Link
        href="/field/emar"
        className="flex min-h-touch items-center justify-center rounded-card-m border border-border bg-card p-4 font-medium active:bg-muted"
      >
        eMAR — medication list
      </Link>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-card-m border border-border bg-card p-4">
      <div className="label-caps text-muted-foreground">{label}</div>
      <div className="stat-number mt-1">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
