-- ═══════════════════════════════════════════════════════════════════════
-- seed.sql — DETERMINISTIC SYNTHETIC DATA. No PHI. Safe for any environment.
--
-- Mirrors lib/data/demo/dataset.ts (the in-app demo dataset) — same fixed
-- UUIDs and names, so a Supabase-backed environment demos identically to
-- demo mode. Dates are relative to current_date so the demo week is always
-- "this week".
--
-- Run AFTER migrations + policies:  psql ... -f supabase/seed.sql
-- Demo password for every seeded user: Demo1234!
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── auth.users (local/dev pattern; on hosted Supabase create via dashboard
--    with matching UUIDs, or run with service-role privileges) ───────────
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'ksandoval@durablelifeskills.com'),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'talvarez@durablelifeskills.com'),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'mvega@durablelifeskills.com'),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'dprice@durablelifeskills.com'),
      ('00000000-0000-4000-a000-000000000005'::uuid, 'lmartinez@durablelifeskills.com'),
      ('00000000-0000-4000-a000-000000000006'::uuid, 'ctorres@durablelifeskills.com'),
      ('00000000-0000-4000-a000-000000000007'::uuid, 'rromero@durablelifeskills.com')
    ) as t(id, email)
  loop
    begin
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                              email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                              created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
              u.email, crypt('Demo1234!', gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', '{}', now(), now())
      on conflict (id) do nothing;
    exception when others then
      raise notice 'auth.users seed skipped for % (%). Create the user manually with this UUID.', u.email, sqlerrm;
    end;
  end loop;
end $$;

-- ── users (staff profiles) ───────────────────────────────────────────────
insert into users (id, email, full_name, role, status, license_number, license_expiration_date, training_completed) values
  ('00000000-0000-4000-a000-000000000001', 'ksandoval@durablelifeskills.com', 'K. Sandoval',     'Admin',       'Active', null, null, '[]'),
  ('00000000-0000-4000-a000-000000000002', 'talvarez@durablelifeskills.com',  'T. Alvarez',      'Scheduler',   'Active', null, null, '[]'),
  ('00000000-0000-4000-a000-000000000003', 'mvega@durablelifeskills.com',     'Maria Vega',      'Field_Staff', 'Active', 'CO-DSP-20419', (current_date + 240)::date,
    jsonb_build_array(
      jsonb_build_object('course','QMAP Medication Administration','completed_on',(current_date - 335)::text,'expires_on',(current_date + 30)::text,'required',true),
      jsonb_build_object('course','CPR / First Aid','completed_on',(current_date - 200)::text,'expires_on',(current_date + 530)::text,'required',true),
      jsonb_build_object('course','Abuse & Neglect Prevention','completed_on',(current_date - 100)::text,'expires_on',(current_date + 265)::text,'required',true)
    )),
  ('00000000-0000-4000-a000-000000000004', 'dprice@durablelifeskills.com',    'Devon Price',     'Field_Staff', 'Active', 'CO-DSP-20573', (current_date + 400)::date,
    jsonb_build_array(
      jsonb_build_object('course','QMAP Medication Administration','completed_on',(current_date - 120)::text,'expires_on',(current_date + 245)::text,'required',true),
      jsonb_build_object('course','CPR / First Aid','completed_on',(current_date - 90)::text,'expires_on',(current_date + 640)::text,'required',true)
    )),
  ('00000000-0000-4000-a000-000000000005', 'lmartinez@durablelifeskills.com', 'Lesley Martinez', 'Field_Staff', 'Active', 'CO-DSP-19822', (current_date - 21)::date, -- EXPIRED → claim blocker
    jsonb_build_array(
      jsonb_build_object('course','QMAP Medication Administration','completed_on',(current_date - 300)::text,'expires_on',(current_date + 65)::text,'required',true)
    )),
  ('00000000-0000-4000-a000-000000000006', 'ctorres@durablelifeskills.com',   'Celine Torres',   'Field_Staff', 'Active', 'CO-DSP-21044', (current_date + 500)::date,
    jsonb_build_array(
      jsonb_build_object('course','CPR / First Aid','completed_on',(current_date - 400)::text,'expires_on',(current_date - 35)::text,'required',true) -- EXPIRED training
    )),
  ('00000000-0000-4000-a000-000000000007', 'rromero@durablelifeskills.com',   'Ray Romero',      'Field_Staff', 'Active', 'CO-DSP-21377', (current_date + 320)::date, '[]')
on conflict (id) do nothing;

-- ── clients ──────────────────────────────────────────────────────────────
-- residence_gps: synthetic points around Greeley, CO. point(lat, lng).
insert into clients (id, first_name, last_name, medicaid_id, date_of_birth, active_diagnoses,
                     insurance_provider, service_plan_start, service_plan_end,
                     authorized_scc_hours_per_week, authorized_nmt_trips_per_week,
                     authorized_jc_hours_per_week, authorized_dh_hours_per_week, authorized_ei_hours_per_week,
                     case_manager_name, ccb_name, residence_gps) values
  ('00000000-0000-4000-b000-000000000001', 'Alma', 'Reyes', 'CO4481920', '1998-03-14',
   '[{"code":"F71","description":"Moderate intellectual disability"}]',
   'Health First Colorado', (current_date - 180)::date, (current_date + 185)::date,
   10, 2, 0, 0, 0, 'S. Whitcomb', 'Envision', point(40.4233, -104.7091)),
  ('00000000-0000-4000-b000-000000000002', 'Ben', 'Okafor', 'CO5510283', '1995-07-02',
   '[{"code":"F84.0","description":"Autism spectrum disorder"}]',
   'Health First Colorado', (current_date - 90)::date, (current_date + 275)::date,
   0, 0, 8, 0, 0, 'J. Paulsen', 'Envision', point(40.4102, -104.6980)),
  ('00000000-0000-4000-b000-000000000003', 'Cora', 'Whitfield', 'CO6120944', '2001-11-23',
   '[{"code":"F72","description":"Severe intellectual disability"},{"code":"G40.909","description":"Epilepsy, unspecified"}]',
   'Health First Colorado', (current_date - 200)::date, (current_date + 165)::date,
   12, 0, 0, 4, 0, 'S. Whitcomb', 'Envision', point(40.4318, -104.7205)),
  ('00000000-0000-4000-b000-000000000004', 'Dev', 'Ramírez', 'CO7093315', '1999-01-30',
   '[{"code":"F70","description":"Mild intellectual disability"}]',
   'Health First Colorado', (current_date - 60)::date, (current_date + 305)::date,
   8, 1, 0, 0, 0, 'J. Paulsen', 'Foothills Gateway', point(40.4175, -104.7322)),
  -- Noah has an EXPIRED plan + order → demos the schedule red flag & QA "expired ITD authorization"
  ('00000000-0000-4000-b000-000000000005', 'Noah', 'Tran', 'CO8120117', '2000-05-11',
   '[{"code":"F71","description":"Moderate intellectual disability"}]',
   'Health First Colorado', (current_date - 400)::date, (current_date - 10)::date,
   6, 0, 0, 0, 0, 'J. Paulsen', 'Envision', point(40.4051, -104.7133))
on conflict (id) do nothing;

-- ── physician orders ─────────────────────────────────────────────────────
insert into physician_orders (id, client_id, order_number, ordering_physician, order_type, effective_date, expiration_date) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 'PO-2026-0141', 'Dr. H. Okonkwo', 'Standing', (current_date - 180)::date, (current_date + 185)::date),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', 'PO-2026-0177', 'Dr. L. Fischer', 'Standing', (current_date - 90)::date,  (current_date + 275)::date),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000003', 'PO-2026-0102', 'Dr. H. Okonkwo', 'Standing', (current_date - 200)::date, (current_date + 165)::date),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000004', 'PO-2026-0198', 'Dr. P. Marsh',   'Standing', (current_date - 60)::date,  (current_date + 305)::date),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000005', 'PO-2025-0871', 'Dr. L. Fischer', 'Standing', (current_date - 400)::date, (current_date - 10)::date) -- EXPIRED
on conflict (id) do nothing;

