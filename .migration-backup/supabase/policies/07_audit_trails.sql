-- ═══ 07_audit_trails.sql ═══
-- Written only by the security-definer trigger. Admin read-only via API.
-- No INSERT/UPDATE/DELETE policies for any role: the trigger bypasses RLS
-- (security definer), and nobody may tamper with audit rows.

create policy audit_admin_select on audit_trails for select using (fn_is_admin());
