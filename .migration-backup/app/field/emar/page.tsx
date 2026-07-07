// app/field/emar/page.tsx — eMAR for the current shift (offline-first).
// Administered / Refused / Missed; "Administered" stamps administered_time
// (DB CHECK + demo rule enforce it); every action is audit-logged. Statuses
// stay correctable — a wrong tap can be fixed and the audit trail keeps both.
"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db, writeLocal } from "@/lib/offline/db";
import { SyncEngine } from "@/lib/offline/syncEngine";
import type { MedicationLog, MedStatus } from "@/lib/supabase/types";

const VARIANT: Record<MedStatus, "success" | "warning" | "destructive"> = {
  Administered: "success", Refused: "warning", Missed: "destructive"
};

export default function EmarPage() {
  const meds = useLiveQuery(async () => {
    const from = new Date(Date.now() - 12 * 3600_000);
    const to = new Date(Date.now() + 4 * 3600_000);
    const all = await db.medication_logs.toArray();
    const clients = await db.clients.toArray();
    return all
      .filter((m) => {
        const t = new Date(m.scheduled_time).getTime();
        return t >= from.getTime() && t <= to.getTime();
      })
      .map((m) => {
        const c = clients.find((x) => x.id === m.client_id);
        return { ...m, client_name: c ? `${c.first_name} ${c.last_name}` : "" };
      })
      .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  }, []);

  async function mark(med: MedicationLog, status: MedStatus) {
    const updated: MedicationLog = {
      ...med,
      status,
      administered_time: status === "Administered" ? new Date().toISOString() : null,
      administered_by: med.administered_by // set server-side from the session
    };
    await writeLocal("medication_logs", "update", updated as unknown as Record<string, unknown> & { id: string });
    void SyncEngine.drain();
  }

  return (
    <div className="space-y-4">
      <h1 className="page-title">eMAR — current shift</h1>
      <div className="flex flex-col gap-3">
        {(meds ?? []).map((m) => (
          <div key={m.id} className="space-y-3 rounded-card-m border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{m.medication_name} · {m.dosage}</div>
                <div className="text-sm text-muted-foreground">
                  {m.client_name && `${m.client_name} · `}
                  {m.route} · due {new Date(m.scheduled_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <Badge variant={VARIANT[m.status]}>{m.status}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button size="touch" disabled={m.status === "Administered"} onClick={() => void mark(m, "Administered")}>
                Administered
              </Button>
              <Button size="touch" variant="outline" disabled={m.status === "Refused"} onClick={() => void mark(m, "Refused")}>
                Refused
              </Button>
              <Button size="touch" variant="ghost" disabled={m.status === "Missed"} onClick={() => void mark(m, "Missed")}>
                Missed
              </Button>
            </div>
          </div>
        ))}
        {meds && meds.length === 0 && (
          <p className="rounded-card-m border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No medications scheduled this shift.
          </p>
        )}
        {!meds && <p className="p-4 text-sm text-muted-foreground">Loading medication list…</p>}
      </div>
    </div>
  );
}
