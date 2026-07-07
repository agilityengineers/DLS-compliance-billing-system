// app/field/visits/[id]/page.tsx — visit detail (server shell)
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClockPanel } from "@/components/field/clock-panel";

export default async function VisitDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: visit } = await supabase
    .from("visits")
    .select("*, clients(id,first_name,last_name,residence_gps)")
    .eq("id", params.id)
    .single();
  if (!visit) notFound();

  const client = visit.clients as unknown as {
    id: string; first_name: string; last_name: string;
    residence_gps: { lat?: number; lng?: number; x?: number; y?: number } | null;
  };
  // Postgres point comes back as {x,y} — normalize
  const residence = client.residence_gps
    ? { lat: client.residence_gps.lat ?? client.residence_gps.x ?? 0, lng: client.residence_gps.lng ?? client.residence_gps.y ?? 0 }
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{client.first_name} {client.last_name}</h1>
        <p className="text-sm text-muted-foreground">
          {visit.visit_type.replace("_", " ")} ·{" "}
          {new Date(visit.scheduled_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {" – "}
          {new Date(visit.scheduled_end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
      <ClockPanel visitId={visit.id} residence={residence} visitType={visit.visit_type} />
    </div>
  );
}
