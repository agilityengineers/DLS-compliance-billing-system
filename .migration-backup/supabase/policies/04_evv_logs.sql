-- ═══ 04_evv_logs.sql ═══

create policy evv_admin_all on evv_logs for all using (fn_is_admin()) with check (fn_is_admin());

-- Scheduler: read-only.
create policy evv_scheduler_select on evv_logs for select using (fn_is_scheduler());

-- Field_Staff: logs for THEIR visits only. Two hardening rules vs the
-- original scaffold policies:
--   1. WITH CHECK re-asserts visit ownership (previously a field user could
--      repoint visit_id at another staff member's visit on update).
--   2. verification_method='Manual' is Admin-only AT THE DATABASE — the
--      manual-adjustment path must not be reachable from a field session.
create policy evv_field_select on evv_logs for select
  using (fn_is_field_staff() and exists (
    select 1 from visits v where v.id = visit_id and v.staff_id = auth.uid()));

create policy evv_field_insert on evv_logs for insert
  with check (
    fn_is_field_staff()
    and verification_method <> 'Manual'
    and exists (select 1 from visits v where v.id = visit_id and v.staff_id = auth.uid()));

create policy evv_field_update on evv_logs for update
  using (fn_is_field_staff() and offline_locked = false and exists (
    select 1 from visits v where v.id = visit_id and v.staff_id = auth.uid()))
  with check (
    fn_is_field_staff()
    and verification_method <> 'Manual'
    and exists (select 1 from visits v where v.id = visit_id and v.staff_id = auth.uid()));
