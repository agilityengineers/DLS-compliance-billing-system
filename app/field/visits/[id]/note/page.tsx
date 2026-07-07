// app/field/visits/[id]/note/page.tsx — server shell for the progress note
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NoteForm } from "@/components/field/note-form";

export default async function NotePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: visit } = await supabase
    .from("visits")
    .select("id, visit_type, client_id, clients(first_name,last_name)")
    .eq("id", params.id)
    .single();
  if (!visit) notFound();

  const client = visit.clients as unknown as { first_name: string; last_name: string };

  return (
    <NoteForm
      visitId={visit.id}
      clientId={visit.client_id}
      staffId={user!.id}
      visitType={visit.visit_type}
      clientName={`${client.first_name} ${client.last_name}`}
    />
  );
}
