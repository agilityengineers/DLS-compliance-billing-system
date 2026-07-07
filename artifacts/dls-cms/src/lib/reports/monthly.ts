// lib/reports/monthly.ts — automated monthly report composition.
// Replaces the client's manual end-of-month compilation (README Additional
// Requirement #1): the State SLS Billing note (SCC+NMT) and the DVR Monthly
// Progress Report are composed from daily entries and exported as
// print-optimized HTML / Word-compatible .doc.
// Exact state-format fidelity is gated on the client's current templates
// (PRODUCTION-READINESS.md §4.9) — the data content is complete.
import "server-only";

import { getClient } from "@/lib/data/repo-core";
import { listVisits } from "@/lib/data/repo-core";
import { getJobCoachingLog, listNmtTripsForClientWeek, listNotes } from "@/lib/data/repo-field";
import type { NmtTrip } from "@/lib/supabase/types";

export type MonthlyReportKind = "sls" | "dvr";

function monthRange(month: string): { from: string; to: string; label: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const label = new Date(y, m - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" });
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, label };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString([], { month: "2-digit", day: "2-digit", year: "numeric" });
}

const DOC_STYLE = `
  body { font-family: Georgia, 'Source Serif 4', serif; color: #222; margin: 40px; }
  h1 { font-size: 18pt; margin-bottom: 2pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
  .meta { font-size: 10pt; color: #444; margin-bottom: 14pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 5pt 7pt; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 9pt; text-transform: uppercase; letter-spacing: .05em; }
  .totals { font-weight: bold; }
  .sig { margin-top: 40pt; display: flex; gap: 60px; }
  .sig div { flex: 1; border-top: 1px solid #333; padding-top: 4pt; font-size: 9pt; }
  .synthetic { margin-top: 24pt; font-size: 8pt; color: #888; }
`;

async function nmtTripsForMonth(clientId: string, from: string, to: string): Promise<NmtTrip[]> {
  // Collect via week windows spanning the month.
  const trips = new Map<string, NmtTrip>();
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const t of await listNmtTripsForClientWeek(clientId, iso)) {
      if (t.trip_date >= from && t.trip_date <= to) trips.set(t.id, t);
    }
  }
  return [...trips.values()].sort((a, b) => a.trip_date.localeCompare(b.trip_date));
}

/** State SLS Billing note: dated narratives, billable hours/units, NMT trip
 *  count, cancellations. */
export async function composeSlsBillingNote(clientId: string, month: string): Promise<{ html: string; title: string } | null> {
  const { from, to, label } = monthRange(month);
  const client = await getClient(clientId);
  if (!client) return null;

  const [notes, visits, trips] = await Promise.all([
    listNotes({ clientId, from, to }),
    listVisits({ clientId, from, to }),
    nmtTripsForMonth(clientId, from, to)
  ]);
  const serviceNotes = notes
    .filter((n) => !n.cancellation_reason)
    .sort((a, b) => a.date.localeCompare(b.date));
  const cancellations = visits.filter((v) => v.status === "Cancelled");

  const totalHours = serviceNotes.reduce((s, n) => s + (n.calculated_billable_hours ?? 0), 0);
  const totalUnits = serviceNotes.reduce((s, n) => s + (n.calculated_billing_units ?? 0), 0);
  const title = `State SLS Billing — ${client.first_name} ${client.last_name} — ${label}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_STYLE}</style></head><body>
  <h1>State SLS Billing Note — SCC &amp; NMT</h1>
  <p class="meta">
    Client: <strong>${esc(client.first_name)} ${esc(client.last_name)}</strong> ·
    Medicaid ID: ${esc(client.medicaid_id)} · Month: <strong>${label}</strong><br>
    Provider: Durable Life Skills, Inc. · Case manager: ${esc(client.case_manager_name ?? "—")} · CCB: ${esc(client.ccb_name ?? "—")}
  </p>

  <h2>Daily service narratives</h2>
  <table>
    <tr><th style="width:70pt">Date</th><th>Narrative</th><th style="width:45pt">Hours</th><th style="width:40pt">Units</th></tr>
    ${serviceNotes.map((n) => `<tr>
      <td>${fmtDate(n.date)}</td>
      <td>${esc(n.specific_services_provided ?? "—")}</td>
      <td>${(n.calculated_billable_hours ?? 0).toFixed(2)}</td>
      <td>${n.calculated_billing_units ?? 0}</td>
    </tr>`).join("")}
    <tr class="totals"><td colspan="2">Monthly totals</td><td>${totalHours.toFixed(2)}</td><td>${totalUnits}</td></tr>
  </table>

  <h2>NMT trips (${trips.length} this month · authorization ${client.authorized_nmt_trips_per_week}/week)</h2>
  ${trips.length === 0 ? "<p>No NMT trips.</p>" : `<table>
    <tr><th style="width:70pt">Date</th><th>Destination</th><th>Purpose</th></tr>
    ${trips.map((t) => `<tr><td>${fmtDate(t.trip_date)}</td><td>${esc(t.destination)}</td><td>${esc(t.purpose ?? "—")}</td></tr>`).join("")}
  </table>`}

  <h2>Cancellations</h2>
  ${cancellations.length === 0 ? "<p>No cancelled visits.</p>" : `<table>
    <tr><th style="width:70pt">Date</th><th>Reason</th></tr>
    ${cancellations.map((v) => `<tr><td>${fmtDate(v.scheduled_start.slice(0, 10))}</td><td>${esc(v.cancellation_reason ?? "—")}</td></tr>`).join("")}
  </table>`}

  <div class="sig"><div>Provider signature / date</div><div>Program approval / date</div></div>
  <p class="synthetic">Generated by DLS-CMS from daily progress notes, EVV-verified times, and trip logs.
  ${process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? "" : "SYNTHETIC DEMO DATA — not a real service record."}</p>
  </body></html>`;

  return { html, title };
}

