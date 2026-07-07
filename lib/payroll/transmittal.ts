// lib/payroll/transmittal.ts — the payroll transmittal engine.
// Mirrors the client's paper form: per-employee "all notes in?", Wk1/Wk2
// hours + OT (over 40/week), totals. Hours flow from EVV-verified route
// records (timesheets); submission is blocked while any notes are
// outstanding.
import "server-only";

import { listFieldStaff } from "@/lib/data/repo-core";
import { listTimesheetEntries, listTimesheets } from "@/lib/data/repo-field";
import type { PayrollLine, PayrollPeriod } from "@/lib/supabase/types";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function computePayrollLines(period: PayrollPeriod): Promise<PayrollLine[]> {
  const wk1Start = period.period_start;
  const wk1End = addDays(wk1Start, 6);
  const wk2Start = addDays(wk1Start, 7);
  const wk2End = period.period_end;

  const [staff, sheets] = await Promise.all([
    listFieldStaff(),
    listTimesheets({ periodStartFrom: wk1Start, periodStartTo: wk2Start })
  ]);

  const lines: PayrollLine[] = [];
  for (const s of staff) {
    const mySheets = sheets.filter((t) => t.staff_id === s.id);
    let wk1 = 0;
    let wk2 = 0;
    for (const sheet of mySheets) {
      const entries = await listTimesheetEntries(sheet.id);
      for (const e of entries) {
        const h = Number(e.hours);
        if (e.work_date >= wk1Start && e.work_date <= wk1End) wk1 += h;
        else if (e.work_date >= wk2Start && e.work_date <= wk2End) wk2 += h;
      }
    }
    // "All notes in?" = every route record with hours in the period is
    // submitted, and one exists for each week that has hours.
    const sheetsWithHours = mySheets.length > 0;
    const allSubmitted = mySheets.every((t) => t.status === "submitted");
    const allNotesIn = (wk1 + wk2 === 0) || (sheetsWithHours && allSubmitted);

    const wk1Ot = round2(Math.max(0, wk1 - 40));
    const wk2Ot = round2(Math.max(0, wk2 - 40));
    lines.push({
      staff_id: s.id,
      employee_name: `${s.full_name.split(" ").slice(-1)[0]}, ${s.full_name.split(" ").slice(0, -1).join(" ")}`,
      all_notes_in: allNotesIn,
      wk1_hours: round2(Math.min(40, wk1)),
      wk1_ot: wk1Ot,
      wk2_hours: round2(Math.min(40, wk2)),
      wk2_ot: wk2Ot,
      total_regular: round2(Math.min(40, wk1) + Math.min(40, wk2)),
      total_ot: round2(wk1Ot + wk2Ot)
    });
  }
  return lines.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}
