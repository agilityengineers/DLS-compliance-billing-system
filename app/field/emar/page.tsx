// app/field/emar/page.tsx — medication administration for the current shift
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { writeLocal } from "@/lib/offline/db";
import type { MedicationLog, MedStatus } from "@/lib/supabase/types";

export default function EmarPage() {
  const [meds, setMeds] = useState<MedicationLog[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      // Current shift = scheduled in the last 12 hours through the next 4.
      const from = new Date(Date.now() - 12 * 3600_000).toISOString();
      const to = new Date(Date.now() + 4 * 3600_000).toISOString();
      const { data } = await supabase
        .from("medication_logs")
        .select("*")
        .gte("scheduled_time", from)
        .lte("scheduled_time", to)
        .order("scheduled_time");
      setMeds((data as MedicationLog[]) ?? []);
      setLoading(false);
    })();
  }, []);

  async function mark(med: MedicationLog, status: MedStatus) {
    const updated: MedicationLog = {
      ...med,
      status,
      administered_time: status === "Administered" ? new Date().toISOString() : med.administered_time,
      administered_by: userId
    };
    // Offline-first: local write + sync queue
    await writeLocal("medication_logs", "update", updated as unknown as Record<string, unknown> & { id: string });
    setMeds((list) => list.map((m) => (m.id === med.id ? updated : m)));
  }

  const VARIANT: Record<MedStatus, "success" | "warning" | "destructive"> = {
    Administered: "success", Refused: "warning", Missed: "destructive"
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">eMAR — current shift</h1>
      {loading && <p className="text-sm text-muted-foreground">Loading medication list…</p>}
      <div className="flex flex-col gap-3">
        {meds.map((m) => (
          <div key={m.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{m.medication_name} · {m.dosage}</div>
                <div className="text-sm text-muted-foreground">
                  {m.route} · due {new Date(m.scheduled_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <Badge variant={VARIANT[m.status]}>{m.status}</Badge>
            </div>
            {m.status === "Missed" && (
              <div className="grid grid-cols-3 gap-2">
                <Button size="touch" onClick={() => mark(m, "Administered")}>Administered</Button>
                <Button size="touch" variant="outline" onClick={() => mark(m, "Refused")}>Refused</Button>
                <Button size="touch" variant="ghost" disabled>Missed</Button>
              </div>
            )}
          </div>
        ))}
        {!loading && meds.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No medications scheduled this shift.
          </p>
        )}
      </div>
    </div>
  );
}
