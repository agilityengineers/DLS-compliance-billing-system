// lib/data/billing-api.ts — the organization's REAL fee schedule and claim
// ledger (the API's billing_codes and claim_submissions tables), in the shapes
// the billing screens and the readiness engine already read. Mirrors
// lib/data/clients-api.ts: fetched once per navigation/revalidation,
// unreachable API → an empty list, never a broken screen.
import "server-only";
import { isApiAuth } from "@/lib/auth/mode";
import { billingApi, type BillingCode, type ClaimSubmission } from "@/lib/api/admin";
import { getSessionContext } from "@/lib/auth/session";
import { subscribeRevalidate } from "@/shims/nav-bridge";
import type { ClaimExport, FeeScheduleRow, VisitType } from "@/lib/supabase/types";

let cachedCodes: Promise<FeeScheduleRow[]> | null = null;
subscribeRevalidate(() => {
  cachedCodes = null;
});

export function invalidateBilling(): void {
  cachedCodes = null;
}

const VISIT_TYPES: readonly string[] = ["SCC", "Job_Coaching", "Day_Habilitation", "Early_Intervention"];

/**
 * A billing code in the fee-schedule shape claim readiness prices from. Codes
 * for transportation or "Other" have no visit type to price, so they are left
 * out; only the first modifier rides along because that is what the claim
 * line carries today.
 */
export function billingCodeToFeeRow(c: BillingCode): FeeScheduleRow | null {
  if (!VISIT_TYPES.includes(c.service) || c.archived) return null;
  return {
    id: c.id,
    payer: "COLORADO_MEDICAID",
    visit_type: c.service as VisitType,
    procedure_code: c.code,
    modifier: c.modifier1,
    rate_per_unit: c.ratePerUnit,
    effective_date: c.effectiveDate,
    end_date: c.endDate,
  };
}

/** The organization's fee schedule from the API; empty when it has none, or the switch is off. */
export function listFeeScheduleRecords(): Promise<FeeScheduleRow[]> {
  if (!isApiAuth()) return Promise.resolve([]);
  if (!cachedCodes) {
    cachedCodes = (async () => {
      const ctx = await getSessionContext();
      if (!ctx.realUser || !ctx.effectiveUser?.org_id || !ctx.features.has("billing.codes")) return [];
      try {
        const res = await billingApi.codes.list();
        return res.codes.map(billingCodeToFeeRow).filter((r): r is FeeScheduleRow => r !== null);
      } catch {
        return [];
      }
    })().catch(() => {
      cachedCodes = null;
      return [];
    });
  }
  return cachedCodes;
}

export function submissionToClaimExport(s: ClaimSubmission): ClaimExport {
  return {
    id: s.id,
    exported_by: s.createdByUserId,
    exported_at: s.submittedAt ?? s.createdAt,
    format: s.format,
    payer: s.payerKey,
    control_number: s.controlNumber,
    note_ids: s.noteIds,
    total_units: s.totalUnits,
    total_charge: s.totalCharge,
    file_content: null,
    status: s.status,
    status_note: s.statusNote,
    test_mode: s.testMode,
    file_name: s.fileName,
    is_record: true,
  };
}
