// lib/data/repo-business.ts — fee schedule, claim exports, payroll,
// menu config, Relias, incidents, audit trail, QA resolutions, settings.
import "server-only";

import { isDemoMode } from "@/lib/demo/mode";
import { getDemoStore, type AuditContext } from "@/lib/data/demo/store";
import { createDataClient, createServiceClient } from "@/lib/supabase/server";
import type {
  AuditRow, ClaimExport, FeeScheduleRow, Incident, MenuConfigRow,
  PayrollPeriod, PayrollLine, QaResolution, ReliasCompletion, ReliasCourse
} from "@/lib/supabase/types";

// ═══ fee schedule ═════════════════════════════════════════════════════════

export async function getFeeSchedule(payer = "COLORADO_MEDICAID"): Promise<FeeScheduleRow[]> {
  if (isDemoMode()) {
    return getDemoStore().data.feeSchedule.filter((f) => f.payer === payer);
  }
  const { data, error } = await createDataClient().from("fee_schedule").select("*").eq("payer", payer);
  if (error) throw new Error(error.message);
  return (data ?? []) as FeeScheduleRow[];
}

// ═══ claim exports ════════════════════════════════════════════════════════

export async function listClaimExports(): Promise<ClaimExport[]> {
  if (isDemoMode()) {
    return [...((getDemoStore().data as unknown as { claimExports?: ClaimExport[] }).claimExports ?? [])]
      .sort((a, b) => b.exported_at.localeCompare(a.exported_at));
  }
  const { data, error } = await createDataClient()
    .from("claim_exports").select("*").order("exported_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ClaimExport[];
}

/** Persist an 837P export + mark its notes billed. Always audited. */
export async function recordClaimExport(
  input: {
    noteIds: string[]; totalUnits: number; totalCharge: number;
    fileContent: string; payer?: string;
  },
  ctx: AuditContext
): Promise<{ ok: boolean; id?: string; controlNumber?: number; error?: string }> {
  const exportedAt = new Date().toISOString();
  if (isDemoMode()) {
    const store = getDemoStore();
    const bag = store.data as unknown as { claimExports?: ClaimExport[]; __ctrl?: number };
    bag.claimExports = bag.claimExports ?? [];
    bag.__ctrl = (bag.__ctrl ?? 1000) + 1;
    const exp: ClaimExport = {
      id: crypto.randomUUID(), exported_by: ctx.performedBy, exported_at: exportedAt,
      format: "837P", payer: input.payer ?? "COLORADO_MEDICAID",
      control_number: bag.__ctrl, note_ids: input.noteIds,
      total_units: input.totalUnits, total_charge: input.totalCharge,
      file_content: input.fileContent
    };
    bag.claimExports.push(exp);
    for (const id of input.noteIds) {
      const n = store.data.progressNotes.find((x) => x.id === id);
      if (n) {
        n.billed_at = exportedAt;
        n.claim_export_id = exp.id;
      }
    }
    store.audit("claim_exports", "INSERT", exp.id, null,
      { control_number: exp.control_number, notes: input.noteIds.length, total_charge: input.totalCharge }, ctx);
    return { ok: true, id: exp.id, controlNumber: exp.control_number };
  }

  // Service-role by necessity (ledger insert + cross-note billed flags in one
  // step); performed_by is recorded explicitly. PRODUCTION-READINESS.md §4.2.
  const service = createServiceClient();
  const { data, error } = await service
    .from("claim_exports")
    .insert({
      exported_by: ctx.performedBy, format: "837P",
      payer: input.payer ?? "COLORADO_MEDICAID", note_ids: input.noteIds,
      total_units: input.totalUnits, total_charge: input.totalCharge,
      file_content: input.fileContent
    })
    .select("id, control_number")
    .single();
  if (error) return { ok: false, error: error.message };
  const { error: markErr } = await service
    .from("progress_notes")
    .update({ billed_at: exportedAt, claim_export_id: data.id })
    .in("id", input.noteIds);
  if (markErr) return { ok: false, error: markErr.message };
  return { ok: true, id: data.id as string, controlNumber: data.control_number as number };
}

/** Attach the final wire file to a persisted export (control number known). */
export async function attachClaimExportFile(exportId: string, fileContent: string): Promise<void> {
  if (isDemoMode()) {
    const bag = getDemoStore().data as unknown as { claimExports?: ClaimExport[] };
    const exp = bag.claimExports?.find((e) => e.id === exportId);
    if (exp) exp.file_content = fileContent;
    return;
  }
  await createServiceClient().from("claim_exports").update({ file_content: fileContent }).eq("id", exportId);
}

// ═══ payroll ══════════════════════════════════════════════════════════════

export async function getCurrentPayrollPeriod(): Promise<PayrollPeriod | null> {
  if (isDemoMode()) {
    const periods = getDemoStore().data.payrollPeriods;
    return periods.find((p) => p.status === "open") ?? periods[0] ?? null;
  }
  const { data } = await createDataClient()
    .from("payroll_periods").select("*")
    .order("period_start", { ascending: false }).limit(1).maybeSingle();
  return (data as PayrollPeriod) ?? null;
}

export async function submitPayroll(
  periodId: string,
  snapshot: PayrollLine[],
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  if (isDemoMode()) {
    const store = getDemoStore();
    const p = store.data.payrollPeriods.find((x) => x.id === periodId);
    if (!p) return { ok: false, error: "Payroll period not found." };
    if (p.status === "submitted") return { ok: false, error: "Period already submitted." };
    const old = { ...p };
    p.status = "submitted";
    p.certified_by = ctx.performedBy;
    p.certified_at = now;
    p.snapshot = snapshot;
    store.audit("payroll_periods", "UPDATE", periodId, old,
      { status: "submitted", certified_by: ctx.performedBy, lines: snapshot.length }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient()
    .from("payroll_periods")
    .update({ status: "submitted", certified_by: ctx.performedBy, certified_at: now, snapshot })
    .eq("id", periodId)
    .eq("status", "open");
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ menu configuration ═══════════════════════════════════════════════════

export const DEFAULT_MENU_SECTIONS: Record<MenuConfigRow["role"], Record<string, boolean>> = {
  Scheduler: { CORE: true, COMPLIANCE: true, BUSINESS: true, TRAINING: true, SYSTEM: false },
  Field_Staff: { CORE: true, COMPLIANCE: false, BUSINESS: false, TRAINING: true, SYSTEM: false }
};

export async function getMenuConfig(): Promise<MenuConfigRow[]> {
  if (isDemoMode()) return [...getDemoStore().data.menuConfig];
  const { data } = await createDataClient().from("menu_config").select("*");
  const rows = (data ?? []) as MenuConfigRow[];
  return (["Scheduler", "Field_Staff"] as const).map(
    (role) => rows.find((r) => r.role === role) ?? { role, sections: DEFAULT_MENU_SECTIONS[role] }
  );
}

export async function setMenuConfig(
  role: MenuConfigRow["role"],
  sections: Record<string, boolean>,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const row = store.data.menuConfig.find((r) => r.role === role);
    if (row) row.sections = sections;
    else store.data.menuConfig.push({ role, sections });
    store.audit("menu_config", "UPDATE", null, null, { role, sections }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient()
    .from("menu_config").upsert({ role, sections }, { onConflict: "role" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ Relias ═══════════════════════════════════════════════════════════════

export async function listReliasCourses(): Promise<ReliasCourse[]> {
  if (isDemoMode()) return [...getDemoStore().data.reliasCourses];
  const { data, error } = await createDataClient().from("relias_courses").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as ReliasCourse[];
}

export async function listReliasCompletions(userId?: string): Promise<ReliasCompletion[]> {
  if (isDemoMode()) {
    const all = getDemoStore().data.reliasCompletions;
    return userId ? all.filter((c) => c.user_id === userId) : [...all];
  }
  let q = createDataClient().from("relias_completions").select("*");
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ReliasCompletion[];
}

export async function addReliasCompletion(
  completion: Omit<ReliasCompletion, "id" | "synced_at"> & { id?: string },
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  const full: ReliasCompletion = {
    ...completion,
    id: completion.id ?? crypto.randomUUID(),
    synced_at: new Date().toISOString()
  };
  if (isDemoMode()) {
    const store = getDemoStore();
    store.data.reliasCompletions.push(full);
    store.audit("relias_completions", "INSERT", full.id, null, { ...full }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient().from("relias_completions").insert(full);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ incidents ════════════════════════════════════════════════════════════

export async function listIncidents(reportedBy?: string): Promise<Incident[]> {
  if (isDemoMode()) {
    const all = getDemoStore().data.incidents;
    return (reportedBy ? all.filter((i) => i.reported_by === reportedBy) : [...all])
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }
  let q = createDataClient().from("incidents").select("*").order("occurred_at", { ascending: false });
  if (reportedBy) q = q.eq("reported_by", reportedBy);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Incident[];
}

export async function createIncident(
  incident: Omit<Incident, "id">,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  const full: Incident = { ...incident, id: crypto.randomUUID() };
  if (isDemoMode()) {
    const store = getDemoStore();
    store.data.incidents.push(full);
    store.audit("incidents", "INSERT", full.id, null, { ...full }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient().from("incidents").insert(full);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ audit trail ══════════════════════════════════════════════════════════

export async function listAuditTrail(filter: {
  table?: string; limit?: number;
} = {}): Promise<(AuditRow & { performed_by_name: string | null; impersonating_name: string | null })[]> {
  const limit = filter.limit ?? 100;
  if (isDemoMode()) {
    const { auditTrail, users } = getDemoStore().data;
    const name = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? null;
    return auditTrail
      .filter((a) => !filter.table || a.table_name === filter.table)
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
      .map((a) => ({ ...a, performed_by_name: name(a.performed_by), impersonating_name: name(a.impersonating) }));
  }
  // Audit reads require the service client (RLS: admin-select only; the
  // performed_by join spans users). Callers must be role-gated (Admin).
  const service = createServiceClient();
  let q = service.from("audit_trails").select("*").order("timestamp", { ascending: false }).limit(limit);
  if (filter.table) q = q.eq("table_name", filter.table);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AuditRow[];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.performed_by, r.impersonating]).filter(Boolean))) as string[];
  const { data: users } = ids.length
    ? await service.from("users").select("id,full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string }[] };
  const name = (id: string | null) => users?.find((u) => u.id === id)?.full_name ?? null;
  return rows.map((a) => ({ ...a, performed_by_name: name(a.performed_by), impersonating_name: name(a.impersonating) }));
}

// ═══ QA resolutions ═══════════════════════════════════════════════════════

export async function listQaResolutions(): Promise<QaResolution[]> {
  if (isDemoMode()) {
    return [...((getDemoStore().data as unknown as { qaResolutions?: QaResolution[] }).qaResolutions ?? [])];
  }
  const { data, error } = await createDataClient().from("qa_resolutions").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as QaResolution[];
}

export async function resolveQaFlag(
  flagKey: string,
  resolutionNote: string,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (!resolutionNote.trim()) return { ok: false, error: "A resolution note is required." };
  if (isDemoMode()) {
    const store = getDemoStore();
    const bag = store.data as unknown as { qaResolutions?: QaResolution[] };
    bag.qaResolutions = bag.qaResolutions ?? [];
    if (bag.qaResolutions.some((r) => r.flag_key === flagKey)) return { ok: true };
    const row: QaResolution = {
      id: crypto.randomUUID(), flag_key: flagKey,
      resolved_by: ctx.performedBy ?? "", resolution_note: resolutionNote,
      resolved_at: new Date().toISOString()
    };
    bag.qaResolutions.push(row);
    store.audit("qa_resolutions", "INSERT", row.id, null, { ...row }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient().from("qa_resolutions").insert({
    flag_key: flagKey, resolved_by: ctx.performedBy, resolution_note: resolutionNote
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
