// lib/credentialing/__tests__/registry.test.ts — the credentialing engine.
//
// These assertions are the contract claim readiness depends on. The most
// important one is negative: turning a requirement on must not start blocking
// claims for staff who simply have no record yet (see "never-started").
import { describe, expect, it } from "vitest";
import type { ReliasCompletion, ReliasCourse, Role, StaffUser } from "@/lib/supabase/types";
import {
  evaluateCredentials, gatingRequirementsForRole, requirementsForRole, summarize,
  type Requirement, type StaffCredentialRecord
} from "../registry";

const TODAY = "2026-06-15";

/** YYYY-MM-DD, `days` from TODAY. */
function day(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function req(over: Partial<Requirement> & Pick<Requirement, "id">): Requirement {
  return {
    label: over.id, category: "Training", required: true, gating: true,
    automated: false, vendor: null, appliesTo: ["Field_Staff"], renewsMonths: 12,
    source: { kind: "manual" }, note: "", sortOrder: 0, ...over
  };
}

function staff(over: Partial<StaffUser> = {}): StaffUser {
  return {
    id: "s1", email: "a@b.c", full_name: "Ana Field", role: "Field_Staff" as Role,
    status: "Active", license_number: null, license_expiration_date: null,
    training_completed: [], ...over
  };
}

function credential(over: Partial<StaffCredentialRecord> & Pick<StaffCredentialRecord, "requirement_id">): StaffCredentialRecord {
  return {
    staff_id: "s1", status: "verified", completed_on: day(-30), expires_on: null,
    note: null, waived_by: null, waive_reason: null, ...over
  };
}

const evaluate = (requirements: Requirement[], opts: Partial<Parameters<typeof evaluateCredentials>[0]> = {}) =>
  evaluateCredentials({ requirements, staff: staff(), today: TODAY, ...opts });

describe("requirement selection", () => {
  const registry = [
    req({ id: "field_only", appliesTo: ["Field_Staff"], sortOrder: 2 }),
    req({ id: "everyone", appliesTo: ["Admin", "Scheduler", "Field_Staff"], sortOrder: 1 }),
    req({ id: "optional", appliesTo: ["Field_Staff"], required: false, sortOrder: 3 })
  ];

  it("filters by role and orders by sortOrder", () => {
    expect(requirementsForRole(registry, "Field_Staff").map((r) => r.id)).toEqual([
      "everyone", "field_only", "optional"
    ]);
    expect(requirementsForRole(registry, "Scheduler").map((r) => r.id)).toEqual(["everyone"]);
  });

  it("counts only required + gating items as gating", () => {
    expect(gatingRequirementsForRole(registry, "Field_Staff").map((r) => r.id)).toEqual([
      "everyone", "field_only"
    ]);
  });
});

describe("licence evidence", () => {
  const registry = [req({ id: "dsp_license", label: "DSP license", source: { kind: "license" } })];

  it("blocks a claim when the licence has lapsed", () => {
    const [state] = evaluate(registry, {
      staff: staff({ license_number: "CO-1", license_expiration_date: day(-1) })
    });
    expect(state.status).toBe("expired");
    expect(state.blocksClaims).toBe(true);
    expect(state.detail).toContain("expired");
  });

  it("passes a current licence and reports its evidence", () => {
    const [state] = evaluate(registry, {
      staff: staff({ license_number: "CO-1", license_expiration_date: day(200) })
    });
    expect(state.status).toBe("verified");
    expect(state.blocksClaims).toBe(false);
    expect(state.evidence).toBe("license");
  });

  it("treats a licence inside the renewal window as a warning, not a block", () => {
    const [state] = evaluate(registry, {
      staff: staff({ license_number: "CO-1", license_expiration_date: day(10) })
    });
    expect(state.status).toBe("expiring");
    expect(state.blocksClaims).toBe(false);
  });

  it("does not block when no licence is on file at all", () => {
    const [state] = evaluate(registry);
    expect(state.status).toBe("not_started");
    expect(state.blocksClaims).toBe(false);
  });
});

describe("training evidence", () => {
  const registry = [
    req({ id: "cpr", label: "CPR / First Aid", source: { kind: "training", courseNames: ["CPR / First Aid"] } })
  ];
  const courses: ReliasCourse[] = [
    { id: "c1", code: "CPR", name: "CPR / First Aid", required: true, renewal_months: 24 }
  ];
  const completion = (over: Partial<ReliasCompletion>): ReliasCompletion => ({
    id: "rc1", user_id: "s1", course_id: "c1", completed_on: day(-10),
    expires_on: day(300), source: "api", synced_at: `${TODAY}T02:00:00.000Z`, ...over
  });

  it("accepts a training record on the staff row", () => {
    const [state] = evaluate(registry, {
      staff: staff({ training_completed: [{ course: "CPR / First Aid", completed_on: day(-100), expires_on: day(300) }] })
    });
    expect(state.status).toBe("verified");
    expect(state.evidence).toBe("training-record");
  });

  it("matches course names case- and whitespace-insensitively", () => {
    const [state] = evaluate(registry, {
      staff: staff({ training_completed: [{ course: "  cpr / first aid  ", completed_on: day(-10), expires_on: day(300) }] })
    });
    expect(state.status).toBe("verified");
  });

  it("blocks when the most recent record has lapsed", () => {
    const [state] = evaluate(registry, {
      staff: staff({ training_completed: [{ course: "CPR / First Aid", completed_on: day(-400), expires_on: day(-35) }] })
    });
    expect(state.status).toBe("expired");
    expect(state.blocksClaims).toBe(true);
  });

  it("takes the newer of a training record and a Relias completion", () => {
    // Stale record on the staff row, fresh Relias completion → current.
    const [state] = evaluate(registry, {
      staff: staff({ training_completed: [{ course: "CPR / First Aid", completed_on: day(-400), expires_on: day(-35) }] }),
      reliasCourses: courses,
      reliasCompletions: [completion({ completed_on: day(-5), expires_on: day(700) })]
    });
    expect(state.status).toBe("verified");
    expect(state.evidence).toBe("relias");
    expect(state.blocksClaims).toBe(false);
  });

  it("ignores another user's Relias completion", () => {
    const [state] = evaluate(registry, {
      reliasCourses: courses,
      reliasCompletions: [completion({ user_id: "someone-else" })]
    });
    expect(state.status).toBe("not_started");
  });
});

describe("explicit credential records", () => {
  const registry = [req({ id: "background_check", label: "Background check", source: { kind: "manual" } })];

  it("a waiver satisfies a gating requirement", () => {
    const states = evaluate(registry, {
      credentials: [credential({ requirement_id: "background_check", status: "waived", waive_reason: "Conditional start" })]
    });
    expect(states[0].status).toBe("waived");
    expect(states[0].blocksClaims).toBe(false);
    expect(summarize(states).ready).toBe(true);
    expect(states[0].detail).toContain("Conditional start");
  });

  it("a failure blocks the claim", () => {
    const [state] = evaluate(registry, {
      credentials: [credential({ requirement_id: "background_check", status: "failed" })]
    });
    expect(state.blocksClaims).toBe(true);
  });

  it("in progress is outstanding but does not block", () => {
    const states = evaluate(registry, {
      credentials: [credential({ requirement_id: "background_check", status: "in_progress" })]
    });
    expect(states[0].blocksClaims).toBe(false);
    expect(summarize(states).ready).toBe(false);
    expect(summarize(states).outstanding).toHaveLength(1);
  });

  it("overrides the fallback source", () => {
    // Lapsed licence on the staff row, but an explicit current record wins.
    const registry2 = [req({ id: "dsp_license", source: { kind: "license" } })];
    const [state] = evaluate(registry2, {
      staff: staff({ license_number: "CO-1", license_expiration_date: day(-1) }),
      credentials: [credential({ requirement_id: "dsp_license", expires_on: day(365) })]
    });
    expect(state.status).toBe("verified");
    expect(state.evidence).toBe("credential-record");
    expect(state.blocksClaims).toBe(false);
  });

  it("ignores a record belonging to a different staff member", () => {
    const [state] = evaluate(registry, {
      credentials: [credential({ requirement_id: "background_check", staff_id: "other" })]
    });
    expect(state.status).toBe("not_started");
  });
});

describe("the admin toggles decide what blocks", () => {
  const lapsed = { staff: staff({ license_number: "CO-1", license_expiration_date: day(-1) }) };

  it("an optional item never blocks, however lapsed", () => {
    const [state] = evaluate([req({ id: "x", required: false, source: { kind: "license" } })], lapsed);
    expect(state.status).toBe("expired");
    expect(state.blocksClaims).toBe(false);
  });

  it("a required but un-gated item never blocks", () => {
    const [state] = evaluate([req({ id: "x", gating: false, source: { kind: "license" } })], lapsed);
    expect(state.blocksClaims).toBe(false);
  });

  it("counts only gating items in the activation summary", () => {
    const states = evaluate([
      req({ id: "gates" }),
      req({ id: "optional", required: false }),
      req({ id: "ungated", gating: false })
    ]);
    const s = summarize(states);
    expect(s.total).toBe(1);
    expect(s.done).toBe(0);
  });
});

describe("never-started items (the behaviour claim readiness relied on)", () => {
  const registry = [req({ id: "hipaa", label: "HIPAA training", source: { kind: "training", courseNames: ["HIPAA Privacy & Security"] } })];

  it("does not block by default — turning a requirement on must not stop today's claims", () => {
    const states = evaluate(registry);
    expect(states[0].status).toBe("not_started");
    expect(states[0].blocksClaims).toBe(false);
    expect(summarize(states).claimBlockers).toEqual([]);
    // …but it IS outstanding, so the activation gate still catches it.
    expect(summarize(states).ready).toBe(false);
  });

  it("blocks when blockOnMissing is switched on (roadmap 2.8)", () => {
    const states = evaluate(registry, { blockOnMissing: true });
    expect(states[0].blocksClaims).toBe(true);
    expect(summarize(states).claimBlockers).toHaveLength(1);
  });

  it("blockOnMissing still respects the required/gating toggles", () => {
    const states = evaluate([req({ id: "hipaa", required: false })], { blockOnMissing: true });
    expect(states[0].blocksClaims).toBe(false);
  });
});

describe("summary", () => {
  it("reports ready only when every gating item is satisfied", () => {
    const registry = [
      req({ id: "a", source: { kind: "license" } }),
      req({ id: "b" })
    ];
    const partly = summarize(evaluate(registry, {
      staff: staff({ license_number: "CO-1", license_expiration_date: day(400) })
    }));
    expect(partly.done).toBe(1);
    expect(partly.total).toBe(2);
    expect(partly.ready).toBe(false);

    const all = summarize(evaluate(registry, {
      staff: staff({ license_number: "CO-1", license_expiration_date: day(400) }),
      credentials: [credential({ requirement_id: "b" })]
    }));
    expect(all.ready).toBe(true);
    expect(all.outstanding).toEqual([]);
  });

  it("separates expiring warnings from claim blockers", () => {
    const states = evaluate([req({ id: "a", source: { kind: "license" } })], {
      staff: staff({ license_number: "CO-1", license_expiration_date: day(10) })
    });
    const s = summarize(states);
    expect(s.expiring).toHaveLength(1);
    expect(s.claimBlockers).toEqual([]);
    expect(s.ready).toBe(true);
  });
});
