// app/admin/schedule/page.tsx — master calendar (week view)
import { ScheduleBoard } from "@/components/admin/schedule-board";
import { createClient } from "@/lib/supabase/server";

export default async function SchedulePage({ searchParams }: { searchParams: { week?: string } }) {
  const supabase = createClient();

  // Week start (Sunday)
  const base = searchParams.week ? new Date(`${searchParams.week}T00:00:00`) : new Date();
  const weekStart = new Date(base);
  weekStart.setDate(base.getDate() - base.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [{ data: visits }, { data: staff }] = await Promise.all([
    supabase
      .from("visits")
      .select("*, clients(first_name,last_name)")
      .gte("scheduled_start", `${iso(weekStart)}T00:00:00Z`)
      .lt("scheduled_start", `${iso(weekEnd)}T00:00:00Z`)
      .neq("status", "Cancelled")
      .order("scheduled_start"),
    supabase.from("users").select("id,full_name").eq("role", "Field_Staff").eq("status", "Active").order("full_name")
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Schedule — week of {iso(weekStart)}</h1>
        <p className="text-sm text-muted-foreground">Drag a visit to reassign staff or day. Visits without a physician order are flagged and cannot be saved.</p>
      </div>
      <ScheduleBoard visits={visits ?? []} staff={staff ?? []} weekStart={iso(weekStart)} />
    </div>
  );
}
