// app/admin/payroll/page.tsx — payroll transmittal (ADMIN-ONLY).
// Mirrors the client's real form: per-employee "all notes in?", Wk1/Wk2
// hours + OT, totals, certification checkbox. Submission is blocked while
// notes are outstanding.
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getCurrentPayrollPeriod } from "@/lib/data/repo-business";
import { computePayrollLines } from "@/lib/payroll/transmittal";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { DesktopWorkspace } from "@/components/admin/desktop-workspace";
import { PayrollCertify } from "@/components/admin/payroll-certify";

function fmt(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default async function PayrollPage() {
  try {
    await requireRole("Admin");
  } catch {
    redirect("/admin");
  }

  const period = await getCurrentPayrollPeriod();
  if (!period) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">Payroll transmittal</h1>
        <p className="text-sm text-muted-foreground">No payroll period configured yet.</p>
      </div>
    );
  }

  const lines = period.snapshot ?? (await computePayrollLines(period));
  const submitted = period.status === "submitted";
  const outstanding = lines.filter((l) => !l.all_notes_in).length;
  const totals = lines.reduce(
    (t, l) => ({ reg: t.reg + l.total_regular, ot: t.ot + l.total_ot }),
    { reg: 0, ot: 0 }
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Payroll transmittal</h1>
        <p className="text-sm text-muted-foreground">
          Pay period {fmt(period.period_start)} – {fmt(period.period_end)} · Paydate {fmt(period.paydate)}. Hours
          flow from EVV-verified timesheets.
        </p>
      </div>

      <DesktopWorkspace title="Payroll">
        <Table>
          <THead>
            <tr>
              <th>Employee</th><th>All notes in?</th>
              <th className="text-right">Wk1 hrs</th><th className="text-right">Wk1 OT</th>
              <th className="text-right">Wk2 hrs</th><th className="text-right">Wk2 OT</th>
              <th className="text-right">Total reg</th><th className="text-right">Total OT</th>
            </tr>
          </THead>
          <TBody>
            {lines.map((l) => (
              <tr key={l.staff_id}>
                <td className="font-medium">{l.employee_name}</td>
                <td>
                  <Badge variant={l.all_notes_in ? "success" : "destructive"}>{l.all_notes_in ? "Yes" : "No"}</Badge>
                </td>
                <td className="text-right tabular-nums">{l.wk1_hours}</td>
                <td className="text-right tabular-nums text-muted-foreground">{l.wk1_ot}</td>
                <td className="text-right tabular-nums">{l.wk2_hours}</td>
                <td className="text-right tabular-nums text-muted-foreground">{l.wk2_ot}</td>
                <td className="text-right font-medium tabular-nums">{l.total_regular.toFixed(2).replace(/\.00$/, "")}</td>
                <td className="text-right font-medium tabular-nums">{l.total_ot}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-medium">
              <td colSpan={6}>Agency totals</td>
              <td className="text-right tabular-nums">{totals.reg.toFixed(2)}</td>
              <td className="text-right tabular-nums">{totals.ot.toFixed(2)}</td>
            </tr>
          </TBody>
        </Table>

        <div className="mt-5">
          {submitted ? (
            <p className="rounded-btn bg-pill-success px-4 py-3 text-sm text-pill-success-fg">
              Transmittal submitted{period.certified_at ? ` ${new Date(period.certified_at).toLocaleString()}` : ""} —
              lines are frozen in the certified snapshot.
            </p>
          ) : (
            <PayrollCertify periodId={period.id} outstanding={outstanding} />
          )}
        </div>
      </DesktopWorkspace>
    </div>
  );
}
