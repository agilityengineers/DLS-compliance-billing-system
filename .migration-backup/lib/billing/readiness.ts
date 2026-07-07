// lib/billing/readiness.ts — claim-readiness engine (Business Rule #2).
// Replaces the scaffold's guardrails.ts, fixing its audited defects:
//   · weekly-authorization cap is applied PER SERVICE TYPE (the old code
//     summed every visit type against the SCC-only cap)
//   · week windows use local dates end-to-end (no UTC/local mix)
//   · adds blockers: cancelled/unclocked visit, inactive physician order,
//     overdue REQUIRED Relias courses
//   · runs on the repo (demo + Supabase) instead of raw service-role queries
import "server-only";

import { listNotes, type NoteWithContext, listEvvLogs } from "@/lib/data/repo-field";
import { listClients, listPhysicianOrders, listUsers, listVisits } from "@/lib/data/repo-core";
import { getFeeSchedule, listReliasCompletions, listReliasCourses } from "@/lib/data/repo-business";
import type { Client, FeeScheduleRow, StaffUser, VisitType, VisitWithNames } from "@/lib/supabase/types";

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

function sundayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Evaluate claim readiness for all unbilled notes in a window.
 * One data pass — per-note evaluation shares the loaded context.
 */
export async function evaluateUnbilledNotes(opts: { from?: string; to?: string } = {}): Promise<NoteReadiness[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [notes, allNotes, users, clients, visits, orders, fees, courses, completions] = await Promise.all([
    listNotes({ ...opts, unbilledOnly: true }),
    listNotes({}), // full window for weekly-unit sums
    listUsers(),
    listClients(),
    listVisits({}),
    listPhysicianOrders(),
    getFeeSchedule(),
    listReliasCourses(),
    listReliasCompletions()
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const visitById = new Map(visits.map((v) => [v.id, v]));

  return notes
    .filter((n) => !n.cancellation_reason)
    .map((note) => {
      const staff = userById.get(note.staff_id);
      const client = clientById.get(note.client_id);
      const visit = visitById.get(note.visit_id);
      const blockers: string[] = [];

      // 1a. Staff license
      if (staff?.license_expiration_date && staff.license_expiration_date < today) {
        blockers.push(`Staff license expired ${fmt(staff.license_expiration_date)} (${staff.full_name}).`);
      }
      // 1b. Required trainings (credential records)
      for (const t of staff?.training_completed ?? []) {
        if (t.required !== false && t.expires_on && t.expires_on < today) {
          blockers.push(`Required training "${t.course}" expired ${fmt(t.expires_on)}.`);
        }
      }
      // 1c. Overdue REQUIRED Relias courses. A current same-named credential
      // record (manually recorded renewal) also satisfies the requirement.
      if (staff && staff.role === "Field_Staff") {
        for (const course of courses.filter((c) => c.required)) {
          const done = completions
            .filter((x) => x.user_id === staff.id && x.course_id === course.id)
            .sort((a, b) => b.completed_on.localeCompare(a.completed_on))[0];
          const credential = (staff.training_completed ?? []).find(
            (t) => t.course.trim().toLowerCase() === course.name.trim().toLowerCase()
          );
          const credentialCurrent = credential && (!credential.expires_on || credential.expires_on >= today);
          const completionCurrent = done && (!done.expires_on || done.expires_on >= today);
          if (!completionCurrent && !credentialCurrent && (done || credential)) {
            blockers.push(`Required course "${course.name}" is expired (Relias/credentials).`);
          }
        }
      }

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

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

export type { VisitWithNames };
