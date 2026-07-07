// app/api/sync/route.ts — optional server-side sync endpoint.
// The SyncEngine talks to Supabase directly (RLS-enforced); this route exists
// for payloads that need server-side validation before write (e.g. future
// telephony EVV webhooks). Kept minimal.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.table || !body?.payload) {
    return NextResponse.json({ error: "Expected { table, payload }" }, { status: 400 });
  }
  const allowed = ["progress_notes", "evv_logs", "medication_logs", "job_coaching_logs"];
  if (!allowed.includes(body.table)) {
    return NextResponse.json({ error: "Table not allowed" }, { status: 400 });
  }

  // RLS enforces row-level permissions; upsert is idempotent on uuid PK.
  const { error } = await supabase.from(body.table).upsert(body.payload, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
