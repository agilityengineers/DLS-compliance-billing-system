-- ═══ 03_visits.sql ═══

create policy visits_admin_all on visits for all using (fn_is_admin()) with check (fn_is_admin());

-- Scheduler: full read/write on visits.
create policy visits_scheduler_select on visits for select using (fn_is_scheduler());
create policy visits_scheduler_insert on visits for insert with check (fn_is_scheduler());
create policy visits_scheduler_update on visits for update using (fn_is_scheduler()) with check (fn_is_scheduler());
create policy visits_scheduler_delete on visits for delete using (fn_is_scheduler());

-- Field_Staff: read own visits; may update status of own visits (clock flow).
create policy visits_field_select on visits for select
  using (fn_is_field_staff() and staff_id = auth.uid());
create policy visits_field_update on visits for update
  using (fn_is_field_staff() and staff_id = auth.uid())
  with check (fn_is_field_staff() and staff_id = auth.uid());
