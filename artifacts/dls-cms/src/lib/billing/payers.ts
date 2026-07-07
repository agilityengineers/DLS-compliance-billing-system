// lib/billing/payers.ts — modular payer/billing adapter layer.
// DECISIONS.md: billing must be modular — the client's existing system is
// TBD (possibly QuickBooks), so this defines the seam. The Colorado
// Medicaid 837P adapter is the first (and default) implementation; the
// QuickBooks adapter is an interface stub awaiting the client's decision.
import "server-only";

import { exportClaim837P, submitterFromEnv, type ClaimInput } from "./x12-837p";
import type { NoteReadiness } from "./readiness";
import type { Client } from "@/lib/supabase/types";

export interface ClaimBatchResult {
  ok: boolean;
  /** Wire-format file content (e.g. X12 837P) when the adapter produces one. */
  fileContent?: string;
  fileName?: string;
  totalUnits: number;
  totalCharge: number;
  error?: string;
}

export interface PayerAdapter {
  readonly key: string;
  readonly label: string;
  /** Build a claim batch from claim-ready notes. Must refuse notes without a fee-schedule rate. */
  buildBatch(ready: NoteReadiness[], clients: Map<string, Client>, controlNumber: number): ClaimBatchResult;
}

/** Colorado Medicaid — X12 837P via the state's designated aggregation path. */
class ColoradoMedicaid837PAdapter implements PayerAdapter {
  readonly key = "COLORADO_MEDICAID";
  readonly label = "Colorado Medicaid (837P)";

  buildBatch(ready: NoteReadiness[], clients: Map<string, Client>, controlNumber: number): ClaimBatchResult {
    // Fee-schedule gate: never emit a claim line without a real rate.
    const missingRate = ready.filter((r) => !r.rate || r.charge == null);
    if (missingRate.length > 0) {
      return {
        ok: false, totalUnits: 0, totalCharge: 0,
        error: `No fee-schedule rate for ${missingRate.length} note(s) (${missingRate
          .map((r) => r.note.visit_type)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ")}). Load the payer fee schedule before exporting.`
      };
    }

    const claims: ClaimInput[] = [];
    for (const r of ready) {
      const client = clients.get(r.note.client_id);
      if (!client) {
        return { ok: false, totalUnits: 0, totalCharge: 0, error: `Client record missing for note ${r.note.id}.` };
      }
      claims.push({
        claimId: `PN-${r.note.id.slice(0, 8).toUpperCase()}`,
        client: {
          lastName: client.last_name.toUpperCase(),
          firstName: client.first_name.toUpperCase(),
          medicaidId: client.medicaid_id,
          dob: client.date_of_birth.replace(/-/g, "")
        },
        diagnosisCodes: (client.active_diagnoses ?? []).map((d) => d.code.replace(".", "")),
        lines: [
          {
            procedureCode: r.rate!.procedure_code,
            units: r.note.calculated_billing_units ?? 0,
            chargeAmount: r.charge!,
            serviceDate: r.note.date.replace(/-/g, "")
          }
        ]
      });
    }

    const totalUnits = ready.reduce((s, r) => s + (r.note.calculated_billing_units ?? 0), 0);
    const totalCharge = Math.round(ready.reduce((s, r) => s + (r.charge ?? 0), 0) * 100) / 100;
    const fileContent = exportClaim837P(claims, submitterFromEnv(), controlNumber);
    return {
      ok: true,
      fileContent,
      fileName: `dls-837p-${new Date().toISOString().slice(0, 10)}-cn${controlNumber}.txt`,
      totalUnits,
      totalCharge
    };
  }
}

/**
 * QuickBooks adapter — INTERFACE STUB (PRODUCTION-READINESS.md §4).
 * The client's billing system is TBD; when QuickBooks is confirmed, this
 * adapter maps claim-ready notes to invoices/AR via the QuickBooks API.
 */
class QuickBooksStubAdapter implements PayerAdapter {
  readonly key = "QUICKBOOKS";
  readonly label = "QuickBooks (not configured)";

  buildBatch(): ClaimBatchResult {
    return {
      ok: false, totalUnits: 0, totalCharge: 0,
      error: "QuickBooks integration is a stub pending the client's billing-system decision (DECISIONS.md)."
    };
  }
}

const REGISTRY: Record<string, PayerAdapter> = {
  COLORADO_MEDICAID: new ColoradoMedicaid837PAdapter(),
  QUICKBOOKS: new QuickBooksStubAdapter()
};

export function getPayerAdapter(key = "COLORADO_MEDICAID"): PayerAdapter {
  return REGISTRY[key] ?? REGISTRY.COLORADO_MEDICAID;
}

export function listPayerAdapters(): { key: string; label: string }[] {
  return Object.values(REGISTRY).map((a) => ({ key: a.key, label: a.label }));
}
