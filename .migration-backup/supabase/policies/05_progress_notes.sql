-- ═══ 05_progress_notes.sql ═══

create policy notes_admin_all on progress_notes for all using (fn_is_admin()) with check (fn_is_admin());

-- Scheduler: read-only.
create policy notes_scheduler_select on progress_notes for select using (fn_is_scheduler());

-- Field_Staff: write where staff_id = auth.uid(); read own notes (draft editing).
-- WITH CHECK also requires the note to AGREE WITH ITS VISIT: the visit is the
-- caller's and the note's client_id is the visit's client. A note is billing
-- evidence; without this a field session could file a note for any client
-- (review #19). Migration 0008 applies the same change to existing databases.
create policy notes_field_select on progress_notes for select
  using (fn_is_field_staff() and staff_id = auth.uid());
create policy notes_field_insert on progress_notes for insert
  with check (
    fn_is_field_staff() and staff_id = auth.uid()
    and exists (select 1 from visits v
                where v.id = progress_notes.visit_id and v.staff_id = auth.uid()
                  and v.client_id = progress_notes.client_id));
create policy notes_field_update on progress_notes for update
  using (fn_is_field_staff() and staff_id = auth.uid())
  with check (
    fn_is_field_staff() and staff_id = auth.uid()
    and exists (select 1 from visits v
                where v.id = progress_notes.visit_id and v.staff_id = auth.uid()
                  and v.client_id = progress_notes.client_id));

-- ═══ job_coaching_logs (child of progress_notes — same matrix) ═══
create policy jcl_admin_all on job_coaching_logs for all using (fn_is_admin()) with check (fn_is_admin());
create policy jcl_scheduler_select on job_coaching_logs for select using (fn_is_scheduler());
create policy jcl_field_select on job_coaching_logs for select
  using (fn_is_field_staff() and exists (
    select 1 from progress_notes n where n.id = progress_note_id and n.staff_id = auth.uid()));
create policy jcl_field_insert on job_coaching_logs for insert
  with check (fn_is_field_staff() and exists (
    select 1 from progress_notes n where n.id = progress_note_id and n.staff_id = auth.uid()));
-- WITH CHECK re-asserts note ownership (previously a field user could repoint
-- progress_note_id at another staff member's note).
create policy jcl_field_update on job_coaching_logs for update
  using (fn_is_field_staff() and exists (
    select 1 from progress_notes n where n.id = progress_note_id and n.staff_id = auth.uid()))
  with check (fn_is_field_staff() and exists (
    select 1 from progress_notes n where n.id = progress_note_id and n.staff_id = auth.uid()));
