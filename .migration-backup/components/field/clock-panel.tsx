// components/field/clock-panel.tsx — Clock In / Clock Out wired to lib/evv
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/offline/db";
import { clockIn, clockOut, requestTelephonyFallback } from "@/lib/evv/clock";

export function ClockPanel({
  visitId, residence, visitType
}: {
  visitId: string;
  residence: { lat: number; lng: number } | null;
  visitType: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsFailed, setGpsFailed] = useState(false);

  const log = useLiveQuery(() => db.evv_logs.where("visit_id").equals(visitId).first(), [visitId]);
  const clockedIn = Boolean(log?.clock_in_time && !log?.clock_out_time);
  const done = Boolean(log?.clock_out_time);

  useEffect(() => setMessage(null), [visitId]);

  async function handle(action: "in" | "out") {
    setBusy(true); setMessage(null); setGpsFailed(false);
    const res = action === "in" ? await clockIn(visitId, residence) : await clockOut(visitId, residence);
    setBusy(false);
    if (res.ok) {
      setMessage(action === "in"
        ? `Clocked in · GPS verified (${Math.round(res.geofence.distanceMeters)}m from residence)`
        : "Clocked out. Complete your progress note below.");
      return;
    }
    if (res.reason === "GPS_FAILED") {
      setGpsFailed(true);
      setMessage("GPS unavailable. Use the telephony fallback, or ask an admin for a manual adjustment (reason required).");
    } else if (res.reason === "OUTSIDE_GEOFENCE") {
      setMessage(`Outside geofence — ${Math.round(res.distanceMeters ?? 0)}m from the client's residence. Move closer and retry.`);
    } else {
      setMessage("Clock state conflict — refresh and retry.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        {!clockedIn && !done && (
          <Button size="touch" className="h-16 text-lg" disabled={busy} onClick={() => handle("in")}>
            <MapPin className="h-5 w-5" /> {busy ? "Getting GPS…" : "Clock In"}
          </Button>
        )}
        {clockedIn && (
          <Button size="touch" variant="destructive" className="h-16 text-lg" disabled={busy} onClick={() => handle("out")}>
            {busy ? "Getting GPS…" : "Clock Out"}
          </Button>
        )}
        {done && (
          <p className="rounded-lg bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-900">
            Visit clocked: {new Date(log!.clock_in_time!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {" → "}
            {new Date(log!.clock_out_time!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>

      {message && <p className="rounded-md bg-muted p-3 text-sm" role="status">{message}</p>}

      {gpsFailed && (
        <Button
          variant="outline" size="touch" className="w-full"
          onClick={async () => {
            const { instructions } = await requestTelephonyFallback(visitId);
            setMessage(instructions);
          }}
        >
          <Phone className="h-4 w-4" /> Telephony fallback
        </Button>
      )}

      {(clockedIn || done) && (
        <div className="grid grid-cols-1 gap-3 pt-2">
          <Link
            href={`/field/visits/${visitId}/note`}
            className="flex min-h-touch items-center justify-center rounded-lg bg-primary p-4 font-medium text-primary-foreground active:opacity-90"
          >
            {visitType === "Job_Coaching" ? "Progress note + job coaching log" : "Progress note"}
          </Link>
        </div>
      )}
    </div>
  );
}
