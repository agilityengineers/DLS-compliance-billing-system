-- ═══ 00_helpers.sql — RLS helper functions + enable RLS everywhere ═══
-- Applied before per-table policy files.

-- Current staff role, bypassing RLS on users (security definer).
create or replace function fn_current_role() returns text
language sql security definer stable as $$
  select role from public.users where id = auth.uid() and status = 'Active';
$$;

create or replace function fn_is_admin() returns boolean
language sql stable as $$ select fn_current_role() = 'Admin' $$;

create or replace function fn_is_scheduler() returns boolean
language sql stable as $$ select fn_current_role() = 'Scheduler' $$;

create or replace function fn_is_field_staff() returns boolean
language sql stable as $$ select fn_current_role() = 'Field_Staff' $$;

-- Is this client assigned to the current field staff member via any visit?
create or replace function fn_client_assigned_to_me(p_client_id uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.visits v
    where v.client_id = p_client_id and v.staff_id = auth.uid()
  );
$$;

-- Enable RLS on EVERY table. No permissive defaults anywhere.
alter table users              enable row level security;
alter table clients            enable row level security;
alter table visits             enable row level security;
alter table evv_logs           enable row level security;
alter table progress_notes     enable row level security;
alter table job_coaching_logs  enable row level security;
alter table medication_logs    enable row level security;
alter table audit_trails       enable row level security;
