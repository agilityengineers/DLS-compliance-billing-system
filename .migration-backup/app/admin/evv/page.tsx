// app/admin/evv/page.tsx — EVV review: log table + ADMIN-ONLY manual
// adjustment that REQUIRES a documented reason (DB CHECK + RLS enforced).
import { redirect } from "next/navigation";
import { requireRole, getSessionContext } from "@/lib/auth/session";
import { listEvvLogs } from "@/lib/data/repo-field";
import { listVisits } from "@/lib/data/repo-core";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { ManualAdjustmentForm } from "@/components/admin/manual-adjustment-form";
import { agencyAddDays, agencyTodayIso, formatAgencyDate, formatAgencyDateTime, formatAgencyTime } from "@/lib/time/agency";

export default async function EvvReviewPage() {
  try {
    await requireRole("Admin", "Scheduler");
  } catch {
    redirect("/admin");
  }
  const ctx = await getSessionContext();
  const isAdmin = ctx.effectiveUser?.role === "Admin";

  const [logs, recentVisits] = await Promise.all([
    listEvvLogs({}),
    listVisits({
      from: agencyAddDays(agencyTodayIso(), -14),
      to: agencyTodayIso(),
      excludeCancelled: true
    })
  ]);

  const fmtT = (t: string | null) =>
    t ? formatAgencyDateTime(t) : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">EVV review</h1>
        <p className="text-sm text-muted-foreground">
          GPS-verified clock events (150 m geofence, server-enforced). Manual adjustments are
          Admin-only and require a documented reason.
        </p>
      </div>

      <Table>
        <THead>
          <tr><th>Client</th><th>Staff</th><th>Type</th><th>Clock in</th><th>Clock out</th><th>Method</th><th>Distance</th><th>Reason</th></tr>
        </THead>
        <TBody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="font-medium">{l.client_name}</td>
              <td>{l.staff_name}</td>
              <td>{l.visit_type.replace(/_/g, " ")}</td>
              <td className="tabular-nums">{fmtT(l.clock_in_time)}</td>
              <td className="tabular-nums">{fmtT(l.clock_out_time)}</td>
              <td>
                <Badge variant={l.verification_method === "GPS" ? "success" : l.verification_method === "Manual" ? "warning" : "muted"}>
                  {l.verification_method}
                </Badge>
              </td>
              <td className="tabular-nums text-muted-foreground">
                {l.clock_in_distance_m != null ? `${l.clock_in_distance_m} m` : "—"}
              </td>
              <td className="max-w-xs truncate text-muted-foreground" title={l.manual_adjustment_reason ?? undefined}>
                {l.manual_adjustment_reason ?? "—"}
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No EVV logs in this window.</td></tr>
          )}
        </TBody>
      </Table>

      {isAdmin ? (
        <ManualAdjustmentForm
          visits={recentVisits.map((v) => ({
            id: v.id,
            label: `${v.client_name} · ${formatAgencyDate(v.scheduled_start)} ${formatAgencyTime(v.scheduled_start)} (${v.staff_name})`
          }))}
        />
      ) : (
        <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
          Manual EVV adjustment is an Admin-only capability.
        </p>
      )}
    </div>
  );
}
