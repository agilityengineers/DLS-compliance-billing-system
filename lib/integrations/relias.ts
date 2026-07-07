// lib/integrations/relias.ts — Relias LMS adapter (SSO deep link + nightly
// completion sync; the API is the primary path per DECISIONS.md).
// The transport is mocked until credentials + BAA exist
// (PRODUCTION-READINESS.md §4.6); the interface and sync flow are real.
import "server-only";
import { isDemoMode } from "@/lib/demo/mode";
import { assertBaaGate } from "./hipaaGate";
import { addReliasCompletion, listReliasCourses } from "@/lib/data/repo-business";
import { listUsers } from "@/lib/data/repo-core";
import type { AuditContext } from "@/lib/data/demo/store";

/** SSO deep link (service-provider settings pending with Relias support). */
export function getReliasSsoUrl(userEmail: string): string {
  const base = process.env.RELIAS_SSO_BASE_URL ?? "https://login.reliaslearning.com";
  return `${base}/sso?email=${encodeURIComponent(userEmail)}&org=durablelifeskills`;
}

export interface ReliasCompletionRecord {
  userEmail: string;
  courseCode: string;
  completedOn: string; // ISO date
  expiresOn: string | null;
}

export interface ReliasAdapter {
  /** Pull completions since `sinceIso` from the Relias API. */
  fetchCompletions(sinceIso: string): Promise<ReliasCompletionRecord[]>;
}

class MockReliasAdapter implements ReliasAdapter {
  async fetchCompletions(): Promise<ReliasCompletionRecord[]> {
    // DEMO: pretend one field-staff member finished HIPAA training overnight.
    return [
      {
        userEmail: "rromero@durablelifeskills.com",
        courseCode: "HIPAA",
        completedOn: new Date().toISOString().slice(0, 10),
        expiresOn: null
      }
    ];
  }
}

class ApiReliasAdapter implements ReliasAdapter {
  async fetchCompletions(sinceIso: string): Promise<ReliasCompletionRecord[]> {
    assertBaaGate("Relias");
    const base = process.env.RELIAS_API_BASE_URL;
    const key = process.env.RELIAS_API_KEY;
    if (!base || !key) throw new Error("Relias API not configured (RELIAS_API_BASE_URL / RELIAS_API_KEY).");
    const res = await fetch(`${base}/v1/completions?since=${encodeURIComponent(sinceIso)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`Relias API ${res.status}`);
    // Field mapping TODO: confirm the payload shape against the Relias API
    // contract during integration certification.
    return (await res.json()) as ReliasCompletionRecord[];
  }
}

export function getReliasAdapter(): ReliasAdapter {
  if (isDemoMode() || !process.env.RELIAS_API_BASE_URL) return new MockReliasAdapter();
  return new ApiReliasAdapter();
}

/**
 * Nightly completion sync (invoke from a scheduled job / cron route):
 * pulls completions, matches users by email + courses by code, and records
 * them — which updates Staff & credentials and clears/creates claim blockers.
 */
export async function runReliasCompletionSync(ctx: AuditContext): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const adapter = getReliasAdapter();
  const since = new Date(Date.now() - 36 * 3600_000).toISOString().slice(0, 10);
  const [records, users, courses] = await Promise.all([
    adapter.fetchCompletions(since),
    listUsers(),
    listReliasCourses()
  ]);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const rec of records) {
    const user = users.find((u) => u.email.toLowerCase() === rec.userEmail.toLowerCase());
    const course = courses.find((c) => c.code === rec.courseCode);
    if (!user || !course) {
      skipped++;
      continue;
    }
    const expiresOn =
      rec.expiresOn ??
      (course.renewal_months
        ? new Date(new Date(rec.completedOn).setMonth(new Date(rec.completedOn).getMonth() + course.renewal_months))
            .toISOString()
            .slice(0, 10)
        : null);
    const res = await addReliasCompletion(
      { user_id: user.id, course_id: course.id, completed_on: rec.completedOn, expires_on: expiresOn, source: "api" },
      ctx
    );
    if (res.ok) imported++;
    else errors.push(res.error ?? "unknown");
  }
  return { imported, skipped, errors };
}
