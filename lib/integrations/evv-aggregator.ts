// lib/integrations/evv-aggregator.ts — modular EVV aggregator adapters.
// Colorado's designated aggregator is SANDATA (hybrid model: free state EVV
// solution, or an alternate vendor that integrates with Sandata). Per
// DECISIONS.md the Sandata adapter comes first and the interface stays
// swappable. Transport is mocked until credentials + certification
// (PRODUCTION-READINESS.md §4.5).
import "server-only";
import { isDemoMode } from "@/lib/demo/mode";
import { assertBaaGate } from "./hipaaGate";
import type { EvvLog, VisitWithNames } from "@/lib/supabase/types";

export interface AggregatorSubmission {
  accepted: boolean;
  reference?: string;
  error?: string;
}

export interface EvvAggregatorAdapter {
  readonly key: string;
  /** Submit a completed, verified visit (clock-in + clock-out) upstream. */
  submitVisit(log: EvvLog, visit: VisitWithNames): Promise<AggregatorSubmission>;
}

/** DEMO: accepts everything locally and mints a fake reference. */
class DemoAggregatorAdapter implements EvvAggregatorAdapter {
  readonly key = "demo";
  async submitVisit(log: EvvLog): Promise<AggregatorSubmission> {
    return { accepted: true, reference: `DEMO-SAN-${log.id.slice(0, 8).toUpperCase()}` };
  }
}

/** Sandata (Colorado aggregator). Envelope per the Sandata OpenEVV spec —
 *  field mapping to be confirmed during certification/UAT. */
class SandataAdapter implements EvvAggregatorAdapter {
  readonly key = "sandata";

  async submitVisit(log: EvvLog, visit: VisitWithNames): Promise<AggregatorSubmission> {
    assertBaaGate("Sandata");
    const base = process.env.SANDATA_API_BASE_URL;
    const agency = process.env.SANDATA_AGENCY_ID;
    if (!base || !agency) {
      return { accepted: false, error: "Sandata not configured (SANDATA_API_BASE_URL / SANDATA_AGENCY_ID)." };
    }
    const auth = Buffer.from(`${process.env.SANDATA_USERNAME}:${process.env.SANDATA_PASSWORD}`).toString("base64");
    const res = await fetch(`${base}/interfaces/intake/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        ProviderIdentification: { ProviderQualifier: "SandataID", ProviderID: agency },
        VisitOtherID: log.visit_id,
        Calls: [
          { CallDateTime: log.clock_in_time, CallAssignment: "Time In", CallType: log.verification_method === "GPS" ? "Mobile" : log.verification_method,
            Location: log.clock_in_gps ? { Latitude: log.clock_in_gps.lat, Longitude: log.clock_in_gps.lng } : undefined },
          { CallDateTime: log.clock_out_time, CallAssignment: "Time Out", CallType: log.verification_method === "GPS" ? "Mobile" : log.verification_method,
            Location: log.clock_out_gps ? { Latitude: log.clock_out_gps.lat, Longitude: log.clock_out_gps.lng } : undefined }
        ],
        // Field mapping TODO (certification): client/employee identifiers,
        // service codes, payer program, exception acknowledgements.
        Service: visit.visit_type
      })
    });
    if (!res.ok) return { accepted: false, error: `Sandata ${res.status}` };
    const body = (await res.json().catch(() => ({}))) as { TransactionID?: string };
    return { accepted: true, reference: body.TransactionID };
  }
}

export function getEvvAggregator(): EvvAggregatorAdapter {
  if (isDemoMode() || !process.env.SANDATA_API_BASE_URL) return new DemoAggregatorAdapter();
  return new SandataAdapter();
}
