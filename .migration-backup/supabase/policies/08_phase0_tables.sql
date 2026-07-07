-- ═══ 08_phase0_tables.sql — RLS for tables added in migrations 0002–0005 ═══

alter table app_settings              enable row level security;
alter table physician_orders          enable row level security;
alter table recurring_visit_templates enable row level security;
alter table nmt_trips                 enable row level security;
alter table documents                 enable row level security;
alter table timesheets                enable row level security;
alter table timesheet_entries         enable row level security;
alter table user_prefs                enable row level security;
alter table fee_schedule              enable row level security;
alter table claim_exports             enable row level security;
alter table payroll_periods           enable row level security;
alter table menu_config               enable row level security;
alter table relias_courses            enable row level security;
alter table relias_completions        enable row level security;
alter table relias_sync_runs          enable row level security;
alter table incidents                 enable row level security;
alter table notification_log          enable row level security;
alter table qa_resolutions            enable row level security;

-- app_settings: everyone reads (geofence radius etc.); Admin writes.
create policy settings_select on app_settings for select using (auth.uid() is not null);
create policy settings_admin_write on app_settings for all using (fn_is_admin()) with check (fn_is_admin());

-- physician_orders: Admin full; Scheduler manages; Field reads for assigned clients.
create policy po_admin_all on physician_orders for all using (fn_is_admin()) with check (fn_is_admin());
create policy po_scheduler_select on physician_orders for select using (fn_is_scheduler());
create policy po_scheduler_insert on physician_orders for insert with check (fn_is_scheduler());
create policy po_scheduler_update on physician_orders for update using (fn_is_scheduler()) with check (fn_is_scheduler());
create policy po_field_select on physician_orders for select
  using (fn_is_field_staff() and fn_client_assigned_to_me(client_id));

-- recurring_visit_templates: Admin + Scheduler manage; Field reads own.
create policy rvt_admin_all on recurring_visit_templates for all using (fn_is_admin()) with check (fn_is_admin());
create policy rvt_scheduler_all on recurring_visit_templates for all using (fn_is_scheduler()) with check (fn_is_scheduler());
create policy rvt_field_select on recurring_visit_templates for select
  using (fn_is_field_staff() and staff_id = auth.uid());

-- nmt_trips: Admin full; Scheduler reads; Field logs trips on their own visits.
create policy nmt_admin_all on nmt_trips for all using (fn_is_admin()) with check (fn_is_admin());
create policy nmt_scheduler_select on nmt_trips for select using (fn_is_scheduler());
create policy nmt_field_select on nmt_trips for select
  using (fn_is_field_staff() and staff_id = auth.uid());
create policy nmt_field_insert on nmt_trips for insert
  with check (fn_is_field_staff() and staff_id = auth.uid() and fn_client_assigned_to_me(client_id));

-- documents: Admin full; Scheduler reads; Field reads/creates own uploads.
create policy docs_admin_all on documents for all using (fn_is_admin()) with check (fn_is_admin());
create policy docs_scheduler_select on documents for select using (fn_is_scheduler());
create policy docs_field_select on documents for select
  using (fn_is_field_staff() and uploaded_by = auth.uid());
create policy docs_field_insert on documents for insert
  with check (fn_is_field_staff() and uploaded_by = auth.uid());
create policy docs_field_update on documents for update
  using (fn_is_field_staff() and uploaded_by = auth.uid())
  with check (fn_is_field_staff() and uploaded_by = auth.uid());

-- timesheets: Admin full; Scheduler reads; Field owns theirs.
create policy ts_admin_all on timesheets for all using (fn_is_admin()) with check (fn_is_admin());
create policy ts_scheduler_select on timesheets for select using (fn_is_scheduler());
create policy ts_field_all on timesheets for all
  using (fn_is_field_staff() and staff_id = auth.uid())
  with check (fn_is_field_staff() and staff_id = auth.uid());

create policy tse_admin_all on timesheet_entries for all using (fn_is_admin()) with check (fn_is_admin());
create policy tse_scheduler_select on timesheet_entries for select using (fn_is_scheduler());
create policy tse_field_all on timesheet_entries for all
  using (fn_is_field_staff() and exists (
    select 1 from timesheets t where t.id = timesheet_id and t.staff_id = auth.uid()))
  with check (fn_is_field_staff() and exists (
    select 1 from timesheets t where t.id = timesheet_id and t.staff_id = auth.uid()));

-- user_prefs: each user owns their row; Admin may read.
create policy prefs_own_all on user_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy prefs_admin_select on user_prefs for select using (fn_is_admin());

-- fee_schedule: Admin writes; Scheduler reads (needed for billing preview).
create policy fees_admin_all on fee_schedule for all using (fn_is_admin()) with check (fn_is_admin());
create policy fees_scheduler_select on fee_schedule for select using (fn_is_scheduler());

-- claim_exports / payroll_periods: Admin-only (Billing & Payroll are Admin-only).
create policy claims_admin_all on claim_exports for all using (fn_is_admin()) with check (fn_is_admin());
create policy payroll_admin_all on payroll_periods for all using (fn_is_admin()) with check (fn_is_admin());

-- menu_config: all signed-in users read (menus adapt); Admin writes.
create policy menu_select on menu_config for select using (auth.uid() is not null);
create policy menu_admin_write on menu_config for all using (fn_is_admin()) with check (fn_is_admin());

-- Relias: courses visible to all staff; completions visible to self + Admin;
-- Admin (or the service-role nightly sync job) writes.
create policy relias_courses_select on relias_courses for select using (auth.uid() is not null);
create policy relias_courses_admin on relias_courses for all using (fn_is_admin()) with check (fn_is_admin());
create policy relias_completions_own on relias_completions for select using (user_id = auth.uid());
create policy relias_completions_admin on relias_completions for all using (fn_is_admin()) with check (fn_is_admin());
create policy relias_sync_admin on relias_sync_runs for all using (fn_is_admin()) with check (fn_is_admin());

-- incidents: Admin full; reporters see their own submissions.
create policy incidents_admin_all on incidents for all using (fn_is_admin()) with check (fn_is_admin());
create policy incidents_own_select on incidents for select using (reported_by = auth.uid());
create policy incidents_own_insert on incidents for insert with check (reported_by = auth.uid());
create policy incidents_own_update on incidents for update
  using (reported_by = auth.uid() and status = 'draft')
  with check (reported_by = auth.uid());

-- notification_log: Admin read; written by the server job (service role).
create policy notif_admin_select on notification_log for select using (fn_is_admin());

-- qa_resolutions: Admin resolves; Scheduler may read.
create policy qa_admin_all on qa_resolutions for all using (fn_is_admin()) with check (fn_is_admin());
create policy qa_scheduler_select on qa_resolutions for select using (fn_is_scheduler());
