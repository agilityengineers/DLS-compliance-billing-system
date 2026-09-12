// lib/db/src/seed/requirements.ts — install the default registry.
//
// Runs on every deploy, so it must be safe to run against a live agency's
// database. The rule is: WE OWN THE DESCRIPTION, THEY OWN THE POLICY.
//
//   refreshed on re-seed  — label, category, note, source, applies_to,
//                           renews_months, vendor, automated, sort_order, and
//                           the authority citation and URL
//   never touched again   — `required` and `gating` (the admin's toggles) and
//                           any sign-off an agency has recorded
//
// So shipping a corrected citation reaches everyone, while an agency that
// turned a requirement off, or had counsel confirm one, keeps that decision.
import { DEFAULT_REQUIREMENTS, type Requirement } from "@workspace/credentialing";

/** Minimal query surface — satisfied by node-postgres, Drizzle and pglite. */
export type SqlExecutor = (sql: string, params: unknown[]) => Promise<unknown>;

const COLUMNS = [
  "id", "label", "category", "required", "gating", "automated", "vendor",
  "applies_to", "renews_months", "source", "note", "sort_order",
  "authority_citation", "authority_url", "verification_status",
  "verified_on", "verified_by", "verification_note"
];

function values(r: Requirement): unknown[] {
  return [
    r.id, r.label, r.category, r.required, r.gating, r.automated, r.vendor,
    JSON.stringify(r.appliesTo), r.renewsMonths, JSON.stringify(r.source), r.note, r.sortOrder,
    r.authorityCitation, r.authorityUrl, r.verificationStatus,
    r.verifiedOn, r.verifiedBy, r.verificationNote
  ];
}

const INSERT = `
  INSERT INTO requirements (${COLUMNS.join(", ")})
  VALUES (${COLUMNS.map((_, i) => `$${i + 1}`).join(", ")})
  ON CONFLICT (id) DO UPDATE SET
    label              = EXCLUDED.label,
    category           = EXCLUDED.category,
    automated          = EXCLUDED.automated,
    vendor             = EXCLUDED.vendor,
    applies_to         = EXCLUDED.applies_to,
    renews_months      = EXCLUDED.renews_months,
    source             = EXCLUDED.source,
    note               = EXCLUDED.note,
    sort_order         = EXCLUDED.sort_order,
    authority_citation = EXCLUDED.authority_citation,
    authority_url      = EXCLUDED.authority_url,
    -- Only re-state our own verification wording while the agency has not
    -- signed the row off. Once someone confirms it, their record stands.
    verification_status = CASE
      WHEN requirements.verification_status = 'confirmed' THEN requirements.verification_status
      ELSE EXCLUDED.verification_status END,
    verification_note  = CASE
      WHEN requirements.verification_status = 'confirmed' THEN requirements.verification_note
      ELSE EXCLUDED.verification_note END,
    updated_at         = now()
`;

export interface SeedResult {
  seeded: number;
}

/**
 * Upsert the shipped registry.
 *
 * `requirements` defaults to DEFAULT_REQUIREMENTS; pass a list to seed a test
 * fixture instead.
 */
export async function seedRequirements(
  exec: SqlExecutor,
  requirements: Requirement[] = DEFAULT_REQUIREMENTS
): Promise<SeedResult> {
  for (const r of requirements) {
    await exec(INSERT, values(r));
  }
  return { seeded: requirements.length };
}
