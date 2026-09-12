-- 0001_credentialing.sql — the credentialing requirements registry.
--
-- Two tables: what the agency requires (`requirements`) and who holds what
-- (`staff_credentials`). The registry is policy-as-data — `required` and
-- `gating` are admin toggles — and carries its own provenance so a compliance
-- auditor can see which rows rest on a checked citation and which do not.
--
-- Idempotent: safe to apply to a database that already has these tables.

CREATE TABLE IF NOT EXISTS requirements (
  id                  text PRIMARY KEY,
  label               text        NOT NULL,
  category            text        NOT NULL,
  required            boolean     NOT NULL DEFAULT true,
  gating              boolean     NOT NULL DEFAULT true,
  automated           boolean     NOT NULL DEFAULT false,
  vendor              text,
  applies_to          jsonb       NOT NULL,
  renews_months       integer,
  source              jsonb       NOT NULL,
  note                text        NOT NULL DEFAULT '',
  sort_order          integer     NOT NULL DEFAULT 0,

  -- Provenance: the rule this rests on, and how far it has been checked.
  authority_citation  text,
  authority_url       text,
  verification_status text        NOT NULL DEFAULT 'unverified',
  verified_on         date,
  verified_by         text,
  verification_note   text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT requirements_verification_status_check
    CHECK (verification_status IN ('confirmed', 'reported', 'agency_policy', 'unverified')),
  -- Gating is meaningless on an item nobody has to hold. The UI enforces the
  -- same pairing; the database is what makes it true.
  CONSTRAINT requirements_gating_requires_required
    CHECK (NOT gating OR required),
  -- A sign-off without a signer or a date is not a sign-off.
  CONSTRAINT requirements_confirmed_needs_signoff
    CHECK (verification_status <> 'confirmed' OR (verified_on IS NOT NULL AND verified_by IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS staff_credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid        NOT NULL,
  requirement_id text        NOT NULL REFERENCES requirements (id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'not_started',
  completed_on   date,
  -- NULL with status 'verified' means the credential does not expire.
  expires_on     date,
  note           text,
  waived_by      uuid,
  waive_reason   text,
  waived_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_staff_credential UNIQUE (staff_id, requirement_id),
  CONSTRAINT staff_credentials_status_check
    CHECK (status IN ('verified', 'in_progress', 'not_started', 'failed', 'waived')),
  -- A waiver is an accountable act: it needs a person and a reason.
  CONSTRAINT staff_credentials_waiver_needs_reason
    CHECK (status <> 'waived' OR (waived_by IS NOT NULL AND btrim(coalesce(waive_reason, '')) <> ''))
);

CREATE INDEX IF NOT EXISTS idx_staff_credentials_staff ON staff_credentials (staff_id);
CREATE INDEX IF NOT EXISTS idx_requirements_sort ON requirements (sort_order);
