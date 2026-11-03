// app/admin/billing/actions.ts — bulk 837P export and its preview (ADMIN-ONLY).
// Flow: re-evaluate readiness server-side (never trust the checkbox) →
// payer adapter builds the batch (fee-schedule gated) → export persisted to
// the claim ledger with a real control number → notes marked billed → the
// export itself is audit-logged. Blocked notes come back with their reasons.
// The preview runs the same build against control number 0 and touches
// nothing, so what is shown is what would go out.
"use server";

import { revalidatePath } from "next/cache";
import { requireFeature } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo/mode";
import { evaluateUnbilledNotes, type NoteReadiness } from "@/lib/billing/readiness";
import { getPayerAdapter } from "@/lib/billing/payers";
import { prettyPrint837P, submitterFromEnv, validateSubmitter } from "@/lib/billing/x12-837p";
import { getClient } from "@/lib/data/repo-core";
import { discardClaimExport, finalizeClaimExport, openClaimExport } from "@/lib/data/repo-business";
import type { Client } from "@/lib/supabase/types";

export interface ExportOptions {
  /** ISA15 = T: a test interchange the payer will not adjudicate. */
  testMode?: boolean;
  /** The payer record the batch is for, when the organization keeps payers. */
  payerId?: string | null;
}

async function selectReady(noteIds: string[]): Promise<{ ready: NoteReadiness[]; blocked: Record<string, string[]>; clients: Map<string, Client> }> {
  const readiness = await evaluateUnbilledNotes();
  const byId = new Map(readiness.map((r) => [r.note.id, r]));
  const blocked: Record<string, string[]> = {};
  const ready: NoteReadiness[] = [];
  for (const id of noteIds) {
    const r = byId.get(id);
    if (!r) blocked[id] = ["Note not found or already billed."];
    else if (!r.ok) blocked[id] = r.blockers;
    else ready.push(r);
  }
  const clients = new Map<string, Client>();
  for (const id of Array.from(new Set(ready.map((r) => r.note.client_id)))) {
    const c = await getClient(id);
    if (c) clients.set(id, c);
  }
  return { ready, blocked, clients };
}

function periodOf(ready: NoteReadiness[]): { periodStart?: string; periodEnd?: string } {
  const dates = ready.map((r) => r.note.date).sort();
  return dates.length ? { periodStart: dates[0], periodEnd: dates[dates.length - 1] } : {};
}

/** The file as it would go out, one segment per line, without touching the ledger. */
export async function previewClaim837P(
  noteIds: string[],
  opts: ExportOptions = {}
): Promise<{ ok: boolean; preview?: string; notes?: number; totalUnits?: number; totalCharge?: number; error?: string; blocked?: Record<string, string[]> }> {
  await requireFeature("billing.claims", "Admin");
  const { ready, blocked, clients } = await selectReady(noteIds);
  if (ready.length === 0) return { ok: false, error: "No claim-ready notes in selection.", blocked };
  const adapter = getPayerAdapter("COLORADO_MEDICAID");
  const batch = adapter.buildBatch(ready, clients, 0, { usage: opts.testMode ? "T" : "P" });
  if (!batch.ok || !batch.fileContent) return { ok: false, error: batch.error, blocked };
  return { ok: true, preview: prettyPrint837P(batch.fileContent), notes: ready.length, totalUnits: batch.totalUnits, totalCharge: batch.totalCharge, blocked };
}

export async function bulkExport837P(
  noteIds: string[],
  opts: ExportOptions = {}
): Promise<{
  ok: boolean;
  file?: string;
  fileName?: string;
  controlNumber?: number;
  exported?: number;
  error?: string;
  blocked?: Record<string, string[]>;
}> {
  const ctx = await requireFeature("billing.claims", "Admin");

  // Never put placeholder provider identity (all-zero NPI, TODO address) on
  // the wire. Demo mode is exempt: its file is synthetic by definition and
  // the demo tour exports it without any billing env configured.
  if (!isDemoMode()) {
    const configProblems = validateSubmitter(submitterFromEnv());
    if (configProblems.length > 0) {
      return { ok: false, error: `Billing configuration is incomplete — ${configProblems.join(" ")}` };
    }
  }

  const { ready, blocked, clients } = await selectReady(noteIds);
  if (ready.length === 0) {
    return { ok: false, error: "No claim-ready notes in selection.", blocked };
  }
  const usage = opts.testMode ? "T" : "P";

  // Dry-run build first (rates, diagnoses, client records) so nothing touches
  // the ledger unless the batch can actually be produced.
  const adapter = getPayerAdapter("COLORADO_MEDICAID");
  const probe = adapter.buildBatch(ready, clients, 0, { usage });
  if (!probe.ok) return { ok: false, error: probe.error, blocked };

  // Two-phase export: reserve the control number → build the real file with
  // it → attach the file AND mark notes billed. A note is never marked billed
  // without a stored file, and a failed phase leaves no half-recorded export.
  const readyIds = ready.map((r) => r.note.id);
  const opened = await openClaimExport(
    { noteIds: readyIds, totalUnits: probe.totalUnits, totalCharge: probe.totalCharge, payer: adapter.key, testMode: opts.testMode, payerId: opts.payerId, ...periodOf(ready) },
    ctx.auditCtx
  );
  if (!opened.ok || !opened.id || !opened.controlNumber) {
    return { ok: false, error: opened.error ?? "Failed to open the export ledger.", blocked };
  }

  const finalBatch = adapter.buildBatch(ready, clients, opened.controlNumber, { usage });
  if (!finalBatch.ok || !finalBatch.fileContent) {
    await discardClaimExport(opened.id);
    return { ok: false, error: finalBatch.error ?? "Batch build failed.", blocked };
  }

  const finalized = await finalizeClaimExport(opened.id, finalBatch.fileContent, readyIds, ctx.auditCtx, finalBatch.fileName);
  if (!finalized.ok) {
    await discardClaimExport(opened.id);
    return { ok: false, error: `${finalized.error} Nothing was marked billed — try the export again.`, blocked };
  }

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  return {
    ok: true,
    file: finalBatch.fileContent,
    fileName: finalBatch.fileName,
    controlNumber: opened.controlNumber,
    exported: ready.length,
    blocked
  };
}
