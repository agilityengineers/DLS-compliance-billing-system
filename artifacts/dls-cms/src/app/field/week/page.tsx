// app/field/week/page.tsx — My week (offline-first from Dexie).
"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/offline/db";
import { Badge } from "@/components/ui/badge";
import { agencyAddDays, agencyMondayOf, agencyTodayIso, formatAgencyCalendarDate, utcIsoToAgencyDate } from "@workspace/time";

const STATUS_VARIANT = {
  Scheduled: "muted", In_Progress: "warning", Completed: "success", Cancelled: "destructive", Billed: "default"
} as const;

export default function WeekPage() {
  const todayStr = agencyTodayIso();
  const monday = agencyMondayOf(todayStr);
  const days = Array.from({ length: 7 }, (_, i) => agencyAddDays(monday, i));

  const visits = useLiveQuery(async () => {
    const from = days[0];
    const to = days[6];
    const all = await db.visits.toArray();
    const clients = await db.clients.toArray();
    return all
      .filter((v) => {
        const d = utcIsoToAgencyDate(v.scheduled_start);
        return d >= from && d <= to;
      })
      .map((v) => {
        const c = clients.find((x) => x.id === v.client_id);
        return { ...v, client_name: c ? `${c.first_name} ${c.last_name}` : "Client" };
      })
      .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <h1 className="page-title">My week</h1>
      {days.map((dStr) => {
        const dayVisits = (visits ?? []).filter((v) => utcIsoToAgencyDate(v.scheduled_start) === dStr);
        return (
          <section key={dStr} className="space-y-2">
            <h2 className="label-caps text-muted-foreground">
              {formatAgencyCalendarDate(dStr, { weekday: "long", month: "numeric", day: "numeric" })}
              {dStr === todayStr && " (today)"}
            </h2>
            {dayVisits.length === 0 ? (
              <p className="rounded-card-m border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                No visits.
              </p>
            ) : (
              dayVisits.map((v) => (
                <Link
                  key={v.id}
                  href={`/field/visits/${v.id}`}
                  className="flex min-h-touch items-center justify-between gap-3 rounded-card-m border border-border bg-card p-4 active:bg-muted"
                >
                  <div>
                    <div className="font-medium">{v.client_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(v.scheduled_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {" – "}
                      {new Date(v.scheduled_end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {" · "}
                      {v.visit_type.replace(/_/g, " ")}
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[v.status as keyof typeof STATUS_VARIANT]}>
                    {v.status.replace(/_/g, " ")}
                  </Badge>
                </Link>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
