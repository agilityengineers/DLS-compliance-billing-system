-- ═══════════════════════════════════════════════════════════════════════
-- DLS-CMS 0001_init.sql — core schema
-- RLS policies live in supabase/policies/*.sql (applied after this file).
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── updated_at trigger ────────────────────────────────────────────────
create or replace function fn_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ═══ users (staff) ═══════════════════════════════════════════════════
-- Passwords live in Supabase Auth (auth.users). This table is the app
-- profile keyed to auth.users.id.
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('Admin','Scheduler','Field_Staff')),
  status text not null default 'Active' check (status in ('Active','Suspended')),
  license_number text,
  license_expiration_date date,
  training_completed jsonb not null default '[]'::jsonb,
  -- shape: [{ "course": "CPR", "completed_on": "2026-01-10", "expires_on": "2028-01-10" }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_users_role on users(role);

-- ═══ clients ═════════════════════════════════════════════════════════
create table clients (
  id uuid primary key default uuid_generate_v4(),
  first_name text not null,
  last_name text not null,
  medicaid_id text not null unique,
  date_of_birth date not null,
  active_diagnoses jsonb not null default '[]'::jsonb,
  insurance_provider text,
  service_plan_start date,
  service_plan_end date,
  authorized_scc_hours_per_week numeric(5,2) not null default 0,
  authorized_nmt_trips_per_week int not null default 0,
  residence_gps point,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_plan_end is null or service_plan_start is null or service_plan_end >= service_plan_start)
);
create index idx_clients_medicaid_id on clients(medicaid_id);
create index idx_clients_last_name on clients(last_name);

-- NOTE: age(date_of_birth) is not IMMUTABLE (depends on current_date), so
-- Postgres forbids it as a stored GENERATED column. `calculated_age` is
-- exposed via this view instead; the app reads v_clients.
create view v_clients as
select c.*, date_part('year', age(c.date_of_birth))::int as calculated_age
from clients c;

-- ═══ visits ══════════════════════════════════════════════════════════
create table visits (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete restrict,
  staff_id uuid not null references users(id) on delete restrict,
  visit_type text not null check (visit_type in ('SCC','Job_Coaching','Day_Habilitation','Early_Intervention')),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  active_physician_order_id text,   -- required by scheduling server action; nullable at DDL level for drafts
  status text not null default 'Scheduled' check (status in ('Scheduled','In_Progress','Completed','Cancelled','Billed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index idx_visits_client_id on visits(client_id);
create index idx_visits_staff_id on visits(staff_id);
create index idx_visits_scheduled_start on visits(scheduled_start);

-- ═══ evv_logs ════════════════════════════════════════════════════════
create table evv_logs (
  id uuid primary key default uuid_generate_v4(),
  visit_id uuid not null references visits(id) on delete restrict,
  clock_in_time timestamptz,
  clock_out_time timestamptz,
  clock_in_gps point,
  clock_out_gps point,
  verification_method text not null check (verification_method in ('GPS','Telephony','Manual')),
  offline_locked boolean not null default false,
  manual_adjustment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Manual entries MUST carry a reason (also enforced in UI + server action)
  check (verification_method <> 'Manual' or (manual_adjustment_reason is not null and length(trim(manual_adjustment_reason)) > 0)),
  check (clock_out_time is null or clock_in_time is null or clock_out_time > clock_in_time)
);
create index idx_evv_logs_visit_id on evv_logs(visit_id);

-- ═══ progress_notes ══════════════════════════════════════════════════
create table progress_notes (
  id uuid primary key default uuid_generate_v4(),
  visit_id uuid not null references visits(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  staff_id uuid not null references users(id) on delete restrict,
  date date not null,
  start_time time not null,
  end_time time not null,
  -- Billable hours: raw elapsed time, immutable expression → legal generated column.
  calculated_billable_hours numeric generated always as (
    extract(epoch from (end_time - start_time)) / 3600.0
  ) stored,
  -- Billing units: 15 min = 1 unit, CMS 8-minute rounding rule:
  -- floor(minutes/15) + 1 more unit if the remainder ≥ 8 minutes.
  calculated_billing_units int generated always as (
    floor(extract(epoch from (end_time - start_time)) / 900.0)::int
    + case when mod(floor(extract(epoch from (end_time - start_time)) / 60.0)::int, 15) >= 8 then 1 else 0 end
  ) stored,
  specific_services_provided text,
  caregiver_signature_data text,   -- base64 PNG data URL
  client_signature_data text,
  client_redirection_logged boolean not null default false,
  goals_addressed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index idx_progress_notes_visit_id on progress_notes(visit_id);
create index idx_progress_notes_client_id on progress_notes(client_id);
create index idx_progress_notes_staff_id on progress_notes(staff_id);
create index idx_progress_notes_date on progress_notes(date);

-- ═══ job_coaching_logs ═══════════════════════════════════════════════
create table job_coaching_logs (
  id uuid primary key default uuid_generate_v4(),
  progress_note_id uuid not null references progress_notes(id) on delete cascade,
  employer_name text not null,
  job_title text,
  supervisor_name text,
  supervisor_phone text,
  milestone_number int check (milestone_number between 1 and 3),
  job_duties_completed text,
  upc_rotation_prompted boolean not null default false,
  employer_contact_count int not null default 0 check (employer_contact_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_job_coaching_logs_note_id on job_coaching_logs(progress_note_id);

-- ═══ medication_logs (eMAR) ══════════════════════════════════════════
create table medication_logs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete restrict,
  medication_name text not null,
  dosage text not null,
  route text not null,
  scheduled_time timestamptz not null,
  administered_time timestamptz,
  administered_by uuid references users(id),
  status text not null default 'Missed' check (status in ('Administered','Refused','Missed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'Administered' or administered_time is not null)
);
create index idx_medication_logs_client_id on medication_logs(client_id);
create index idx_medication_logs_scheduled_time on medication_logs(scheduled_time);

-- ═══ audit_trails ════════════════════════════════════════════════════
create table audit_trails (
  id uuid primary key default uuid_generate_v4(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  performed_by uuid,           -- auth.uid(); nullable for service-role jobs
  "timestamp" timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb
);
create index idx_audit_trails_table_record on audit_trails(table_name, record_id);
create index idx_audit_trails_performed_by on audit_trails(performed_by);

-- ── Generic audit trigger ─────────────────────────────────────────────
create or replace function fn_audit_row_change() returns trigger
language plpgsql security definer as $$
declare
  rec_id uuid;
begin
  rec_id := coalesce(
    case when tg_op = 'DELETE' then (to_jsonb(old)->>'id')::uuid
         else (to_jsonb(new)->>'id')::uuid end, null);
  insert into audit_trails (table_name, record_id, action, performed_by, old_values, new_values)
  values (
    tg_table_name,
    rec_id,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- Attach audit + updated_at triggers to every PHI-bearing table
do $$
declare t text;
begin
  foreach t in array array['users','clients','visits','evv_logs','progress_notes','job_coaching_logs','medication_logs']
  loop
    execute format('create trigger trg_%s_audit after insert or update or delete on %I for each row execute function fn_audit_row_change()', t, t);
    execute format('create trigger trg_%s_updated_at before update on %I for each row execute function fn_set_updated_at()', t, t);
  end loop;
end $$;