-- ── visits (this week, agency-local times stored as UTC) ────────────────
-- monday := the Monday of the current week.
do $$
declare
  monday date := (current_date - ((extract(dow from current_date)::int + 6) % 7))::date;
  tz text := fn_agency_tz();
  vega uuid := '00000000-0000-4000-a000-000000000003';
  price uuid := '00000000-0000-4000-a000-000000000004';
  martinez uuid := '00000000-0000-4000-a000-000000000005';
  reyes uuid := '00000000-0000-4000-b000-000000000001';
  okafor uuid := '00000000-0000-4000-b000-000000000002';
  whitfield uuid := '00000000-0000-4000-b000-000000000003';
  ramirez uuid := '00000000-0000-4000-b000-000000000004';
begin
  insert into visits (id, client_id, staff_id, visit_type, scheduled_start, scheduled_end, physician_order_id, status) values
    -- Monday (Vega): Reyes 9–11 SCC (completed), Okafor 1–3 JC, Whitfield 4–5:30 SCC
    ('00000000-0000-4000-d000-000000000001', reyes, vega, 'SCC',
      (monday::text || ' 09:00')::timestamp at time zone tz, (monday::text || ' 11:00')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000001', 'Completed'),
    ('00000000-0000-4000-d000-000000000002', okafor, vega, 'Job_Coaching',
      (monday::text || ' 13:00')::timestamp at time zone tz, (monday::text || ' 15:00')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000002', 'Scheduled'),
    ('00000000-0000-4000-d000-000000000003', whitfield, vega, 'SCC',
      (monday::text || ' 16:00')::timestamp at time zone tz, (monday::text || ' 17:30')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000003', 'Scheduled'),
    -- Wednesday (Vega): Whitfield 10–11:30 SCC
    ('00000000-0000-4000-d000-000000000004', whitfield, vega, 'SCC',
      ((monday + 2)::text || ' 10:00')::timestamp at time zone tz, ((monday + 2)::text || ' 11:30')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000003', 'Scheduled'),
    -- Monday (Price): Ramírez 9:30–11 SCC (completed)
    ('00000000-0000-4000-d000-000000000005', ramirez, price, 'SCC',
      (monday::text || ' 09:30')::timestamp at time zone tz, (monday::text || ' 11:00')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000004', 'Completed'),
    -- Thursday (Price): Reyes 2–4 SCC
    ('00000000-0000-4000-d000-000000000006', reyes, price, 'SCC',
      ((monday + 3)::text || ' 14:00')::timestamp at time zone tz, ((monday + 3)::text || ' 16:00')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000001', 'Scheduled'),
    -- Last week (Martinez → Whitfield): completed, but Martinez's license is expired → claim blocker
    ('00000000-0000-4000-d000-000000000007', whitfield, martinez, 'SCC',
      ((monday - 6)::text || ' 10:00')::timestamp at time zone tz, ((monday - 6)::text || ' 12:30')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000003', 'Completed'),
    -- Last week (Vega → Okafor): completed JC, note missing client signature
    ('00000000-0000-4000-d000-000000000008', okafor, vega, 'Job_Coaching',
      ((monday - 5)::text || ' 13:00')::timestamp at time zone tz, ((monday - 5)::text || ' 14:30')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000002', 'Completed'),
    -- Last week (Vega → Reyes): completed, claim-ready
    ('00000000-0000-4000-d000-000000000009', reyes, vega, 'SCC',
      ((monday - 4)::text || ' 09:00')::timestamp at time zone tz, ((monday - 4)::text || ' 11:00')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000001', 'Completed'),
    -- Last week (Price → Ramírez): completed, claim-ready
    ('00000000-0000-4000-d000-000000000010', ramirez, price, 'SCC',
      ((monday - 3)::text || ' 10:00')::timestamp at time zone tz, ((monday - 3)::text || ' 11:15')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000004', 'Completed'),
    -- Tuesday + Friday coverage so the Today screen demos well on any weekday
    ('00000000-0000-4000-d000-000000000011', ramirez, vega, 'SCC',
      ((monday + 1)::text || ' 13:00')::timestamp at time zone tz, ((monday + 1)::text || ' 14:30')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000004', 'Scheduled'),
    ('00000000-0000-4000-d000-000000000012', okafor, vega, 'Job_Coaching',
      ((monday + 1)::text || ' 09:30')::timestamp at time zone tz, ((monday + 1)::text || ' 11:30')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000002', 'Scheduled'),
    ('00000000-0000-4000-d000-000000000013', whitfield, price, 'SCC',
      ((monday + 4)::text || ' 10:00')::timestamp at time zone tz, ((monday + 4)::text || ' 11:30')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000003', 'Scheduled'),
    ('00000000-0000-4000-d000-000000000014', reyes, vega, 'SCC',
      ((monday + 4)::text || ' 14:00')::timestamp at time zone tz, ((monday + 4)::text || ' 16:00')::timestamp at time zone tz,
      '00000000-0000-4000-c000-000000000001', 'Scheduled')
  on conflict (id) do nothing;

  -- ── EVV logs for completed visits ──────────────────────────────────────
  insert into evv_logs (id, visit_id, clock_in_time, clock_out_time, clock_in_gps, clock_out_gps, verification_method, offline_locked) values
    ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
      (monday::text || ' 09:01')::timestamp at time zone tz, (monday::text || ' 11:03')::timestamp at time zone tz,
      point(40.42335, -104.70915), point(40.42331, -104.70909), 'GPS', true),
    ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-d000-000000000005',
      (monday::text || ' 09:32')::timestamp at time zone tz, (monday::text || ' 11:02')::timestamp at time zone tz,
      point(40.41748, -104.73222), point(40.41752, -104.73218), 'GPS', true),
    ('00000000-0000-4000-e000-000000000007', '00000000-0000-4000-d000-000000000007',
      ((monday - 6)::text || ' 10:02')::timestamp at time zone tz, ((monday - 6)::text || ' 12:31')::timestamp at time zone tz,
      point(40.43182, -104.72052), point(40.43179, -104.72047), 'GPS', true),
    ('00000000-0000-4000-e000-000000000009', '00000000-0000-4000-d000-000000000009',
      ((monday - 4)::text || ' 09:00')::timestamp at time zone tz, ((monday - 4)::text || ' 11:05')::timestamp at time zone tz,
      point(40.42338, -104.70907), point(40.42330, -104.70911), 'GPS', true),
    ('00000000-0000-4000-e000-000000000010', '00000000-0000-4000-d000-000000000010',
      ((monday - 3)::text || ' 10:01')::timestamp at time zone tz, ((monday - 3)::text || ' 11:14')::timestamp at time zone tz,
      point(40.41750, -104.73219), point(40.41747, -104.73224), 'GPS', true)
  on conflict (id) do nothing;
  -- NOTE: visit d008 (Okafor JC) is Completed WITHOUT an EVV log → QA flag demo.

  -- ── progress notes ────────────────────────────────────────────────────
  insert into progress_notes (id, visit_id, client_id, staff_id, date, start_time, end_time,
                              specific_services_provided, caregiver_signature_data, client_signature_data,
                              client_redirection_logged, goals_addressed) values
    -- Claim-READY: Reyes, Vega (both signatures, license fine)
    ('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-d000-000000000009', reyes, vega,
      (monday - 4)::date, '09:00', '11:05',
      'Community connection: grocery shopping at King Soopers; practiced budgeting with a $40 limit; client selected items independently and used self-checkout with verbal prompting.',
      'data:image/png;base64,SEED-SIG', 'data:image/png;base64,SEED-SIG', false,
      '[{"goal":"Community integration","progress":"Navigated store independently"},{"goal":"Independent living skills","progress":"Budget kept within limit"}]'),
    -- BLOCKED: Okafor, Vega — missing CLIENT signature
    ('00000000-0000-4000-f000-000000000008', '00000000-0000-4000-d000-000000000008', okafor, vega,
      (monday - 5)::date, '13:00', '14:30',
      'Job coaching at Goodwill: practiced greeting customers and restocking; supervisor check-in completed.',
      'data:image/png;base64,SEED-SIG', null, false,
      '[{"goal":"Communication","progress":"Greeted 5 customers with prompting"}]'),
    -- BLOCKED: Whitfield, Martinez — staff license expired
    ('00000000-0000-4000-f000-000000000007', '00000000-0000-4000-d000-000000000007', whitfield, martinez,
      (monday - 6)::date, '10:00', '12:30',
      'Community outing to the library; client selected sensory-friendly reading room; practiced checkout interaction.',
      'data:image/png;base64,SEED-SIG', 'data:image/png;base64,SEED-SIG', true,
      '[{"goal":"Community integration","progress":"Tolerated 2 hours in community setting"}]'),
    -- Claim-READY: Ramírez, Price
    ('00000000-0000-4000-f000-000000000010', '00000000-0000-4000-d000-000000000010', ramirez, price,
      (monday - 3)::date, '10:00', '11:15',
      'SCC: bus-route training to work site; client swiped pass and signaled stop independently.',
      'data:image/png;base64,SEED-SIG', 'data:image/png;base64,SEED-SIG', false,
      '[{"goal":"Self-advocacy","progress":"Asked driver for route confirmation"}]'),
    -- Today''s completed morning visit (Reyes, Vega) — fresh note, both signatures
    ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-d000-000000000001', reyes, vega,
      monday, '09:00', '11:03',
      'Morning SCC: pharmacy pickup and post office; practiced waiting in line and payment interaction.',
      'data:image/png;base64,SEED-SIG', 'data:image/png;base64,SEED-SIG', false,
      '[{"goal":"Community integration","progress":"Completed both errands"}]')
  on conflict (id) do nothing;

  -- Job-coaching detail for the Okafor note (DVR supported employment)
  insert into job_coaching_logs (id, progress_note_id, employer_name, job_title, supervisor_name, supervisor_phone,
                                 milestone_number, job_duties_completed, upc_rotation_prompted, employer_contact_count,
                                 dvr_authorization_number, dvr_cumulative_hours) values
    ('00000000-0000-4000-f100-000000000008', '00000000-0000-4000-f000-000000000008',
     'Goodwill of Northern Colorado', 'Retail Associate', 'M. Sisneros', '970-555-0142',
     2, 'Customer greeting; restocking; register shadowing', true, 2, 'DVR-2026-3315', 42.5)
  on conflict (id) do nothing;

  -- ── NMT trips (Reyes: 1 of 2 used this week) ───────────────────────────
  insert into nmt_trips (id, visit_id, client_id, staff_id, trip_date, destination, purpose, miles) values
    ('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-d000-000000000001', reyes, vega,
     monday, 'Goodwill, Michaels', 'Errands + community access', 6.2)
  on conflict (id) do nothing;

  -- ── Medication logs (eMAR) ─────────────────────────────────────────────
  insert into medication_logs (id, client_id, medication_name, dosage, route, scheduled_time, administered_time, administered_by, status, notes) values
    -- Today, pending action (Missed until acted on)
    ('00000000-0000-4000-f300-000000000001', reyes, 'Sertraline', '50 mg', 'Oral',
      (current_date::text || ' 08:00')::timestamp at time zone tz, null, null, 'Missed', null),
    ('00000000-0000-4000-f300-000000000002', ramirez, 'Levetiracetam', '500 mg', 'Oral',
      (current_date::text || ' 09:00')::timestamp at time zone tz, null, null, 'Missed', null),
    -- Yesterday: administered — but NO EVV overlap → QA flag demo
    ('00000000-0000-4000-f300-000000000003', whitfield, 'Lamotrigine', '100 mg', 'Oral',
      ((current_date - 1)::text || ' 08:00')::timestamp at time zone tz,
      ((current_date - 1)::text || ' 08:10')::timestamp at time zone tz,
      martinez, 'Administered', null),
    -- Yesterday: refused
    ('00000000-0000-4000-f300-000000000004', reyes, 'Sertraline', '50 mg', 'Oral',
      ((current_date - 1)::text || ' 08:00')::timestamp at time zone tz, null, vega, 'Refused', 'Client declined; will retry per plan.')
  on conflict (id) do nothing;

  -- ── Timesheets: Vega has an open route record for this week ────────────
  insert into timesheets (id, staff_id, period_start, period_end, status) values
    ('00000000-0000-4000-f400-000000000001', vega, monday, (monday + 6)::date, 'open')
  on conflict (id) do nothing;
  insert into timesheet_entries (id, timesheet_id, work_date, service_code, client_id, start_time, end_time, hours, source, source_id) values
    ('00000000-0000-4000-f500-000000000001', '00000000-0000-4000-f400-000000000001',
      monday, 'SCC', reyes, '09:01', '11:03', 2.0, 'evv', '00000000-0000-4000-e000-000000000001'),
    ('00000000-0000-4000-f500-000000000002', '00000000-0000-4000-f400-000000000001',
      monday, 'T', reyes, null, null, 0.5, 'nmt', '00000000-0000-4000-f200-000000000001')
  on conflict (id) do nothing;

  -- ── Payroll period: previous two-week period, paydate 13 days after end ─
  insert into payroll_periods (id, period_start, period_end, paydate, status) values
    ('00000000-0000-4000-f600-000000000001',
      (monday - 21)::date, (monday - 8)::date, (monday + 5)::date, 'open')
  on conflict (period_start) do nothing;

  -- ── Prior-period route records (payroll transmittal demo). Torres stays
  --    unsubmitted → payroll "all notes in?" = No, submission blocked. ─────
  declare
    payroll_row record;
    week_idx int;
    week_hours numeric;
    remaining numeric;
    day_offset int;
    ts_id uuid;
  begin
    for payroll_row in
      select * from (values
        ('00000000-0000-4000-a000-000000000003'::uuid, 40.25, 37.25, true),  -- Vega
        ('00000000-0000-4000-a000-000000000004'::uuid, 36.5,  44.25, true),  -- Price
        ('00000000-0000-4000-a000-000000000005'::uuid, 42.5,  45.5,  true),  -- Martinez
        ('00000000-0000-4000-a000-000000000006'::uuid, 4.25,  14,    false), -- Torres (notes NOT in)
        ('00000000-0000-4000-a000-000000000007'::uuid, 36.5,  19.5,  true)   -- Romero
      ) as t(staff_id, wk1, wk2, submitted)
    loop
      for week_idx in 0..1 loop
        week_hours := case when week_idx = 0 then payroll_row.wk1 else payroll_row.wk2 end;
        ts_id := uuid_generate_v4();
        insert into timesheets (id, staff_id, period_start, period_end, status, submitted_at)
        values (ts_id, payroll_row.staff_id,
                (monday - 21 + week_idx * 7)::date, (monday - 15 + week_idx * 7)::date,
                case when payroll_row.submitted then 'submitted' else 'open' end,
                case when payroll_row.submitted then (monday - 15 + week_idx * 7)::timestamptz else null end)
        on conflict (staff_id, period_start) do nothing;

        remaining := week_hours;
        day_offset := 0;
        while remaining > 0 and day_offset < 7 loop
          insert into timesheet_entries (timesheet_id, work_date, service_code, hours, source, notes)
          values (ts_id, (monday - 21 + week_idx * 7 + day_offset)::date, 'SCC',
                  least(8, remaining), 'manual', 'seeded aggregate');
          remaining := remaining - least(8, remaining);
          day_offset := day_offset + 1;
        end loop;
      end loop;
    end loop;
  end;
end $$;

-- ── Fee schedule (SYNTHETIC placeholder rates — replace with the client's
--    real Colorado Medicaid fee schedule before any live billing) ─────────
insert into fee_schedule (id, payer, visit_type, procedure_code, modifier, rate_per_unit, effective_date) values
  ('00000000-0000-4000-f700-000000000001', 'COLORADO_MEDICAID', 'SCC',                'T2021', null, 15.50, '2026-01-01'),
  ('00000000-0000-4000-f700-000000000002', 'COLORADO_MEDICAID', 'Job_Coaching',       'H2023', null, 18.25, '2026-01-01'),
  ('00000000-0000-4000-f700-000000000003', 'COLORADO_MEDICAID', 'Day_Habilitation',   'T2021', 'HQ', 12.75, '2026-01-01'),
  ('00000000-0000-4000-f700-000000000004', 'COLORADO_MEDICAID', 'Early_Intervention', 'T1027', null, 21.00, '2026-01-01')
on conflict (id) do nothing;

-- ── Relias course catalog ────────────────────────────────────────────────
insert into relias_courses (id, code, name, required, renewal_months) values
  ('00000000-0000-4000-f800-000000000001', 'QMAP',  'QMAP Medication Administration', true, 12),
  ('00000000-0000-4000-f800-000000000002', 'CPR',   'CPR / First Aid',                true, 24),
  ('00000000-0000-4000-f800-000000000003', 'ANP',   'Abuse & Neglect Prevention',     true, 12),
  ('00000000-0000-4000-f800-000000000004', 'HIPAA', 'HIPAA Privacy & Security',       true, 12),
  ('00000000-0000-4000-f800-000000000005', 'PCP',   'Person-Centered Planning',       false, null)
on conflict (id) do nothing;

-- ── Menu configuration defaults ──────────────────────────────────────────
-- Billing/Payroll/Staff/Settings stay Admin-only regardless of this table.
insert into menu_config (role, sections) values
  ('Scheduler',   '{"CORE": true, "COMPLIANCE": true, "BUSINESS": true, "TRAINING": true, "SYSTEM": false}'),
  ('Field_Staff', '{"CORE": true, "COMPLIANCE": false, "BUSINESS": false, "TRAINING": true, "SYSTEM": false}')
on conflict (role) do nothing;
