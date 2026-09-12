// app/admin/schedule/page.tsx — staff × weekday grid.
// Visits without an active physician order are flagged red and cannot be
// saved (DB-enforced). Recurring templates generate this week's instances.
import { checkAccess } from "@/lib/rbac/access";
import { listClients, listFieldStaff, listPhysicianOrders, listVisits } from "@/lib/data/repo-core";
import { ScheduleBoard } from "@/components/admin/schedule-board";
import { GenerateRecurringButton } from "@/components/admin/generate-recurring-button";
import { DesktopWorkspace } from "@/components/admin/desktop-workspace";
import { agencyAddDays, agencyMondayOf, agencyTodayIso, formatAgencyCalendarDate } from "@workspace/time";

export default async function SchedulePage({ searchParams }: { searchParams: { week?: string } }) {
  const { ctx, denied } = await checkAccess({ feature: "schedule.board" });
  if (denied) return denied;

  const weekMonday = agencyMondayOf(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.week ?? "") ? searchParams.week! : agencyTodayIso());
  const weekEnd = agencyAddDays(weekMonday, 6);

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
            Week of {formatAgencyCalendarDate(weekMonday)}.
            Select a visit, then reassign. Visits without a physician order are flagged and{" "}
            <strong className="text-foreground">cannot be saved</strong>.
          </p>
        </div>
        {ctx.features.has("schedule.recurring") && <GenerateRecurringButton weekMonday={weekMonday} />}
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
