-- ═══ 01_users.sql ═══
-- Admin: full access. Everyone: may read own row (needed for role lookup UI).

create policy users_admin_select on users for select using (fn_is_admin() or id = auth.uid());
create policy users_admin_insert on users for insert with check (fn_is_admin());
create policy users_admin_update on users for update using (fn_is_admin()) with check (fn_is_admin());
create policy users_admin_delete on users for delete using (fn_is_admin());

-- Schedulers need staff names/licenses to schedule (read-only).
create policy users_scheduler_select on users for select using (fn_is_scheduler());
