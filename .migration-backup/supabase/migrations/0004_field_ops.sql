-- ═══════════════════════════════════════════════════════════════════════
-- 0004_field_ops.sql
-- NMT trips (with DB-enforced weekly cap), progress-note completion fields,
-- field document uploads, timesheets/route records, and user preferences.
-- ═══════════════════════════════════════════════════════════════════════

-- ── NMT trips — Business Rule #5, server-enforced ───────────────────────
create table nmt_trips (
  id uuid primary key default uuid_generate_v4(),
  visit_id uuid references visits(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  staff_id uuid not null references users(id) on delete restrict,
  trip_date date not null,
  destination text not null,
  purpose text,
  miles numeric(6,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_nmt_trips_client_date on nmt_trips(client_id, trip_date);
create trigger trg_nmt_trips_audit after insert or update or delete on nmt_trips
  for each row execute function fn_audit_row_change();
create trigger trg_nmt_trips_updated_at before update on nmt_trips
  for each row execute function fn_set_updated_at();

-- Per-CLIENT weekly authorization (clients.authorized_nmt_trips_per_week —
-- NOT a global "2"): block the write when the week's allowance is exhausted.
-- Week runs Sunday–Saturday in the agency timezone.
create or replace function fn_enforce_nmt_weekly_cap() returns trigger
language plpgsql as $$
declare
  authorized int;
  used int;
  week_start date;
  week_end date;
begin
  select authorized_nmt_trips_per_week into authorized
    from clients where id = new.client_id;
  if authorized is null or authorized <= 0 then
    raise exception 'NMT_NOT_AUTHORIZED: client has no NMT trip authorization';
  end if;

  week_start := new.trip_date - extract(dow from new.trip_date)::int; -- Sunday
  week_end := week_start + 6;

  select count(*) into used from nmt_trips
   where client_id = new.client_id
     and trip_date between week_start and week_end
     and (tg_op = 'INSERT' or id <> new.id);

  if used + 1 > authorized then
    raise exception 'NMT_AUTHORIZATION_EXHAUSTED: % of % weekly trips already used for this client',
      used, authorized;
  end if;
  return new;
end $$;

drop trigger if exists trg_nmt_weekly_cap on nmt_trips;
create trigger trg_nmt_weekly_cap
  before insert or update on nmt_trips
  for each row execute function fn_enforce_nmt_weekly_cap();

-- ── Progress-note completion fields ─────────────────────────────────────
alter table progress_notes add column cancellation_reason text;
-- DVR supported-employment panel additions (auth # + cumulative hours)
alter table job_coaching_logs add column dvr_authorization_number text;
alter table job_coaching_logs add column dvr_cumulative_hours numeric(6,2);

-- ── Documents (field uploads → S3; agency docs; DVR notices; monthly) ──
create table documents (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('field_upload','dvr_notice','monthly_billing_note','dvr_monthly_report','agency')),
  client_id uuid references clients(id) on delete restrict,
  visit_id uuid references visits(id) on delete set null,
  uploaded_by uuid references users(id),
  file_name text not null,
  content_type text,
  size_bytes bigint,
  storage_provider text not null default 's3' check (storage_provider in ('s3','drive','demo')),
  storage_key text,
  status text not null default 'uploading' check (status in ('uploading','synced','error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_documents_client on documents(client_id);
create index idx_documents_kind on documents(kind);
create trigger trg_documents_audit after insert or update or delete on documents
  for each row execute function fn_audit_row_change();
create trigger trg_documents_updated_at before update on documents
  for each row execute function fn_set_updated_at();

-- ── Timesheets (route record) ───────────────────────────────────────────
create table timesheets (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid not null references users(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, period_start),
  check (period_end >= period_start)
);
create trigger trg_timesheets_audit after insert or update or delete on timesheets
  for each row execute function fn_audit_row_change();
create trigger trg_timesheets_updated_at before update on timesheets
  for each row execute function fn_set_updated_at();

-- Route-record rows appended from EVV clock-outs and NMT trips (codes:
-- SCC / JC / DH / T per the client's paper form).
create table timesheet_entries (
  id uuid primary key default uuid_generate_v4(),
  timesheet_id uuid not null references timesheets(id) on delete cascade,
  work_date date not null,
  service_code text not null check (service_code in ('SCC','JC','DH','T')),
  client_id uuid references clients(id) on delete restrict,
  start_time time,
  end_time time,
  hours numeric(5,2) not null default 0,
  source text not null default 'manual' check (source in ('evv','nmt','manual')),
  source_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ts_entries_sheet on timesheet_entries(timesheet_id);
create unique index uq_ts_entries_source on timesheet_entries(source, source_id) where source_id is not null;
create trigger trg_ts_entries_audit after insert or update or delete on timesheet_entries
  for each row execute function fn_audit_row_change();
create trigger trg_ts_entries_updated_at before update on timesheet_entries
  for each row execute function fn_set_updated_at();

-- ── User preferences (field home style: Visits default / Dashboard) ────
create table user_prefs (
  user_id uuid primary key references users(id) on delete cascade,
  field_home text not null default 'visits' check (field_home in ('visits','dashboard')),
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger trg_user_prefs_updated_at before update on user_prefs
  for each row execute function fn_set_updated_at();
