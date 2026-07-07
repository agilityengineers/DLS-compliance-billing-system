-- ═══ 04_evv_logs.sql ═══

create policy evv_admin_all on evv_logs for all using (fn_is_admin()) with check (fn_is_admin());

-- Scheduler: read-only.
create policy evv_scheduler_select on evv_logs for select using (fn_is_scheduler());

-- Field_Staff: write-only on logs for THEIR visits (insert + update open logs).
-- No select policy for field staff beyond their own visits' logs — they may
-- read logs for their visits so the UI can show clock state.
create policy evv_field_select on evv_logs for select
  using (fn_is_field_staff() and exists (
    select 1 from visits v where v.id = visit_id and v.staff_id = auth.uid()));
create policy evv_field_insert on evv_logs for insert
  with check (fn_is_field_staff() and exists (
    select 1 from visits v where v.id = visit_id and v.staff_id = auth.uid()));
create policy evv_field_update on evv_logs for update
  using (fn_is_field_staff() and offline_locked = false and exists (
    select 1 from visits v where v.id = visit_id and v.staff_id = auth.uid()))
  with check (fn_is_field_staff());
-- Field staff may NOT use verification_method='Manual' — admin-only path,
-- enforced by the server action in app/api + the DB CHECK on reason.
