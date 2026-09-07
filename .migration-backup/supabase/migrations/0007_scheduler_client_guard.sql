-- ═══════════════════════════════════════════════════════════════════════
-- 0007_scheduler_client_guard.sql
-- Review finding #23 (docs/review/): Schedulers hold a blanket row-level
-- UPDATE on clients (policies/02_clients.sql) and Postgres RLS cannot
-- restrict columns, so a Scheduler session talking to PostgREST directly
-- could rewrite a Medicaid ID, a diagnosis list or a residence. This
-- BEFORE UPDATE trigger enforces the column split the policy always
-- promised: Schedulers change scheduling and authorization fields only;
-- identity, clinical and location columns are Admin-only.
--
-- Scheduler-editable: service_plan_start/end, authorized_*_per_week,
--   case_manager_name, ccb_name (updated_at is trigger-maintained).
-- Admin-only:         first_name, last_name, medicaid_id, date_of_birth,
--   active_diagnoses, insurance_provider, residence_gps.
-- INSERT is untouched: intake (Admin or Scheduler) needs the identity fields.
-- The app has no client-update path yet (roadmap 2.1); when it lands, the
-- demo store must mirror this rule with the same RLS_DENIED text.
--
-- Depends on fn_is_scheduler() from policies/00_helpers.sql, which is
-- applied after the migrations; PL/pgSQL resolves the call at run time.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function fn_clients_scheduler_column_guard() returns trigger
language plpgsql as $$
begin
  -- fn_is_scheduler() is NULL for sessions without auth.uid() (migrations,
  -- seed, service role): NULL means "not a scheduler", never "block".
  if not coalesce(fn_is_scheduler(), false) then return new; end if;

  if new.first_name            is distinct from old.first_name
     or new.last_name          is distinct from old.last_name
     or new.medicaid_id        is distinct from old.medicaid_id
     or new.date_of_birth      is distinct from old.date_of_birth
     or new.active_diagnoses   is distinct from old.active_diagnoses
     or new.insurance_provider is distinct from old.insurance_provider
     -- point has no equality operator; compare the textual form (see 0006 §3)
     or new.residence_gps::text is distinct from old.residence_gps::text then
    raise exception 'RLS_DENIED: schedulers may only edit scheduling fields (service plan window, weekly authorizations, case manager, CCB)';
  end if;
  return new;
end $$;

drop trigger if exists trg_clients_scheduler_column_guard on clients;
create trigger trg_clients_scheduler_column_guard
  before update on clients
  for each row execute function fn_clients_scheduler_column_guard();