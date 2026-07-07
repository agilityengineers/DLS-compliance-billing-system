-- ═══════════════════════════════════════════════════════════════════════
-- 0003_scheduling_orders.sql
-- Physician orders as a real table (Business Rule #3, DB-enforced),
-- recurring visit templates, and client scheduling metadata.
-- ═══════════════════════════════════════════════════════════════════════

-- ── physician_orders ────────────────────────────────────────────────────
create table physician_orders (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete restrict,
  order_number text not null,
  ordering_physician text not null,
  order_type text not null default 'Standing',
  effective_date date not null,
  expiration_date date,
  document_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiration_date is null or expiration_date >= effective_date)
);
create index idx_physician_orders_client on physician_orders(client_id);
create trigger trg_physician_orders_audit after insert or update or delete on physician_orders
  for each row execute function fn_audit_row_change();
create trigger trg_physician_orders_updated_at before update on physician_orders
  for each row execute function fn_set_updated_at();

-- visits: FK to the real order. The legacy free-text column stays (deprecated,
-- read-only) so existing rows survive; new writes must use the FK.
alter table visits add column physician_order_id uuid references physician_orders(id);
comment on column visits.active_physician_order_id is
  'DEPRECATED free-text order ref from the scaffold — use physician_order_id.';
alter table visits add column cancellation_reason text;
create index idx_visits_physician_order on visits(physician_order_id);

-- ── Business Rule #3, server-enforced ───────────────────────────────────
-- "No visit may be saved without an active physician order." Enforced HERE
-- (not just the UI/server action) so offline-synced and direct writes obey.
create or replace function fn_visit_requires_active_order() returns trigger
language plpgsql as $$
declare
  v_date date;
begin
  if new.status = 'Cancelled' then return new; end if;
  if new.physician_order_id is null then
    raise exception 'PHYSICIAN_ORDER_REQUIRED: visits cannot be saved without an active physician order';
  end if;
  v_date := (new.scheduled_start at time zone fn_agency_tz())::date;
  perform 1 from physician_orders po
   where po.id = new.physician_order_id
     and po.client_id = new.client_id
     and po.effective_date <= v_date
     and (po.expiration_date is null or po.expiration_date >= v_date);
  if not found then
    raise exception 'PHYSICIAN_ORDER_INACTIVE: order is missing, for another client, or not active on %', v_date;
  end if;
  return new;
end $$;

drop trigger if exists trg_visits_require_order on visits;
create trigger trg_visits_require_order
  before insert or update on visits
  for each row execute function fn_visit_requires_active_order();

-- ── Recurring visits (weekly templates, per-instance overrides) ────────
create table recurring_visit_templates (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete restrict,
  staff_id uuid not null references users(id) on delete restrict,
  visit_type text not null check (visit_type in ('SCC','Job_Coaching','Day_Habilitation','Early_Intervention')),
  weekday int not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  physician_order_id uuid references physician_orders(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index idx_rvt_client on recurring_visit_templates(client_id);
create trigger trg_rvt_audit after insert or update or delete on recurring_visit_templates
  for each row execute function fn_audit_row_change();
create trigger trg_rvt_updated_at before update on recurring_visit_templates
  for each row execute function fn_set_updated_at();

-- Generated instances point back at their template (per-instance overrides =
-- editing the generated visit row; the template stays untouched).
alter table visits add column template_id uuid references recurring_visit_templates(id);

-- ── Client scheduling/authorization metadata ───────────────────────────
alter table clients add column case_manager_name text;
alter table clients add column ccb_name text; -- Community Centered Board
-- Per-service weekly authorization ceilings (hours). SCC already exists.
alter table clients add column authorized_jc_hours_per_week numeric(5,2) not null default 0;
alter table clients add column authorized_dh_hours_per_week numeric(5,2) not null default 0;
alter table clients add column authorized_ei_hours_per_week numeric(5,2) not null default 0;
