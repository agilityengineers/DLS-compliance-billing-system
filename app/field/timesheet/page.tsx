// app/field/timesheet/page.tsx — weekly route record (codes SCC/JC/DH/T).
// Rows append automatically from EVV clock-outs and NMT trips (server-side
// in /api/sync); submitting flips the payroll "all notes in?" input.
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getOrCreateTimesheet, listTimesheetEntries } from "@/lib/data/repo-field";
import { getClient } from "@/lib/data/repo-core";
import { SubmitTimesheetButton } from "@/components/field/submit-timesheet-button";
import { Badge } from "@/components/ui/badge";

function mondayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function TimesheetPage() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");

  const monday = mondayIso();
  const timesheet = await getOrCreateTimesheet(ctx.effectiveUser!.id, monday, ctx.auditCtx);
  const entries = await listTimesheetEntries(timesheet.id);
  const clientNames = new Map<string, string>();
  for (const e of entries) {
    if (e.client_id && !clientNames.has(e.client_id)) {
      const c = await getClient(e.client_id);
      if (c) clientNames.set(e.client_id, `${c.first_name} ${c.last_name}`);
    }
  }
  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const submitted = timesheet.status === "submitted";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">My timesheet</h1>
          <p className="text-sm text-muted-foreground">
            Route record · week of {new Date(`${timesheet.period_start}T12:00:00`).toLocaleDateString([], { month: "long", day: "numeric" })}
          </p>
        </div>
        {submitted ? <Badge variant="success">Submitted</Badge> : <Badge variant="muted">Open</Badge>}
      </div>

      <div className="overflow-hidden rounded-card-m border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="label-caps px-3 py-2.5 text-muted-foreground">Date</th>
              <th className="label-caps px-3 py-2.5 text-muted-foreground">Code</th>
              <th className="label-caps px-3 py-2.5 text-muted-foreground">Client</th>
              <th className="label-caps px-3 py-2.5 text-right text-muted-foreground">Hrs</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5">
                  {new Date(`${e.work_date}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" })}
                  {e.start_time && e.end_time && (
                    <span className="block text-xs text-muted-foreground">
                      {e.start_time}–{e.end_time}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-pill bg-plum-soft px-2 py-0.5 text-xs font-semibold text-plum">{e.service_code}</span>
                </td>
                <td className="px-3 py-2.5">{e.client_id ? clientNames.get(e.client_id) ?? "—" : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{Number(e.hours).toFixed(2)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Rows appear here automatically from clock-outs and NMT trips.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30 font-medium">
              <td className="px-3 py-2.5" colSpan={3}>Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{totalHours.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!submitted && <SubmitTimesheetButton timesheetId={timesheet.id} />}
      {submitted && (
        <p className="text-center text-xs text-muted-foreground">
          Submitted {timesheet.submitted_at ? new Date(timesheet.submitted_at).toLocaleString() : ""} — payroll
          shows your notes as in.
        </p>
      )}
    </div>
  );
}
