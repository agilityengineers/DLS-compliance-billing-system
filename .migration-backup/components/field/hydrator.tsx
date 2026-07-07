// components/field/hydrator.tsx — pulls /api/field/bootstrap into Dexie so
// the field app reads offline. Never clobbers local rows that haven't
// synced yet (synced === 0 wins over the server copy until the queue drains).
"use client";

import { useEffect } from "react";
import { db } from "@/lib/offline/db";
import { SyncEngine } from "@/lib/offline/syncEngine";

async function hydrate() {
  const res = await fetch("/api/field/bootstrap");
  if (!res.ok) return;
  const data = await res.json();

  await db.transaction(
    "rw",
    [db.visits, db.clients, db.evv_logs, db.progress_notes, db.medication_logs, db.nmt_trips],
    async () => {
      for (const v of data.visits ?? []) await db.visits.put(v);
      for (const c of data.clients ?? []) await db.clients.put(c);
      for (const t of data.nmtTrips ?? []) await db.nmt_trips.put(t);
      for (const log of data.evvLogs ?? []) {
        const local = await db.evv_logs.get(log.id);
        if (local && local.synced === 0) continue; // local unsynced wins
        await db.evv_logs.put({ ...log, synced: 1 });
      }
      for (const n of data.notes ?? []) {
        const local = await db.progress_notes.get(n.id);
        if (local && local.synced === 0) continue;
        await db.progress_notes.put({ ...n, synced: 1 });
      }
      for (const m of data.meds ?? []) {
        const local = await db.medication_logs.get(m.id);
        if (local && local.synced === 0) continue;
        await db.medication_logs.put({ ...m, synced: 1 });
      }
    }
  );

  if (data.prefs?.field_home) {
    try {
      localStorage.setItem("dls_field_home", data.prefs.field_home);
    } catch {
      /* private mode */
    }
  }
}

export function Hydrator() {
  useEffect(() => {
    SyncEngine.start();
    if (navigator.onLine) void hydrate().catch((e) => console.error("[hydrate]", e));
    const onOnline = () => void hydrate().catch(() => undefined);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return null;
}
