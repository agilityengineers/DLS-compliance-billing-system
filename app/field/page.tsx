// app/field/page.tsx — today's visits for the signed-in staff member
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT = {
  Scheduled: "muted", In_Progress: "warning", Completed: "success", Cancelled: "destructive", Billed: "default"
} as const;

export default async function FieldHome() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const today = new Date().toISOString().slice(0, 10);

  const { data: visits } = await supabase
    .from("visits")
    .select("*, clients(first_name,last_name)")
    .eq("staff_id", user!.id)
    .gte("scheduled_start", `${today}T00:00:00Z`)
    .lte("scheduled_start", `${today}T23:59:59Z`)
    .neq("status", "Cancelled")
    .order("scheduled_start");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Today&rsquo;s visits</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {(visits ?? []).map((v) => {
          const c = v.clients as unknown as { first_name: string; last_name: string } | null;
          const start = new Date(v.scheduled_start);
          const end = new Date(v.scheduled_end);
          return (
            <Link
              key={v.id}
              href={`/field/visits/${v.id}`}
              className="flex min-h-touch items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 active:bg-muted"
            >
              <div>
                <div className="text-base font-medium">{c ? `${c.first_name} ${c.last_name}` : "Client"}</div>
                <div className="text-sm text-muted-foreground">
                  {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {" – "}
                  {end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {" · "}{v.visit_type.replace("_", " ")}
                </div>
              </div>
              <Badge variant={STATUS_VARIANT[v.status as keyof typeof STATUS_VARIANT]}>
                {v.status.replace("_", " ")}
              </Badge>
            </Link>
          );
        })}
        {(visits ?? []).length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No visits scheduled today.
          </p>
        )}
      </div>

      <Link
        href="/field/emar"
        className="flex min-h-touch items-center justify-center rounded-lg border border-border bg-card p-4 font-medium active:bg-muted"
      >
        eMAR — medication list
      </Link>
    </div>
  );
}
