-- ═══════════════════════════════════════════════════════════════════════
-- 0002_security_hardening.sql
-- Fixes security defects found in the scaffold audit + adds the
-- impersonation audit spine. See PRODUCTION-READINESS.md.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. v_clients leaked PHI past RLS ───────────────────────────────────
-- The view ran as owner (bypassing RLS) — any authenticated user could read
-- every client. security_invoker makes the querying user's RLS apply.
alter view v_clients set (security_invoker = on);

-- ── 2. App settings (server-enforced rule parameters) ──────────────────
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('evv_geofence_radius_m', '150'),
  ('agency_timezone', '"America/Denver"')
on conflict (key) do nothing;

create or replace function fn_setting_numeric(p_key text, p_default numeric)
returns numeric language sql stable as $$
  select coalesce((select (value #>> '{}')::numeric from app_settings where key = p_key), p_default);
$$;

create or replace function fn_agency_tz() returns text language sql stable as $$
  select coalesce((select value #>> '{}' from app_settings where key = 'agency_timezone'), 'America/Denver');
$$;

-- ── 3. Impersonation audit spine ────────────────────────────────────────
-- Requirement (client priority): every action performed while impersonating
-- is logged under the ADMIN's real identity with the impersonated user
-- recorded. The impersonation token keeps sub = admin (so auth.uid() stays
-- the admin) and carries an "impersonating" claim read here.
alter table audit_trails add column if not exists impersonating uuid;
create index if not exists idx_audit_trails_impersonating on audit_trails(impersonating);

create or replace function fn_jwt_impersonating() returns uuid
language plpgsql stable as $$
declare claim text;
begin
  begin
    claim := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'impersonating';
  exception when others then
    claim := null;
  end;
  return claim::uuid;
exception when others then
  return null;
end $$;

create or replace function fn_audit_row_change() returns trigger
language plpgsql security definer as $$
declare
  rec_id uuid;
begin
  rec_id := coalesce(
    case when tg_op = 'DELETE' then (to_jsonb(old)->>'id')::uuid
         else (to_jsonb(new)->>'id')::uuid end, null);
  insert into audit_trails (table_name, record_id, action, performed_by, impersonating, old_values, new_values)
  values (
    tg_table_name,
    rec_id,
    tg_op,
    auth.uid(),
    fn_jwt_impersonating(),
    -- Signature images are PHI-heavy blobs; store a marker, not the bytes.
    case when tg_op in ('UPDATE','DELETE') then fn_audit_redact(to_jsonb(old)) end,
    case when tg_op in ('INSERT','UPDATE') then fn_audit_redact(to_jsonb(new)) end
  );
  return coalesce(new, old);
end $$;

-- ── 4. Redact signature blobs from audit payloads ──────────────────────
-- Full base64 signatures in old_values/new_values doubled PHI-at-rest and
-- grew the audit table unboundedly. Presence is auditable; bytes are not.
create or replace function fn_audit_redact(payload jsonb) returns jsonb
language sql immutable as $$
  select case when payload is null then null else
    payload
      || case when payload ? 'client_signature_data' and payload->>'client_signature_data' is not null
              then jsonb_build_object('client_signature_data', '[signature captured]') else '{}'::jsonb end
      || case when payload ? 'caregiver_signature_data' and payload->>'caregiver_signature_data' is not null
              then jsonb_build_object('caregiver_signature_data', '[signature captured]') else '{}'::jsonb end
  end;
$$;

-- ── 5. EVV integrity ────────────────────────────────────────────────────
-- 5a. One OPEN log per visit (no duplicate clock-ins racing offline sync).
create unique index if not exists uq_evv_open_per_visit
  on evv_logs (visit_id) where clock_out_time is null;

-- 5b. Server-side geofence enforcement (150 m default, app_settings-tunable).
-- The client pre-checks for UX; THIS is the enforcement point — offline-
-- authored writes sync straight into Postgres, so the rule lives here.
alter table evv_logs add column if not exists clock_in_distance_m numeric;
alter table evv_logs add column if not exists clock_out_distance_m numeric;

create or replace function fn_haversine_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision language sql immutable as $$
  select 2 * 6371000 * asin( least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

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
     and (tg_op = 'INSERT' or old.clock_in_gps is distinct from new.clock_in_gps) then
    d := fn_haversine_m(new.clock_in_gps[0], new.clock_in_gps[1], v_residence[0], v_residence[1]);
    new.clock_in_distance_m := round(d::numeric, 1);
    if d > radius then
      raise exception 'EVV_GEOFENCE: clock-in % m from client residence exceeds % m', round(d), radius;
    end if;
  end if;

  if new.clock_out_gps is not null
     and (tg_op = 'INSERT' or old.clock_out_gps is distinct from new.clock_out_gps) then
    d := fn_haversine_m(new.clock_out_gps[0], new.clock_out_gps[1], v_residence[0], v_residence[1]);
    new.clock_out_distance_m := round(d::numeric, 1);
    if d > radius then
      raise exception 'EVV_GEOFENCE: clock-out % m from client residence exceeds % m', round(d), radius;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_evv_geofence on evv_logs;
create trigger trg_evv_geofence
  before insert or update on evv_logs
  for each row execute function fn_enforce_evv_geofence();
