// lib/billing/readiness.ts — claim-readiness engine (Business Rule #2).
// Replaces the scaffold's guardrails.ts, fixing its audited defects:
//   · weekly-authorization cap is applied PER SERVICE TYPE (the old code
//     summed every visit type against the SCC-only cap)
//   · week windows use local dates end-to-end (no UTC/local mix)
//   · adds blockers: cancelled/unclocked visit, inactive physician order,
//     overdue REQUIRED credentials
//   · runs on the repo (demo + Supabase) instead of raw service-role queries
//
// Credentialing is NOT hardcoded here any more. Three hand-written checks
// (licence expiry, training_completed[], overdue required Relias courses) are
// now one pass over the configurable requirements registry —
// the @workspace/credentialing package. Which items exist, which are required,
// and which block a claim are admin toggles at /admin/requirements.
import "server-only";

import { listNotes, type NoteWithContext, listEvvLogs } from "@/lib/data/repo-field";
import { listClients, listPhysicianOrders, listUsers, listVisits } from "@/lib/data/repo-core";
import { getFeeSchedule, listReliasCompletions, listReliasCourses } from "@/lib/data/repo-business";
import { listRequirements, listStaffCredentials } from "@/lib/data/repo-credentialing";
import { evaluateAndSummarize } from "@workspace/credentialing";
import type { Client, FeeScheduleRow, StaffUser, VisitType, VisitWithNames } from "@/lib/supabase/types";
import { agencyAddDays, agencySundayOf, agencyTodayIso } from "@/lib/time/agency";

export interface NoteReadiness {
  note: NoteWithContext;
  ok: boolean;
  blockers: string[];
  rate: FeeScheduleRow | null;
  charge: number | null;
}

const AUTH_FIELD: Record<VisitType, keyof Client> = {
  SCC: "authorized_scc_hours_per_week",
  Job_Coaching: "authorized_jc_hours_per_week",
  Day_Habilitation: "authorized_dh_hours_per_week",
  Early_Intervention: "authorized_ei_hours_per_week"
};

// Sun–Sat authorization week (DECISIONS.md), agency calendar.
const sundayOf = agencySundayOf;
const addDaysIso = agencyAddDays;

/**
 * Evaluate claim readiness for all unbilled notes in a window.
 * One data pass — per-note evaluation shares the loaded context.
 */
