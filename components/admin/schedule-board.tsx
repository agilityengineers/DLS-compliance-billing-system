// components/admin/schedule-board.tsx — drag-and-drop weekly master calendar
// (@dnd-kit). Dragging a visit card onto a staff/day cell reassigns it via
// upsertVisit — which REJECTS if active_physician_order_id is missing.
"use client";

import { useMemo, useState } from "react";
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { upsertVisit } from "@/app/admin/schedule/actions";
import type { Visit, Client, StaffUser } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface Props {
  visits: (Visit & { clients: Pick<Client, "first_name" | "last_name"> | null })[];
  staff: Pick<StaffUser, "id" | "full_name">[];
  weekStart: string; // YYYY-MM-DD (Sunday)
}

const DAY_MS = 86_400_000;

function VisitCard({ visit }: { visit: Props["visits"][number] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: visit.id });
  const start = new Date(visit.scheduled_start);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        "cursor-grab rounded-md border border-border bg-card p-2 text-xs shadow-sm",
        isDragging && "z-10 opacity-80 shadow-md",
        !visit.active_physician_order_id && "border-red-300 bg-red-50"
      )}
    >
      <div className="font-medium">
        {visit.clients ? `${visit.clients.last_name}, ${visit.clients.first_name}` : "Client"}
      </div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        <Badge variant={visit.active_physician_order_id ? "muted" : "destructive"}>
          {visit.active_physician_order_id ? visit.visit_type.replace("_", " ") : "No MD order"}
        </Badge>
      </div>
    </div>
  );
}

function DayCell({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <td ref={setNodeRef} className={cn("min-w-40 space-y-1.5 border-t border-border p-1.5 align-top", isOver && "bg-primary/5")}>
      {children}
    </td>
  );
}

export function ScheduleBoard({ visits, staff, weekStart }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const days = useMemo(() => {
    const start = new Date(`${weekStart}T00:00:00`);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  }, [weekStart]);

  async function onDragEnd(e: DragEndEvent) {
    setError(null);
    if (!e.over) return;
    const visit = visits.find((v) => v.id === e.active.id);
    if (!visit) return;
    const [staffId, dayIso] = String(e.over.id).split("|");
    const oldStart = new Date(visit.scheduled_start);
    const duration = new Date(visit.scheduled_end).getTime() - oldStart.getTime();
    const newStart = new Date(`${dayIso}T00:00:00`);
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes());

    setPending(true);
    const res = await upsertVisit({
      id: visit.id,
      client_id: visit.client_id,
      staff_id: staffId,
      visit_type: visit.visit_type,
      scheduled_start: newStart.toISOString(),
      scheduled_end: new Date(newStart.getTime() + duration).toISOString(),
      active_physician_order_id: visit.active_physician_order_id ?? ""
    });
    setPending(false);
    if (!res.ok) setError(res.error ?? "Assignment rejected.");
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <div className={cn("overflow-x-auto rounded-lg border border-border", pending && "opacity-60")}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-40 px-3 py-2 text-left font-medium text-muted-foreground">Staff</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="border-t border-border px-3 py-2 font-medium">{s.full_name}</td>
                {days.map((d) => {
                  const dayIso = d.toISOString().slice(0, 10);
                  const cellVisits = visits.filter(
                    (v) => v.staff_id === s.id && v.scheduled_start.slice(0, 10) === dayIso
                  );
                  return (
                    <DayCell key={dayIso} id={`${s.id}|${dayIso}`}>
                      {cellVisits.map((v) => <VisitCard key={v.id} visit={v} />)}
                    </DayCell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DndContext>
  );
}
