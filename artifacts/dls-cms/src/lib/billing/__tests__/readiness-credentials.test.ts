// lib/billing/__tests__/readiness-credentials.test.ts — REGRESSION GUARD.
//
// Claim readiness used to carry three hand-written credential checks; they are
// now one pass over the requirements registry. That rewrite touched the code
// that decides whether real money moves, so this suite pins the outcome
// against the demo dataset: the same two staff members must be blocked, for
// the same reasons, and nobody else.
//
// The demo dataset is deterministic and dated relative to today, so these
// assertions hold on any day the suite runs.
import { describe, expect, it } from "vitest";
import { evaluateUnbilledNotes } from "../readiness";
import { listRequirements, listStaffCredentials } from "@/lib/data/repo-credentialing";
import { listUsers } from "@/lib/data/repo-core";
import { listReliasCompletions, listReliasCourses } from "@/lib/data/repo-business";
import { evaluateAndSummarize } from "@/lib/credentialing/registry";
import { agencyTodayIso } from "@/lib/time/agency";

/** Credential blockers per staff member, straight from the demo dataset. */
async function blockersByStaff(): Promise<Map<string, string[]>> {
  const [requirements, credentials, users, courses, completions] = await Promise.all([
    listRequirements(), listStaffCredentials(), listUsers(), listReliasCourses(), listReliasCompletions()
  ]);
  const today = agencyTodayIso();
  return new Map(
    users.map((staff) => [
      staff.full_name,
      evaluateAndSummarize({
        requirements, staff, credentials, reliasCourses: courses, reliasCompletions: completions, today
      }).summary.claimBlockers
    ])
  );
}

/** Full credential summary for one staff member, by name. */
async function summaryFor(fullName: string) {
  const [requirements, credentials, users, courses, completions] = await Promise.all([
    listRequirements(), listStaffCredentials(), listUsers(), listReliasCourses(), listReliasCompletions()
  ]);
  const staff = users.find((u) => u.full_name === fullName);
  if (!staff) throw new Error(`No demo staff member named ${fullName}`);
  return evaluateAndSummarize({
    requirements, staff, credentials, reliasCourses: courses, reliasCompletions: completions,
    today: agencyTodayIso()
  }).summary;
}

describe("demo dataset — who is blocked from billing", () => {
  it("blocks exactly the two staff the dataset stages as blockers", async () => {
    const blocked = [...(await blockersByStaff())].filter(([, b]) => b.length > 0).map(([name]) => name);
    // Martinez: lapsed licence. Torres: lapsed CPR / First Aid.
    expect(blocked.sort()).toEqual(["Celine Torres", "Lesley Martinez"]);
  });

  it("blocks Lesley Martinez on the lapsed licence, and only that", async () => {
    const blockers = (await blockersByStaff()).get("Lesley Martinez") ?? [];
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/DSP license expired/i);
  });

  it("blocks Celine Torres on the lapsed CPR record, and only that", async () => {
    const blockers = (await blockersByStaff()).get("Celine Torres") ?? [];
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/CPR \/ First Aid expired/i);
  });

  it("does not block staff whose only gap is a requirement never started", async () => {
    // Ray Romero is newly hired: licence on file, several gating requirements
    // never started. Outstanding for activation, but nothing has LAPSED, so no
    // claim may be blocked on his account.
    expect((await blockersByStaff()).get("Ray Romero")).toEqual([]);
    const summary = await summaryFor("Ray Romero");
    expect(summary.ready).toBe(false);
    expect(summary.outstanding.length).toBeGreaterThan(0);
  });

  it("does not block a credential merely inside its renewal window", async () => {
    // Vega's QMAP expires in 30 days — a warning, not a blocker.
    expect((await blockersByStaff()).get("Maria Vega")).toEqual([]);
  });
});

describe("evaluateUnbilledNotes carries the credential blockers through", () => {
  it("surfaces them on the notes they belong to, naming the staff member", async () => {
    const readiness = await evaluateUnbilledNotes();
    expect(readiness.length).toBeGreaterThan(0);

    const credentialBlockers = readiness.flatMap((r) =>
      r.blockers.filter((b) => /expired|failed|waived/i.test(b))
    );
    // Every credential blocker names the staff member it belongs to.
    for (const b of credentialBlockers) {
      expect(b).toMatch(/^(Lesley Martinez|Celine Torres) — /);
    }
  });

  it("leaves a note claim-ready when its only credential issue is a warning", async () => {
    const readiness = await evaluateUnbilledNotes();
    const vegaNotes = readiness.filter((r) => r.note.staff_name === "Maria Vega");
    for (const r of vegaNotes) {
      expect(r.blockers.filter((b) => /QMAP/i.test(b))).toEqual([]);
    }
  });
});