/** DVR Monthly Progress Report: service rows (type/hrs/date/narrative),
 *  milestone, cumulative hours. */
export async function composeDvrMonthlyReport(clientId: string, month: string): Promise<{ html: string; title: string } | null> {
  const { from, to, label } = monthRange(month);
  const client = await getClient(clientId);
  if (!client) return null;

  const notes = (await listNotes({ clientId, from, to }))
    .filter((n) => n.visit_type === "Job_Coaching" && !n.cancellation_reason)
    .sort((a, b) => a.date.localeCompare(b.date));

  const jcLogs = await Promise.all(notes.map((n) => getJobCoachingLog(n.id)));
  const latestLog = jcLogs.filter(Boolean).slice(-1)[0] ?? null;
  const monthHours = notes.reduce((s, n) => s + (n.calculated_billable_hours ?? 0), 0);
  const cumulative = latestLog?.dvr_cumulative_hours ?? monthHours;
  const title = `DVR Monthly Progress — ${client.first_name} ${client.last_name} — ${label}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_STYLE}</style></head><body>
  <h1>DVR Monthly Progress Report — Supported Employment</h1>
  <p class="meta">
    Client: <strong>${esc(client.first_name)} ${esc(client.last_name)}</strong> · Month: <strong>${label}</strong><br>
    Provider: Durable Life Skills, Inc.
    ${latestLog ? ` · DVR authorization: ${esc(latestLog.dvr_authorization_number ?? "—")} ·
    Employer: ${esc(latestLog.employer_name)} (${esc(latestLog.job_title ?? "—")})` : ""}
  </p>

  <h2>Services provided</h2>
  <table>
    <tr><th style="width:70pt">Date</th><th style="width:70pt">Service</th><th style="width:45pt">Hours</th><th>Narrative</th></tr>
    ${notes.map((n) => `<tr>
      <td>${fmtDate(n.date)}</td>
      <td>Job Coaching</td>
      <td>${(n.calculated_billable_hours ?? 0).toFixed(2)}</td>
      <td>${esc(n.specific_services_provided ?? "—")}</td>
    </tr>`).join("")}
    <tr class="totals"><td colspan="2">Month total</td><td>${monthHours.toFixed(2)}</td><td></td></tr>
  </table>

  <h2>Milestone &amp; cumulative hours</h2>
  <table>
    <tr><th>Current milestone</th><th>Cumulative supported-employment hours</th><th>Employer contacts this month</th><th>UPC rotation prompted</th></tr>
    <tr>
      <td>${latestLog?.milestone_number ?? "—"}</td>
      <td>${Number(cumulative).toFixed(1)}</td>
      <td>${jcLogs.filter(Boolean).reduce((s, l) => s + (l!.employer_contact_count ?? 0), 0)}</td>
      <td>${jcLogs.some((l) => l?.upc_rotation_prompted) ? "Yes" : "No"}</td>
    </tr>
  </table>

  <div class="sig"><div>Job coach signature / date</div><div>DVR counselor review / date</div></div>
  <p class="synthetic">Generated by DLS-CMS from daily progress notes and supported-employment logs.
  ${process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? "" : "SYNTHETIC DEMO DATA — not a real service record."}</p>
  </body></html>`;

  return { html, title };
}
