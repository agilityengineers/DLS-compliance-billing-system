// app/admin/billing/actions.ts — bulk 837P export (ADMIN-ONLY).
// Flow: re-evaluate readiness server-side (never trust the checkbox) →
// payer adapter builds the batch (fee-schedule gated) → export persisted to
// the claim ledger with a real control number → notes marked billed → the
// export itself is audit-logged. Blocked notes come back with their reasons.
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { evaluateUnbilledNotes } from "@/lib/billing/readiness";
import { getPayerAdapter } from "@/lib/billing/payers";
import { getClient } from "@/lib/data/repo-core";
import { attachClaimExportFile, recordClaimExport } from "@/lib/data/repo-business";
import type { Client } from "@/lib/supabase/types";

export async function bulkExport837P(noteIds: string[]): Promise<{
  ok: boolean;
  file?: string;
  fileName?: string;
  controlNumber?: number;
  exported?: number;
  error?: string;
  blocked?: Record<string, string[]>;
}> {
  const ctx = await requireRole("Admin");

  const readiness = await evaluateUnbilledNotes();
  const byId = new Map(readiness.map((r) => [r.note.id, r]));

  const blocked: Record<string, string[]> = {};
  const ready = [];
  for (const id of noteIds) {
    const r = byId.get(id);
    if (!r) blocked[id] = ["Note not found or already billed."];
    else if (!r.ok) blocked[id] = r.blockers;
    else ready.push(r);
  }
  if (ready.length === 0) {
    return { ok: false, error: "No claim-ready notes in selection.", blocked };
  }

  const clientIds = Array.from(new Set(ready.map((r) => r.note.client_id)));
  const clients = new Map<string, Client>();
  for (const id of clientIds) {
    const c = await getClient(id);
    if (c) clients.set(id, c);
  }

  // Provisional control number; the ledger assigns the real one — rebuild
  // with it so the ISA/GS control numbers match the persisted record.
  const adapter = getPayerAdapter("COLORADO_MEDICAID");
  const probe = adapter.buildBatch(ready, clients, 0);
  if (!probe.ok) return { ok: false, error: probe.error, blocked };

  const ledger = await recordClaimExport(
    {
      noteIds: ready.map((r) => r.note.id),
      totalUnits: probe.totalUnits,
      totalCharge: probe.totalCharge,
      fileContent: "", // replaced below
      payer: adapter.key
    },
    ctx.auditCtx
  );
  if (!ledger.ok || !ledger.controlNumber) {
    return { ok: false, error: ledger.error ?? "Failed to persist the export ledger.", blocked };
  }

  const finalBatch = adapter.buildBatch(ready, clients, ledger.controlNumber);
  if (!finalBatch.ok || !finalBatch.fileContent) {
    return { ok: false, error: finalBatch.error ?? "Batch build failed.", blocked };
  }
  if (ledger.id) await attachClaimExportFile(ledger.id, finalBatch.fileContent);

  revalidatePath("/admin/billing");
  revalidatePath("/admin");
  return {
    ok: true,
    file: finalBatch.fileContent,
    fileName: finalBatch.fileName,
    controlNumber: ledger.controlNumber,
    exported: ready.length,
    blocked
  };
}
