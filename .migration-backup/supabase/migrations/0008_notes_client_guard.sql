-- ═══════════════════════════════════════════════════════════════════════
-- 0008_notes_client_guard.sql
-- Review finding #19: the field INSERT/UPDATE policies on progress_notes
-- checked only staff_id = auth.uid(). A field session could therefore file
-- a note for ANY client_id, against a visit belonging to someone else, as
-- long as it named itself as staff. A note is billing evidence, so the row
-- must agree with its visit: the visit is the caller's and the note's
-- client_id is the visit's client.
--
-- Source of truth is policies/05_progress_notes.sql; this ALTER brings
-- databases that applied the policies before 0008 in line (no-op on a fresh
-- install, where the policy file runs after the migrations).
-- ═══════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'progress_notes' and policyname = 'notes_field_insert'
  ) then
    execute $p$
      alter policy notes_field_insert on progress_notes
        with check (
          fn_is_field_staff() and staff_id = auth.uid()
          and exists (select 1 from visits v
                      where v.id = progress_notes.visit_id and v.staff_id = auth.uid()
                        and v.client_id = progress_notes.client_id))
    $p$;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'progress_notes' and policyname = 'notes_field_update'
  ) then
    execute $p$
      alter policy notes_field_update on progress_notes
        using (fn_is_field_staff() and staff_id = auth.uid())
        with check (
          fn_is_field_staff() and staff_id = auth.uid()
          and exists (select 1 from visits v
                      where v.id = progress_notes.visit_id and v.staff_id = auth.uid()
                        and v.client_id = progress_notes.client_id))
    $p$;
  end if;
end $$;