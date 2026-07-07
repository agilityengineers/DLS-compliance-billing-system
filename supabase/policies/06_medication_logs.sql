-- ═══ 06_medication_logs.sql ═══

create policy meds_admin_all on medication_logs for all using (fn_is_admin()) with check (fn_is_admin());

-- Scheduler: read-only.
create policy meds_scheduler_select on medication_logs for select using (fn_is_scheduler());

-- Field_Staff: read logs for assigned clients (to see the shift's med list);
-- write only rows they administer.
create policy meds_field_select on medication_logs for select
  using (fn_is_field_staff() and fn_client_assigned_to_me(client_id));
create policy meds_field_insert on medication_logs for insert
  with check (fn_is_field_staff() and administered_by = auth.uid() and fn_client_assigned_to_me(client_id));
create policy meds_field_update on medication_logs for update
  using (fn_is_field_staff() and fn_client_assigned_to_me(client_id))
  with check (fn_is_field_staff() and administered_by = auth.uid());
