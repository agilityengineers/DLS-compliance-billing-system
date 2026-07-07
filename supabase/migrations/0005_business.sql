-- ═══════════════════════════════════════════════════════════════════════
-- 0005_business.sql
-- Fee schedule, claim exports (837P ledger), payroll, menu configuration,
-- Relias LMS, incidents, notifications, QA resolutions.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Fee schedule (replaces the hardcoded placeholder rate) ──────────────
create table fee_schedule (
  id uuid primary key default uuid_generate_v4(),
  payer text not null default 'COLORADO_MEDICAID',
  visit_type text not null check (visit_type in ('SCC','Job_Coaching','Day_Habilitation','Early_Intervention')),
  procedure_code text not null,
  modifier text,
  rate_per_unit numeric(8,2) not null,
  effective_date date not null,
  end_date date,
  unique (payer, visit_type, effective_date)
);
create trigger trg_fee_schedule_audit after insert or update or delete on fee_schedule
  for each row execute function fn_audit_row_change();

-- ── Claim exports — every 837P export is persisted + audited ────────────
create sequence claim_control_number_seq start 1000;
create table claim_exports (
  id uuid primary key default uuid_generate_v4(),
  exported_by uuid references users(id),
  exported_at timestamptz not null default now(),
  format text not null default '837P',
  payer text not null default 'COLORADO_MEDICAID',
  control_number bigint not null default nextval('claim_control_number_seq'),
  note_ids uuid[] not null,
  total_units int not null default 0,
  total_charge numeric(10,2) not null default 0,
  file_content text
);
create trigger trg_claim_exports_audit after insert or update or delete on claim_exports
  for each row execute function fn_audit_row_change();

-- Billed marker on notes (set when included in an export)
alter table progress_notes add column billed_at timestamptz;
alter table progress_notes add column claim_export_id uuid references claim_exports(id);

-- ── Payroll transmittal ─────────────────────────────────────────────────
create table payroll_periods (
  id uuid primary key default uuid_generate_v4(),
  period_start date not null unique, -- two-week period
  period_end date not null,
  paydate date not null,
  status text not null default 'open' check (status in ('open','submitted')),
  certified_by uuid references users(id),
  certified_at timestamptz,
  snapshot jsonb, -- per-employee lines frozen at submission
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);
create trigger trg_payroll_periods_audit after insert or update or delete on payroll_periods
  for each row execute function fn_audit_row_change();
create trigger trg_payroll_periods_updated_at before update on payroll_periods
  for each row execute function fn_set_updated_at();

-- ── Menu configuration (Settings → per-role section visibility) ────────
-- Billing, Payroll, Staff & credentials, and Settings are ALWAYS Admin-only;
-- the app refuses to enable them for other roles regardless of this table.
create table menu_config (
  role text primary key check (role in ('Scheduler','Field_Staff')),
  sections jsonb not null, -- e.g. {"CORE": true, "COMPLIANCE": false, ...}
  updated_at timestamptz not null default now()
);
create trigger trg_menu_config_updated_at before update on menu_config
  for each row execute function fn_set_updated_at();

-- ── Relias LMS ──────────────────────────────────────────────────────────
create table relias_courses (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  required boolean not null default false,
  renewal_months int, -- null = one-time
  created_at timestamptz not null default now()
);
create table relias_completions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references relias_courses(id) on delete cascade,
  completed_on date not null,
  expires_on date,
  source text not null default 'api' check (source in ('api','manual','sso')),
  synced_at timestamptz not null default now(),
  unique (user_id, course_id, completed_on)
);
create index idx_relias_completions_user on relias_completions(user_id);
create trigger trg_relias_completions_audit after insert or update or delete on relias_completions
  for each row execute function fn_audit_row_change();
create table relias_sync_runs (
  id uuid primary key default uuid_generate_v4(),
  ran_at timestamptz not null default now(),
  status text not null check (status in ('success','error','skipped')),
  detail text
);

-- ── Incident reporting (abuse/neglect & critical incidents) ────────────
create table incidents (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete restrict,
  reported_by uuid not null references users(id),
  incident_type text not null check (incident_type in ('abuse_neglect','critical','medication_error','injury','other')),
  occurred_at timestamptz not null,
  description text not null,
  immediate_action text,
  status text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_incidents_audit after insert or update or delete on incidents
  for each row execute function fn_audit_row_change();
create trigger trg_incidents_updated_at before update on incidents
  for each row execute function fn_set_updated_at();

-- ── Notification log (SendGrid credential-expiry warnings, dedupe) ─────
create table notification_log (
  id uuid primary key default uuid_generate_v4(),
  kind text not null, -- e.g. 'credential_expiry_30d'
  user_id uuid references users(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  dedupe_key text not null unique, -- e.g. 'credential_expiry_30d:user:QMAP:2026-08-01'
  sent_at timestamptz not null default now()
);

-- ── QA flag resolutions ─────────────────────────────────────────────────
-- Flags are computed from data; resolving one records who/why here.
create table qa_resolutions (
  id uuid primary key default uuid_generate_v4(),
  flag_key text not null unique, -- deterministic, e.g. 'med-no-evv:<med_log_id>'
  resolved_by uuid not null references users(id),
  resolution_note text not null,
  resolved_at timestamptz not null default now()
);
create trigger trg_qa_resolutions_audit after insert or update or delete on qa_resolutions
  for each row execute function fn_audit_row_change();