export async function evaluateUnbilledNotes(opts: { from?: string; to?: string } = {}): Promise<NoteReadiness[]> {
  const today = agencyTodayIso();
  const notes = (await listNotes({ ...opts, unbilledOnly: true })).filter((n) => !n.cancellation_reason);
  if (notes.length === 0) return [];

  // Weekly-cap math needs EVERY note in each Sun–Sat week that holds an
  // unbilled note — a capped "most recent N" slice silently disabled the
  // authorization blocker once the agency passed the query cap. Load the
  // exact window with no cap (the repo pages through it).
  const dates = notes.map((n) => n.date).sort();
  const windowFrom = sundayOf(dates[0]);
  const windowTo = addDaysIso(sundayOf(dates[dates.length - 1]), 6);

  const [allNotes, users, clients, visits, orders, fees, courses, completions, requirements, credentials] = await Promise.all([
    listNotes({ from: windowFrom, to: windowTo, limit: null }),
    listUsers(),
    listClients(undefined, { limit: null }),
    // ±1 day: scheduled_start is stored in UTC and evening visits fall on the next UTC date.
    listVisits({ from: addDaysIso(windowFrom, -1), to: addDaysIso(windowTo, 1) }),
    listPhysicianOrders(),
    getFeeSchedule(),
    listReliasCourses(),
    listReliasCompletions(),
    listRequirements(),
    listStaffCredentials()
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  // Credentialing depends on the staff member, not the note, so evaluate each
  // one once rather than per note — a busy week is thousands of notes over a
  // handful of staff.
  const credentialBlockersByStaff = new Map<string, string[]>(
    users.map((u) => [
      u.id,
      evaluateAndSummarize({
        requirements, staff: u, credentials,
        courses, completions, today
      }).summary.claimBlockers.map((reason) => `${u.full_name} — ${reason}`)
    ])
  );
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const visitById = new Map(visits.map((v) => [v.id, v]));

  return notes
    .map((note) => {
      const staff = userById.get(note.staff_id);
      const client = clientById.get(note.client_id);
      const visit = visitById.get(note.visit_id);
      const blockers: string[] = [];

      // Fail CLOSED: a lookup that cannot be resolved blocks the claim. It
      // must never silently skip the credential, authorization, or order checks.
      if (!staff) blockers.push("Staff record not found for this note.");
      if (!client) blockers.push("Client record not found for this note.");
      if (!visit) blockers.push("Visit record not found for this note.");

      // 1. Credentialing — one pass over the registry. It resolves each
      //    requirement against its own evidence (licence column, training
      //    records, Relias completions, explicit credential rows) and reports
      //    only what must stop a claim: a REQUIRED + GATING item that has
      //    lapsed or failed. A credential inside its renewal window is a
      //    warning, and one never started does not block — matching the
      //    behaviour this replaced. Blocking on never-started is roadmap 2.8
      //    (`blockOnMissing`), a deliberate billing change, not a default.
      if (staff) blockers.push(...(credentialBlockersByStaff.get(staff.id) ?? []));

      // 2. Signatures
      if (!note.caregiver_signature_data) blockers.push("Missing caregiver signature.");
      if (!note.client_signature_data) blockers.push("Missing client signature.");

      // 3. Weekly authorization — PER SERVICE TYPE, local Sun–Sat week
      const visitType = (note.visit_type ?? "SCC") as VisitType;
      if (client) {
        const cap = Number(client[AUTH_FIELD[visitType]] ?? 0);
        if (cap > 0) {
          const weekStart = sundayOf(note.date);
          const weekEnd = addDaysIso(weekStart, 6);
          const weekUnits = allNotes
            .filter(
              (n) =>
                n.client_id === note.client_id &&
                (n.visit_type ?? "SCC") === visitType &&
                n.date >= weekStart && n.date <= weekEnd &&
                !n.cancellation_reason
            )
            .reduce((s, n) => s + (n.calculated_billing_units ?? 0), 0);
          const capUnits = Math.round(cap * 4);
          if (weekUnits > capUnits) {
            blockers.push(
              `Cumulative ${visitType.replace(/_/g, " ")} units this week (${weekUnits}) exceed authorization (${capUnits} units = ${cap} hrs/wk).`
            );
          }
        }
      }

      // 4. Visit state + physician order
      if (visit) {
        if (visit.status === "Cancelled") blockers.push("Visit is cancelled.");
        const order = orders.find((o) => o.id === visit.physician_order_id);
        const active = order && order.client_id === note.client_id &&
          order.effective_date <= note.date && (!order.expiration_date || order.expiration_date >= note.date);
        if (!active) blockers.push("No active physician order for the service date.");
      }

      // Fee schedule (informational; export refuses without a rate)
      const rate =
        fees.find(
          (f) => f.visit_type === visitType && f.effective_date <= note.date && (!f.end_date || f.end_date >= note.date)
        ) ?? null;
      const units = note.calculated_billing_units ?? 0;
      const charge = rate ? Math.round(rate.rate_per_unit * units * 100) / 100 : null;

      return { note, ok: blockers.length === 0, blockers, rate, charge };
    });
}

/** Notes with clock-in evidence (QA cross-check used by the billing screen). */
export async function notesWithoutEvv(noteList: NoteWithContext[]): Promise<Set<string>> {
  const logs = await listEvvLogs({});
  const visitsWithEvv = new Set(logs.map((l) => l.visit_id));
  return new Set(noteList.filter((n) => !visitsWithEvv.has(n.visit_id)).map((n) => n.id));
}

export type { VisitWithNames };
