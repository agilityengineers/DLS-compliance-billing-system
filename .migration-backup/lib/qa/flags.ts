// lib/qa/flags.ts — the QA inconsistency engine (README: resolvable flags).
// Three checks: (1) med administration with no EVV-clocked visit spanning it,
// (2) completed notes missing signatures, (3) expired ITD authorization
// (service plan lapsed with activity scheduled/recorded).
// Flags are computed from data; resolutions live in qa_resolutions keyed by
// a deterministic flag_key.
import "server-only";

import { listVisits } from "@/lib/data/repo-core";
import { listEvvLogs, listMedications, listNotes } from "@/lib/data/repo-field";
import { listClients } from "@/lib/data/repo-core";
import { listQaResolutions } from "@/lib/data/repo-business";

export interface QaFlag {
  key: string; // deterministic — resolution join key
  kind: "med-no-evv" | "missing-signature" | "expired-authorization";
  kindLabel: string;
  client: string;
  date: string;
  detail: string;
}

export async function computeQaFlags(opts: { includeResolved?: boolean } = {}): Promise<{
  open: QaFlag[];
  resolvedKeys: Set<string>;
}> {
  const today = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayIso = iso(today);
  const from = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 45));

  const [meds, evvLogs, notes, clients, visits, resolutions] = await Promise.all([
    listMedications({ from, to: todayIso, status: "Administered" }),
    listEvvLogs({ from, to: todayIso }),
    listNotes({ from, to: todayIso }),
    listClients(),
    listVisits({ from: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)), to: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)) }),
    listQaResolutions()
  ]);

  const flags: QaFlag[] = [];
  const visitClient = new Map(visits.map((v) => [v.id, v.client_id]));

  // ── 1. Medication administered with no EVV overlap ─────────────────────
  for (const m of meds) {
    if (!m.administered_time) continue;
    const t = new Date(m.administered_time).getTime();
    const overlap = evvLogs.some((log) => {
      if (!log.clock_in_time || !log.clock_out_time) return false;
      const clientId = visitClient.get(log.visit_id);
      if (clientId !== m.client_id) return false;
      return new Date(log.clock_in_time).getTime() <= t && t <= new Date(log.clock_out_time).getTime();
    });
    if (!overlap) {
      flags.push({
        key: `med-no-evv:${m.id}`,
        kind: "med-no-evv",
        kindLabel: "Med log without EVV overlap",
        client: m.client_name,
        date: m.administered_time.slice(0, 10),
        detail: `${m.medication_name} ${m.dosage} administered at ${new Date(m.administered_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} with no clocked-in visit spanning that time.`
      });
    }
  }

  // ── 2. Notes missing signatures ─────────────────────────────────────────
  for (const n of notes) {
    if (n.cancellation_reason) continue;
    const missing = [
      !n.caregiver_signature_data && "caregiver",
      !n.client_signature_data && "client"
    ].filter(Boolean);
    if (missing.length > 0) {
      flags.push({
        key: `missing-signature:${n.id}`,
        kind: "missing-signature",
        kindLabel: "Missing signature",
        client: n.client_name,
        date: n.date,
        detail: `Progress note missing ${missing.join(" + ")} signature(s) — blocks the claim.`
      });
    }
  }

  // ── 3. Expired ITD authorization (service plan lapsed) ────────────────
  for (const c of clients) {
    if (!c.service_plan_end || c.service_plan_end >= todayIso) continue;
    const hasActivity = visits.some((v) => v.client_id === c.id && v.status !== "Cancelled");
    const label = `${c.last_name}, ${c.first_name}`;
    flags.push({
      key: `expired-authorization:${c.id}:${c.service_plan_end}`,
      kind: "expired-authorization",
      kindLabel: "Expired ITD authorization",
      client: label,
      date: c.service_plan_end,
      detail: hasActivity
        ? `Service plan expired ${c.service_plan_end} but visits are still on the schedule — renew the authorization or cancel the visits.`
        : `Service plan expired ${c.service_plan_end}. Renew before scheduling further services.`
    });
  }

  const resolvedKeys = new Set(resolutions.map((r) => r.flag_key));
  const open = flags
    .filter((f) => opts.includeResolved || !resolvedKeys.has(f.key))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { open, resolvedKeys };
}
