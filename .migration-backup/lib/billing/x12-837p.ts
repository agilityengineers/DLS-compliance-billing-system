// lib/billing/x12-837p.ts — X12 837P (Professional) claim export.
//
// Produces the correct SEGMENT STRUCTURE: ISA / GS / ST / BHT, loops
// 2000A (billing provider HL), 2010AA (billing provider name/address),
// 2000B/2010BA (subscriber), 2300 (claim), 2400 (service lines),
// then SE / GE / IEA with correct counts.
//
// TODO (payer-specific — flagged inline):
//  - Real payer/receiver IDs, interchange qualifiers per trading-partner
//    agreement (Colorado interChange / Gainwell values differ from defaults)
//  - Procedure codes (SV1) per service authorization (e.g. T2021 for SCC)
//  - Rendering-provider loops (2310B) when the biller != renderer
//  - CLIA / prior-auth REF segments where required
//
// Pure function; no I/O. Unit-tested in __tests__/x12-837p.test.ts.

export interface ClaimServiceLine {
  procedureCode: string;   // e.g. "T2021" — TODO confirm per payer contract
  units: number;
  chargeAmount: number;    // dollars
  serviceDate: string;     // YYYYMMDD
}

export interface ClaimInput {
  claimId: string;         // internal claim/visit reference
  client: { lastName: string; firstName: string; medicaidId: string; dob: string /* YYYYMMDD */; gender?: "M" | "F" | "U" };
  lines: ClaimServiceLine[];
  diagnosisCodes: string[]; // ICD-10, no dots
}

export interface Submitter {
  name: string; id: string; npi: string; taxId: string;
  address1: string; city: string; state: string; zip: string;
  receiverName: string; receiverId: string;
}

const SEG = "~\n";  // segment terminator (newline for readability; strip for wire)
const EL = "*";     // element separator

function pad(v: string, len: number) { return v.padEnd(len).slice(0, len); }
function ccyymmdd(d = new Date()) { return d.toISOString().slice(0, 10).replace(/-/g, ""); }
function hhmm(d = new Date()) { return d.toISOString().slice(11, 16).replace(":", ""); }

export function exportClaim837P(claims: ClaimInput[], submitter: Submitter, controlNumber = 1): string {
  const icn = String(controlNumber).padStart(9, "0");
  const segs: string[] = [];

  // ── Interchange & functional group ──
  segs.push(["ISA", "00", pad("", 10), "00", pad("", 10),
    "ZZ", pad(submitter.id, 15), "ZZ", pad(submitter.receiverId, 15),
    ccyymmdd().slice(2), hhmm(), "^", "00501", icn, "0", "P", ":"].join(EL));
  segs.push(["GS", "HC", submitter.id, submitter.receiverId, ccyymmdd(), hhmm(), icn, "X", "005010X222A1"].join(EL));

  const stIndex = segs.length;
  segs.push(["ST", "837", "0001", "005010X222A1"].join(EL));
  segs.push(["BHT", "0019", "00", icn, ccyymmdd(), hhmm(), "CH"].join(EL));

  // 1000A submitter / 1000B receiver
  segs.push(["NM1", "41", "2", submitter.name, "", "", "", "", "46", submitter.id].join(EL));
  segs.push(["PER", "IC", submitter.name, "TE", "0000000000"].join(EL)); // TODO real contact
  segs.push(["NM1", "40", "2", submitter.receiverName, "", "", "", "", "46", submitter.receiverId].join(EL));

  // ── Loop 2000A: billing provider HL ──
  let hl = 1;
  segs.push(["HL", String(hl), "", "20", "1"].join(EL));
  // Loop 2010AA
  segs.push(["NM1", "85", "2", submitter.name, "", "", "", "", "XX", submitter.npi].join(EL));
  segs.push(["N3", submitter.address1].join(EL));
  segs.push(["N4", submitter.city, submitter.state, submitter.zip].join(EL));
  segs.push(["REF", "EI", submitter.taxId.replace("-", "")].join(EL));
  const billingHl = hl;

  for (const claim of claims) {
    hl += 1;
    // ── Loop 2000B: subscriber HL ──
    segs.push(["HL", String(hl), String(billingHl), "22", "0"].join(EL));
    segs.push(["SBR", "P", "18", "", "", "", "", "", "", "MC"].join(EL)); // MC = Medicaid
    // Loop 2010BA
    segs.push(["NM1", "IL", "1", claim.client.lastName, claim.client.firstName, "", "", "", "MI", claim.client.medicaidId].join(EL));
    segs.push(["DMG", "D8", claim.client.dob, claim.client.gender ?? "U"].join(EL));
    // Payer 2010BB — TODO: real payer name/ID from trading-partner agreement
    segs.push(["NM1", "PR", "2", "COLORADO MEDICAID", "", "", "", "", "PI", submitter.receiverId].join(EL));

    // ── Loop 2300: claim ──
    const total = claim.lines.reduce((s, l) => s + l.chargeAmount, 0);
    segs.push(["CLM", claim.claimId, total.toFixed(2), "", "", "12:B:1", "Y", "A", "Y", "Y"].join(EL));
    const hi = claim.diagnosisCodes.map((c, i) => `${i === 0 ? "ABK" : "ABF"}:${c}`);
    if (hi.length) segs.push(["HI", ...hi].join(EL));

    // ── Loop 2400: service lines ──
    claim.lines.forEach((line, i) => {
      segs.push(["LX", String(i + 1)].join(EL));
      segs.push(["SV1", `HC:${line.procedureCode}`, line.chargeAmount.toFixed(2), "UN", String(line.units), "12", "", "1"].join(EL));
      segs.push(["DTP", "472", "D8", line.serviceDate].join(EL));
    });
  }

  // ── Trailers with correct counts ──
  const stSegCount = segs.length - stIndex + 1; // ST..SE inclusive
  segs.push(["SE", String(stSegCount), "0001"].join(EL));
  segs.push(["GE", "1", icn].join(EL));
  segs.push(["IEA", "1", icn].join(EL));

  return segs.join(SEG) + SEG.trimEnd() + "~";
}

export function submitterFromEnv(): Submitter {
  return {
    name: "DURABLE LIFE SKILLS INC",
    id: process.env.BILLING_SUBMITTER_ID ?? "DLS0001",
    npi: process.env.BILLING_NPI ?? "0000000000",
    taxId: process.env.BILLING_TAX_ID ?? "000000000",
    address1: "TODO STREET ADDRESS", city: "GREELEY", state: "CO", zip: "80631",
    receiverName: "COLORADO MEDICAID",
    receiverId: process.env.BILLING_RECEIVER_ID ?? "COMEDICAID"
  };
}
