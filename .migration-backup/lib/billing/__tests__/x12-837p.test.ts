// lib/billing/__tests__/x12-837p.test.ts — interface contract for the 837P export
import { describe, it, expect } from "vitest";
import { exportClaim837P, type ClaimInput, type Submitter } from "../x12-837p";

const submitter: Submitter = {
  name: "DURABLE LIFE SKILLS INC", id: "DLS0001", npi: "1234567890",
  taxId: "84-1234567", address1: "123 MAIN ST", city: "GREELEY", state: "CO", zip: "80631",
  receiverName: "COLORADO MEDICAID", receiverId: "COMEDICAID"
};

const claim: ClaimInput = {
  claimId: "VIS-0001",
  client: { lastName: "DOE", firstName: "JANE", medicaidId: "A123456", dob: "19980214", gender: "F" },
  diagnosisCodes: ["F840"],
  lines: [
    { procedureCode: "T2021", units: 4, chargeAmount: 62.0, serviceDate: "20260601" },
    { procedureCode: "T2021", units: 2, chargeAmount: 31.0, serviceDate: "20260602" }
  ]
};

describe("exportClaim837P segment structure", () => {
  const out = exportClaim837P([claim], submitter, 42);
  const segs = out.split("~").map((s) => s.trim()).filter(Boolean);

  it("opens ISA/GS/ST/BHT and closes SE/GE/IEA in order", () => {
    expect(segs[0]).toMatch(/^ISA\*/);
    expect(segs[1]).toMatch(/^GS\*HC\*/);
    expect(segs[2]).toMatch(/^ST\*837\*0001\*005010X222A1$/);
    expect(segs[3]).toMatch(/^BHT\*0019\*00\*/);
    expect(segs[segs.length - 3]).toMatch(/^SE\*\d+\*0001$/);
    expect(segs[segs.length - 2]).toMatch(/^GE\*1\*/);
    expect(segs[segs.length - 1]).toMatch(/^IEA\*1\*/);
  });

  it("contains 2000A billing provider and 2010AA with NPI", () => {
    expect(out).toContain("HL*1**20*1");
    expect(out).toContain("NM1*85*2*DURABLE LIFE SKILLS INC*****XX*1234567890");
  });

  it("contains 2000B subscriber with Medicaid ID and DOB", () => {
    expect(out).toContain("NM1*IL*1*DOE*JANE****MI*A123456");
    expect(out).toContain("DMG*D8*19980214*F");
  });

  it("2300 CLM total equals the sum of line charges", () => {
    expect(out).toContain("CLM*VIS-0001*93.00");
    expect(out).toContain("HI*ABK:F840");
  });

  it("emits one LX/SV1/DTP triple per service line with unit counts", () => {
    expect(out).toContain("LX*1");
    expect(out).toContain("SV1*HC:T2021*62.00*UN*4*12**1");
    expect(out).toContain("LX*2");
    expect(out).toContain("DTP*472*D8*20260602");
  });

  it("SE count matches actual ST..SE segment count", () => {
    const seIdx = segs.findIndex((s) => s.startsWith("SE*"));
    const stIdx = segs.findIndex((s) => s.startsWith("ST*"));
    const declared = Number(segs[seIdx].split("*")[1]);
    expect(declared).toBe(seIdx - stIdx + 1);
  });
});
