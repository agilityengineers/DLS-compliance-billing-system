// app/api/field/bootstrap/route.ts — hydration payload for offline-first
// field reads. The Hydrator fetches this while online and mirrors it into
// Dexie (encrypted at rest); Today/Week/visit detail then render from Dexie
// and keep working with no signal.
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { listVisits, getClient } from "@/lib/data/repo-core";
import { agencyAddDays, agencyTodayIso } from "@/lib/time/agency";
import {
  getEvvLogForVisit, getUserPrefs, listMedications, listNmtTripsForClientWeek, listNotes
} from "@/lib/data/repo-field";

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const staffId = ctx.effectiveUser.id;
  const today = agencyTodayIso();
  const from = agencyAddDays(today, -7);
  const to = agencyAddDays(today, 14);

  const visits = await listVisits({ staffId, from, to });
  const clientIds = Array.from(new Set(visits.map((v) => v.client_id)));
  const clients = (await Promise.all(clientIds.map((id) => getClient(id)))).filter(Boolean);

  const evvLogs = (
    await Promise.all(visits.map((v) => getEvvLogForVisit(v.id)))
  ).filter(Boolean);

  const notes = await listNotes({ staffId, from, to });
  const meds = await listMedications({ from: agencyAddDays(today, -1), to: today, clientIds });
  const nmtTrips = (
    await Promise.all(clientIds.map((id) => listNmtTripsForClientWeek(id, today)))
  ).flat();
  const prefs = await getUserPrefs(staffId);

  return NextResponse.json(
    { visits, clients, evvLogs, notes, meds, nmtTrips, prefs, generated_at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } } // PHI: never cached
  );
}
