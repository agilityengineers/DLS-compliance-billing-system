// components/field/nmt-panel.tsx — NMT trip logging with the per-CLIENT
// weekly authorization guardrail (Business Rule #5). The count comes from
// the client's own authorization, never a hardcoded number; the server/DB
// enforces the same cap on sync (NMT_AUTHORIZATION_EXHAUSTED).
"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newLocalId, writeLocal } from "@/lib/offline/db";
import { SyncEngine } from "@/lib/offline/syncEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Client, Visit } from "@/lib/supabase/types";

function sundayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NmtPanel({ visit, client }: { visit: Visit; client: Client }) {
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const weekStart = sundayOf(todayIso);
  const weekEnd = addDays(weekStart, 6);

  const used = useLiveQuery(async () => {
    const trips = await db.nmt_trips.where("client_id").equals(client.id).toArray();
    return trips.filter((t) => t.trip_date >= weekStart && t.trip_date <= weekEnd).length;
  }, [client.id, weekStart, weekEnd]);

  const authorized = client.authorized_nmt_trips_per_week;
  const exhausted = (used ?? 0) >= authorized;

  async function logTrip() {
    setMessage(null);
    if (!destination.trim()) {
      setMessage("Destination is required.");
      return;
    }
    if (exhausted) return;
    setBusy(true);
    const trip = {
      id: newLocalId(),
      visit_id: visit.id,
      client_id: client.id,
      staff_id: visit.staff_id,
      trip_date: todayIso,
      destination: destination.trim(),
      purpose: purpose.trim() || null,
      miles: null
    };
    // Optimistic local mirror (guardrail count updates offline) + queue.
    await db.nmt_trips.put(trip);
    await writeLocal("nmt_trips", "insert", trip as unknown as Record<string, unknown> & { id: string });
    void SyncEngine.drain();
    setDestination("");
    setPurpose("");
    setBusy(false);
    setMessage("Trip logged — counts against this week's authorization.");
  }

  return (
    <section className="space-y-3 rounded-card-m border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="label-caps text-muted-foreground">NMT trips</h2>
        <span
          className={
            "rounded-pill px-2.5 py-0.5 text-xs font-medium " +
            (exhausted ? "bg-pill-danger text-pill-danger-fg" : "bg-pill-success text-pill-success-fg")
          }
        >
          {used ?? 0} of {authorized} used this week
        </span>
      </div>

      {exhausted ? (
        <p className="rounded-btn bg-pill-danger p-3 text-sm text-pill-danger-fg">
          Weekly NMT authorization exhausted for {client.first_name} — additional trips are blocked
          (server-enforced).
        </p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nmt-dest">Destination (e.g. Goodwill, Michaels)</Label>
            <Input id="nmt-dest" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nmt-purpose">Purpose</Label>
            <Input id="nmt-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <Button size="touch" className="w-full" disabled={busy} onClick={() => void logTrip()}>
            {busy ? "Logging…" : "Log trip"}
          </Button>
        </div>
      )}
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </section>
  );
}
