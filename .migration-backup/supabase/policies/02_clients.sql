-- ═══ 02_clients.sql ═══

-- Admin: full read/write
create policy clients_admin_all on clients for all using (fn_is_admin()) with check (fn_is_admin());

-- Scheduler: read + write (schedule fields; column-level enforcement is done
-- in the app layer — Postgres RLS is row-level only).
create policy clients_scheduler_select on clients for select using (fn_is_scheduler());
create policy clients_scheduler_insert on clients for insert with check (fn_is_scheduler());
create policy clients_scheduler_update on clients for update using (fn_is_scheduler()) with check (fn_is_scheduler());
-- No DELETE for schedulers.

-- Field_Staff: read-only, ONLY clients on their assigned visits.
create policy clients_field_select on clients for select
  using (fn_is_field_staff() and fn_client_assigned_to_me(id));
