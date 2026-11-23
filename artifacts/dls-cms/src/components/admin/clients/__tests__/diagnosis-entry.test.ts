import { describe, expect, it } from "vitest";
import { normalizeIcd10, pendingDiagnosis, validateDiagnosis } from "../diagnosis-entry";

describe("normalizeIcd10", () => {
  it("trims and upper-cases", () => {
    expect(normalizeIcd10("  f84.0 ")).toBe("F84.0");
  });
});

describe("validateDiagnosis", () => {
  it("accepts a code with a description and cleans both", () => {
    expect(validateDiagnosis({ code: "f71", description: " Moderate ID " }, [])).toEqual({
      ok: true,
      value: { code: "F71", description: "Moderate ID" },
    });
  });

  it("accepts a code without a description", () => {
    expect(validateDiagnosis({ code: "G40.909", description: "" }, [])).toMatchObject({ ok: true });
  });

  it("explains a missing code instead of silently ignoring it", () => {
    const res = validateDiagnosis({ code: "  ", description: "Autism" }, []);
    expect(res).toEqual({ ok: false, error: "Enter the ICD-10 code for this diagnosis." });
  });

  it("allows several diagnoses but refuses the same code twice", () => {
    const list = [{ code: "F84.0" }, { code: "G40.909" }];
    expect(validateDiagnosis({ code: "F71", description: "" }, list)).toMatchObject({ ok: true });
    expect(validateDiagnosis({ code: "f84.0", description: "" }, list)).toEqual({ ok: false, error: "F84.0 is already on the list." });
  });
});

describe("pendingDiagnosis (what is left in the boxes on save)", () => {
  it("is empty when nothing, or only spaces, is typed", () => {
    expect(pendingDiagnosis({ code: " ", description: "  " }, [])).toEqual({ status: "empty" });
  });

  it("hands over a typed-but-not-added diagnosis so it is saved", () => {
    expect(pendingDiagnosis({ code: "f71", description: "Moderate ID" }, [{ code: "F84.0" }])).toEqual({
      status: "ok",
      value: { code: "F71", description: "Moderate ID" },
    });
  });

  it("stops the save for a description with no code, or a duplicate", () => {
    expect(pendingDiagnosis({ code: "", description: "Autism" }, [])).toMatchObject({ status: "invalid" });
    expect(pendingDiagnosis({ code: "F84.0", description: "" }, [{ code: "F84.0" }])).toMatchObject({ status: "invalid" });
  });
});
