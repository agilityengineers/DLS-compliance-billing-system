// app/field/visits/[id]/page.tsx — visit detail (offline-first).
// Clock In/Out via GPS · client info · NMT trips with the per-client weekly
// guardrail · photo/document upload → S3 (Uploading → Synced) · note link.
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/offline/db";
import { ClockPanel } from "@/components/field/clock-panel";
import { NmtPanel } from "@/components/field/nmt-panel";
import { UploadPanel } from "@/components/field/upload-panel";
import { CancelVisitPanel } from "@/components/field/cancel-visit-panel";

export default function VisitDetail() {
  const params = useParams<{ id: string }>();
  const visitId = params.id;
  const [showInfo, setShowInfo] = useState(false);

  const data = useLiveQuery(async () => {
    const visit = await db.visits.get(visitId);
    const client = visit ? await db.clients.get(visit.client_id) : undefined;
    return { visit, client };
  }, [visitId]);

  if (!data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  const { visit, client } = data;
  if (!visit) {
    return (
      <p className="rounded-card-m border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Visit not found on this device yet — connect once to sync your schedule.
      </p>
    );
  }

  const residence = client?.residence_gps ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-card-m border border-border bg-card p-4">
        <div>
          <h1 className="font-serif text-xl font-semibold text-plum">
            {client ? `${client.first_name} ${client.last_name}` : "Client"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(visit.scheduled_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {" – "}
            {new Date(visit.scheduled_end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {" · "}
            {visit.visit_type.replace(/_/g, " ")}
          </p>
        </div>
        <button
          onClick={() => setShowInfo((s) => !s)}
          className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-medium active:bg-muted"
        >
          Client info
        </button>
      </div>

      {showInfo && client && (
        <div className="space-y-2 rounded-card-m border border-border bg-card p-4 text-sm">
          <InfoRow label="Medicaid ID" value={client.medicaid_id} />
          <InfoRow label="Diagnoses" value={client.active_diagnoses.map((d) => d.description).join("; ") || "—"} />
          <InfoRow label="Case manager" value={client.case_manager_name ?? "—"} />
          <InfoRow label="CCB" value={client.ccb_name ?? "—"} />
          <InfoRow
            label="Authorization"
            value={`SCC ${client.authorized_scc_hours_per_week} hrs/wk · NMT ${client.authorized_nmt_trips_per_week} trips/wk`}
          />
          <InfoRow
            label="Plan window"
            value={`${client.service_plan_start ?? "—"} → ${client.service_plan_end ?? "—"}`}
          />
        </div>
      )}

      <ClockPanel visitId={visit.id} residence={residence} visitType={visit.visit_type} />

      {client && client.authorized_nmt_trips_per_week > 0 && (
        <NmtPanel visit={visit} client={client} />
      )}

      <UploadPanel visitId={visit.id} clientId={visit.client_id} />

      {visit.status !== "Cancelled" && <CancelVisitPanel visit={visit} />}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
