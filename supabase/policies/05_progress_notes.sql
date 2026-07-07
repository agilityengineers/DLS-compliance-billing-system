-- ═══ 05_progress_notes.sql ═══

create policy notes_admin_all on progress_notes for all using (fn_is_admin()) with check (fn_is_admin());

-- Scheduler: read-only.
create policy notes_scheduler_select on progress_notes for select using (fn_is_scheduler());

-- Field_Staff: write where staff_id = auth.uid(); read own notes (draft editing).
create policy notes_field_select on progress_notes for select
  using (fn_is_field_staff() and staff_id = auth.uid());
create policy notes_field_insert on progress_notes for insert
  with check (fn_is_field_staff() and staff_id = auth.uid());
create policy notes_field_update on progress_notes for update
  using (fn_is_field_staff() and staff_id = auth.uid())
  with check (fn_is_field_staff() and staff_id = auth.uid());

-- ═══ job_coaching_logs (child of progress_notes — same matrix) ═══
create policy jcl_admin_all on job_coaching_logs for all using (fn_is_admin()) with check (fn_is_admin());
create policy jcl_scheduler_select on job_coaching_logs for select using (fn_is_scheduler());
create policy jcl_field_select on job_coaching_logs for select
  using (fn_is_field_staff() and exists (
    select 1 from progress_notes n where n.id = progress_note_id and n.staff_id = auth.uid()));
create policy jcl_field_insert on job_coaching_logs for insert
  with check (fn_is_field_staff() and exists (
    select 1 from progress_notes n where n.id = progress_note_id and n.staff_id = auth.uid()));
create policy jcl_field_update on job_coaching_logs for update
  using (fn_is_field_staff() and exists (
    select 1 from progress_notes n where n.id = progress_note_id and n.staff_id = auth.uid()))
  with check (fn_is_field_staff());
