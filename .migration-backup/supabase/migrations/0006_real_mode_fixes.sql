-- ═══════════════════════════════════════════════════════════════════════
-- 0006_real_mode_fixes.sql
-- Defects from the launch-readiness review (docs/review/) that only show
-- against a real Postgres — demo mode never exercised these paths.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Route-record rows never appended in real mode ───────────────────
-- appendTimesheetEntry upserts with ON CONFLICT (source, source_id). A
-- PARTIAL unique index cannot be inferred without its predicate (42P10),
-- and PostgREST never sends one, so every clock-out / NMT append failed and
-- the failure was discarded. A plain unique index keeps the guarantee:
-- manual rows carry NULL source_id and NULLs are distinct, so they never
-- conflict with each other.
drop index if exists uq_ts_entries_source;
create unique index uq_ts_entries_source on timesheet_entries (source, source_id);

-- ── 2. eMAR "Missed" rejected by RLS ────────────────────────────────────
-- The field UPDATE policy's WITH CHECK required administered_by = auth.uid(),
-- but a Missed record has no administrator. Source of truth is
-- policies/06_medication_logs.sql; this ALTER brings databases that applied
-- the policies before 0006 in line (no-op on a fresh install, where the
-- policy file runs after the migrations).
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'medication_logs' and policyname = 'meds_field_update'
  ) then
    execute $p$
      alter policy meds_field_update on medication_logs
        with check (
          fn_is_field_staff()
          and (status = 'Missed' or administered_by = auth.uid())
          and fn_client_assigned_to_me(client_id)
        )
    $p$;
  end if;
end $$;

-- ── 3. GPS clock-in/out could never be recorded ─────────────────────────
-- fn_enforce_evv_geofence compared `old.clock_in_gps is distinct from
-- new.clock_in_gps`. Postgres has no `=` operator for `point` (only `~=`),
-- so planning the trigger body raised "operator does not exist: point =
-- point" on EVERY insert/update of a GPS log for a client with a residence
-- on file — the geofence never ran and no GPS EVV record could be saved in
-- real mode (demo mode mirrors the rule in TypeScript and never hit this).
-- Compare the textual form instead: null-safe and exact.
create or replace function fn_enforce_evv_geofence() returns trigger
language plpgsql as $$
declare
  v_residence point;
  radius numeric;
  d numeric;
begin
  -- GPS-verified logs only; Telephony and (admin) Manual have their own rules.
  if new.verification_method <> 'GPS' then return new; end if;

  select c.residence_gps into v_residence
  from visits v join clients c on c.id = v.client_id
  where v.id = new.visit_id;
  if v_residence is null then return new; end if; -- no registered residence → cannot fence

  radius := fn_setting_numeric('evv_geofence_radius_m', 150);

  -- point is stored as (lat, lng) → point[0] = lat, point[1] = lng
  if new.clock_in_gps is not null
     and (tg_op = 'INSERT' or old.clock_in_gps::text is distinct from new.clock_in_gps::text) then
    d := fn_haversine_m(new.clock_in_gps[0], new.clock_in_gps[1], v_residence[0], v_residence[1]);
    new.clock_in_distance_m := round(d::numeric, 1);
    if d > radius then
      raise exception 'EVV_GEOFENCE: clock-in % m from client residence exceeds % m', round(d), radius;
    end if;
  end if;

  if new.clock_out_gps is not null
     and (tg_op = 'INSERT' or old.clock_out_gps::text is distinct from new.clock_out_gps::text) then
    d := fn_haversine_m(new.clock_out_gps[0], new.clock_out_gps[1], v_residence[0], v_residence[1]);
    new.clock_out_distance_m := round(d::numeric, 1);
    if d > radius then
      raise exception 'EVV_GEOFENCE: clock-out % m from client residence exceeds % m', round(d), radius;
    end if;
  end if;

  return new;
end $$;
