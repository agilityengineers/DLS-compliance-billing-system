// components/admin/schedule-board.tsx — staff × weekday grid (prototype
// interaction: select a visit, then reassign / move to next day). Visits
// whose client has NO active physician order are flagged red and CANNOT be
// saved — the DB trigger rejects them and the error surfaces here.
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { upsertVisit, findActiveOrder } from "@/app/admin/schedule/actions";
import type { PhysicianOrder, VisitWithNames } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface Props {
  visits: VisitWithNames[];
  staff: { id: string; full_name: string }[];
  clients: { id: string; name: string }[];
  orders: PhysicianOrder[];
  weekMonday: string; // YYYY-MM-DD
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ScheduleBoard({ visits, staff, clients, orders, weekMonday }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekMonday, i)), [weekMonday]);

  const orderActiveOn = (visit: VisitWithNames, dateIso: string) => {
    const o = orders.find((x) => x.id === visit.physician_order_id);
    return !!o && o.client_id === visit.client_id &&
      o.effective_date <= dateIso && (!o.expiration_date || o.expiration_date >= dateIso);
  };

  function moveSelected(offsetDays: number) {
    const visit = visits.find((v) => v.id === selected);
    if (!visit) return;
    setError(null);
    setNotice(null);
    const start = new Date(visit.scheduled_start);
    const end = new Date(visit.scheduled_end);
    start.setDate(start.getDate() + offsetDays);
    end.setDate(end.getDate() + offsetDays);
    startTransition(async () => {
      const res = await upsertVisit({
        id: visit.id,
        client_id: visit.client_id,
        staff_id: visit.staff_id,
        visit_type: visit.visit_type,
        scheduled_start: toLocalIso(start),
        scheduled_end: toLocalIso(end),
        physician_order_id: visit.physician_order_id,
        status: visit.status
      });
      if (!res.ok) setError(res.error ?? "Move rejected.");
      else {
        setNotice("Visit moved.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!selected || pending} onClick={() => moveSelected(1)}>
          Move selected → next day
        </Button>
        {selected && (
          <button className="text-sm text-muted-foreground underline" onClick={() => setSelected(null)}>
            Clear selection
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-btn bg-pill-danger px-3 py-2 text-sm text-pill-danger-fg">
          <strong className="font-semibold">Cannot be saved:</strong> {error}
        </p>
      )}
      {notice && <p className="rounded-btn bg-pill-success px-3 py-2 text-sm text-pill-success-fg">{notice}</p>}

      <div className={cn("overflow-x-auto rounded-card border border-border bg-card", pending && "opacity-60")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="label-caps w-40 px-3 py-2.5 text-left text-muted-foreground">Staff</th>
              {days.map((d) => (
                <th key={d} className="label-caps px-3 py-2.5 text-left text-muted-foreground">
                  {new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-3 py-3 align-top font-medium">{s.full_name}</td>
                {days.map((d) => {
                  const cellVisits = visits.filter(
                    (v) => v.staff_id === s.id && v.scheduled_start.slice(0, 10) === d
                  );
                  return (
                    <td key={d} className="min-w-36 space-y-1.5 px-1.5 py-2 align-top">
                      {cellVisits.map((v) => {
                        const noOrder = !orderActiveOn(v, d);
                        const isSelected = selected === v.id;
                        return (
                          <button
                            key={v.id}
                            onClick={() => setSelected(isSelected ? null : v.id)}
                            className={cn(
                              "block w-full rounded-btn border p-2 text-left text-xs",
                              noOrder
                                ? "border-pill-danger-fg/40 bg-pill-danger text-pill-danger-fg"
                                : "border-transparent bg-plum-soft",
                              isSelected && "ring-2 ring-plum-accent"
                            )}
                            title={noOrder ? "No active physician order — cannot be saved" : undefined}
                          >
                            <div className="font-semibold">{v.client_name.split(" ").slice(-1)[0]}</div>
                            <div className={noOrder ? "" : "text-muted-foreground"}>
                              {new Date(v.scheduled_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "")}
                              {" · "}
                              {v.visit_type === "Job_Coaching" ? "Job C." : v.visit_type.replace(/_/g, " ")}
                            </div>
                            {noOrder && <div className="mt-0.5 font-semibold">No MD order</div>}
                          </button>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewVisitForm staff={staff} clients={clients} weekMonday={weekMonday} onSaved={() => router.refresh()} />
    </div>
  );
}

function toLocalIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function NewVisitForm({
  staff, clients, weekMonday, onSaved
}: {
  staff: { id: string; full_name: string }[];
  clients: { id: string; name: string }[];
  weekMonday: string;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [visitType, setVisitType] = useState("SCC");
  const [date, setDate] = useState(weekMonday);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [orderInfo, setOrderInfo] = useState<{ id: string; label: string } | null | "unknown">("unknown");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  async function checkOrder(nextClient: string, nextDate: string) {
    if (!nextClient) return;
    setOrderInfo("unknown");
    const found = await findActiveOrder(nextClient, nextDate);
    setOrderInfo(found);
  }

  return (
    <details className="rounded-card border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">New visit</summary>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Client</span>
          <select
            className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              void checkOrder(e.target.value, date);
            }}
          >
            <option value="">Select…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Staff</span>
          <select className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Select…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Type</span>
          <select className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
            <option value="SCC">SCC</option>
            <option value="Job_Coaching">Job Coaching</option>
            <option value="Day_Habilitation">Day Habilitation</option>
            <option value="Early_Intervention">Early Intervention</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Date</span>
          <input
            type="date" className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm" value={date}
            onChange={(e) => {
              setDate(e.target.value);
              void checkOrder(clientId, e.target.value);
            }}
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">Start</span>
          <input type="time" className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="label-caps text-muted-foreground">End</span>
          <input type="time" className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>

      {clientId && orderInfo !== "unknown" && (
        orderInfo ? (
          <p className="mt-3 rounded-btn bg-pill-success px-3 py-2 text-sm text-pill-success-fg">
            Active physician order: {orderInfo.label}
          </p>
        ) : (
          <p className="mt-3 rounded-btn bg-pill-danger px-3 py-2 text-sm text-pill-danger-fg">
            No active physician order for this client on {date} — the visit CANNOT be saved
            (server-enforced). Record a new order first.
          </p>
        )
      )}

      {error && <p className="mt-3 rounded-btn bg-pill-danger px-3 py-2 text-sm text-pill-danger-fg" role="alert">{error}</p>}
      {ok && <p className="mt-3 rounded-btn bg-pill-success px-3 py-2 text-sm text-pill-success-fg">Visit saved.</p>}

      <Button
        className="mt-4"
        disabled={pending || !clientId || !staffId}
        onClick={() => {
          setError(null);
          setOk(false);
          startTransition(async () => {
            const res = await upsertVisit({
              client_id: clientId,
              staff_id: staffId,
              visit_type: visitType,
              scheduled_start: `${date}T${start}:00`,
              scheduled_end: `${date}T${end}:00`,
              physician_order_id: orderInfo && orderInfo !== "unknown" ? orderInfo.id : null,
              status: "Scheduled"
            });
            if (!res.ok) setError(res.error ?? "Rejected.");
            else {
              setOk(true);
              onSaved();
            }
          });
        }}
      >
        {pending ? "Saving…" : "Save visit"}
      </Button>
    </details>
  );
}
