// app/admin/schedule/page.tsx — staff × weekday grid.
// Visits without an active physician order are flagged red and cannot be
// saved (DB-enforced). Recurring templates generate this week's instances.
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listClients, listFieldStaff, listPhysicianOrders, listVisits } from "@/lib/data/repo-core";
import { ScheduleBoard } from "@/components/admin/schedule-board";
import { GenerateRecurringButton } from "@/components/admin/generate-recurring-button";
import { DesktopWorkspace } from "@/components/admin/desktop-workspace";

function mondayOf(dateIso?: string): string {
  const d = dateIso ? new Date(`${dateIso}T12:00:00`) : new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function SchedulePage({ searchParams }: { searchParams: { week?: string } }) {
  try {
    await requireRole("Admin", "Scheduler");
  } catch {
    redirect("/admin");
  }

  const weekMonday = mondayOf(searchParams.week);
  const weekEnd = (() => {
    const d = new Date(`${weekMonday}T12:00:00`);
    d.setDate(d.getDate() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const [visits, staff, clients, orders] = await Promise.all([
    listVisits({ from: weekMonday, to: weekEnd, excludeCancelled: true }),
    listFieldStaff(),
    listClients(),
    listPhysicianOrders()
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="text-sm text-muted-foreground">
            Week of {new Date(`${weekMonday}T12:00:00`).toLocaleDateString([], { month: "long", day: "numeric" })}.
            Select a visit, then reassign. Visits without a physician order are flagged and{" "}
            <strong className="text-foreground">cannot be saved</strong>.
          </p>
        </div>
        <GenerateRecurringButton weekMonday={weekMonday} />
      </div>

      <DesktopWorkspace title="Schedule">
        <ScheduleBoard
          visits={visits}
          staff={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
          clients={clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }))}
          orders={orders}
          weekMonday={weekMonday}
        />
      </DesktopWorkspace>
    </div>
  );
}
