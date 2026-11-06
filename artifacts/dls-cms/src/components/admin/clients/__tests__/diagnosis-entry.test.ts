import { describe, expect, it } from "vitest";
import { normalizeIcd10, validateDiagnosis } from "../diagnosis-entry";

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
