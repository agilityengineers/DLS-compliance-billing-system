// app/field/visits/[id]/note/page.tsx — offline-capable wrapper for the
// progress note (visit + client resolved from Dexie).
"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/offline/db";
import { NoteForm } from "@/components/field/note-form";

export default function NotePage() {
  const params = useParams<{ id: string }>();
  const visitId = params.id;

  const data = useLiveQuery(async () => {
    const visit = await db.visits.get(visitId);
    const client = visit ? await db.clients.get(visit.client_id) : undefined;
    const existing = await db.progress_notes.where("visit_id").equals(visitId).first();
    return { visit, client, existing };
  }, [visitId]);

  if (!data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  const { visit, client, existing } = data;
  if (!visit) {
    return (
      <p className="rounded-card-m border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Visit not found on this device yet — connect once to sync your schedule.
      </p>
    );
  }

  if (existing) {
    // One note per visit from this device. An unsynced note is still queued
    // (its draft is kept until the server acknowledges it) — never re-submit.
    return (
      <div className="space-y-3">
        <h1 className="page-title">Progress note</h1>
        {existing.synced !== 0 ? (
          <p className="rounded-card-m bg-pill-success p-4 text-sm text-pill-success-fg">
            A note for this visit was already submitted and synced.
          </p>
        ) : (
          <p className="rounded-card-m bg-pill-warning p-4 text-sm text-pill-warning-fg" role="status">
            A note for this visit was submitted and is waiting to sync. It is kept on this device until the
            server confirms it — check the sync indicator if it needs attention.
          </p>
        )}
      </div>
    );
  }

  return (
    <NoteForm
      visitId={visit.id}
      clientId={visit.client_id}
      staffId={visit.staff_id}
      visitType={visit.visit_type}
      clientName={client ? `${client.first_name} ${client.last_name}` : "Client"}
    />
  );
}
