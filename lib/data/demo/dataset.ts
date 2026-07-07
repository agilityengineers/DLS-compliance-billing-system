// lib/data/demo/dataset.ts — DETERMINISTIC SYNTHETIC DEMO DATA. No PHI.
// Mirrors supabase/seed.sql (same fixed UUIDs/names) so demo mode and a
// seeded Supabase environment demo identically. Dates are relative to the
// current week; times are timezone-naive local strings so every viewer sees
// the schedule the prototype shows (9:00 AM Monday, etc.).

import type {
  AuditRow, Client, DocumentRow, EvvLog, FeeScheduleRow, Incident,
  JobCoachingLog, MedicationLog, MenuConfigRow, NmtTrip, PayrollPeriod,
  PhysicianOrder, ProgressNote, RecurringVisitTemplate, ReliasCompletion,
  ReliasCourse, StaffUser, Timesheet, TimesheetEntry, UserPrefs, Visit
} from "@/lib/supabase/types";

// ── ids (identical to supabase/seed.sql) ─────────────────────────────────
export const UID = {
  sandoval: "00000000-0000-4000-a000-000000000001",
  alvarez: "00000000-0000-4000-a000-000000000002",
  vega: "00000000-0000-4000-a000-000000000003",
  price: "00000000-0000-4000-a000-000000000004",
  martinez: "00000000-0000-4000-a000-000000000005",
  torres: "00000000-0000-4000-a000-000000000006",
  romero: "00000000-0000-4000-a000-000000000007"
} as const;

export const CID = {
  reyes: "00000000-0000-4000-b000-000000000001",
  okafor: "00000000-0000-4000-b000-000000000002",
  whitfield: "00000000-0000-4000-b000-000000000003",
  ramirez: "00000000-0000-4000-b000-000000000004",
  tran: "00000000-0000-4000-b000-000000000005"
} as const;

// ── date helpers ─────────────────────────────────────────────────────────
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing today (local). */
export function mondayOfCurrentWeek(): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - shift);
  return d;
}

/** Sunday of the week containing `date` (authorization weeks run Sun–Sat). */
export function sundayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

function dateStr(base: Date, offsetDays: number): string {
  return isoDate(addDays(base, offsetDays));
}

/** Timezone-naive local timestamp "YYYY-MM-DDTHH:MM:00". */
function ts(base: Date, offsetDays: number, time: string): string {
  return `${dateStr(base, offsetDays)}T${time}:00`;
}

function todayStr(offsetDays = 0): string {
  return dateStr(new Date(), offsetDays);
}

// ── dataset ──────────────────────────────────────────────────────────────
export interface DemoDataset {
  users: StaffUser[];
  clients: Client[];
  physicianOrders: PhysicianOrder[];
  visits: Visit[];
  evvLogs: EvvLog[];
  progressNotes: ProgressNote[];
  jobCoachingLogs: JobCoachingLog[];
  medicationLogs: MedicationLog[];
  nmtTrips: NmtTrip[];
  documents: DocumentRow[];
  timesheets: Timesheet[];
  timesheetEntries: TimesheetEntry[];
  payrollPeriods: PayrollPeriod[];
  feeSchedule: FeeScheduleRow[];
  reliasCourses: ReliasCourse[];
  reliasCompletions: ReliasCompletion[];
  recurringTemplates: RecurringVisitTemplate[];
  menuConfig: MenuConfigRow[];
  userPrefs: UserPrefs[];
  incidents: Incident[];
  auditTrail: AuditRow[];
  appSettings: Record<string, unknown>;
}

const SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export function buildDemoDataset(): DemoDataset {
  const monday = mondayOfCurrentWeek();

  const users: StaffUser[] = [
    { id: UID.sandoval, email: "ksandoval@durablelifeskills.com", full_name: "K. Sandoval", role: "Admin", status: "Active", license_number: null, license_expiration_date: null, training_completed: [] },
    { id: UID.alvarez, email: "talvarez@durablelifeskills.com", full_name: "T. Alvarez", role: "Scheduler", status: "Active", license_number: null, license_expiration_date: null, training_completed: [] },
    {
      id: UID.vega, email: "mvega@durablelifeskills.com", full_name: "Maria Vega", role: "Field_Staff", status: "Active",
      license_number: "CO-DSP-20419", license_expiration_date: todayStr(240),
      training_completed: [
        { course: "QMAP Medication Administration", completed_on: todayStr(-335), expires_on: todayStr(30), required: true },
        { course: "CPR / First Aid", completed_on: todayStr(-200), expires_on: todayStr(530), required: true },
        { course: "Abuse & Neglect Prevention", completed_on: todayStr(-100), expires_on: todayStr(265), required: true }
      ]
    },
    {
      id: UID.price, email: "dprice@durablelifeskills.com", full_name: "Devon Price", role: "Field_Staff", status: "Active",
      license_number: "CO-DSP-20573", license_expiration_date: todayStr(400),
      training_completed: [
        { course: "QMAP Medication Administration", completed_on: todayStr(-120), expires_on: todayStr(245), required: true },
        { course: "CPR / First Aid", completed_on: todayStr(-90), expires_on: todayStr(640), required: true }
      ]
    },
    {
      // EXPIRED license → claim blocker demo
      id: UID.martinez, email: "lmartinez@durablelifeskills.com", full_name: "Lesley Martinez", role: "Field_Staff", status: "Active",
      license_number: "CO-DSP-19822", license_expiration_date: todayStr(-21),
      training_completed: [
        { course: "QMAP Medication Administration", completed_on: todayStr(-300), expires_on: todayStr(65), required: true }
      ]
    },
    {
      // EXPIRED required training → claim blocker demo
      id: UID.torres, email: "ctorres@durablelifeskills.com", full_name: "Celine Torres", role: "Field_Staff", status: "Active",
      license_number: "CO-DSP-21044", license_expiration_date: todayStr(500),
      training_completed: [
        { course: "CPR / First Aid", completed_on: todayStr(-400), expires_on: todayStr(-35), required: true }
      ]
    },
    { id: UID.romero, email: "rromero@durablelifeskills.com", full_name: "Ray Romero", role: "Field_Staff", status: "Active", license_number: "CO-DSP-21377", license_expiration_date: todayStr(320), training_completed: [] }
  ];

  const clients: Client[] = [
    {
      id: CID.reyes, first_name: "Alma", last_name: "Reyes", medicaid_id: "CO4481920", date_of_birth: "1998-03-14",
      active_diagnoses: [{ code: "F71", description: "Moderate intellectual disability" }],
      insurance_provider: "Health First Colorado", service_plan_start: todayStr(-180), service_plan_end: todayStr(185),
      authorized_scc_hours_per_week: 10, authorized_nmt_trips_per_week: 2,
      authorized_jc_hours_per_week: 0, authorized_dh_hours_per_week: 0, authorized_ei_hours_per_week: 0,
      case_manager_name: "S. Whitcomb", ccb_name: "Envision", residence_gps: { lat: 40.4233, lng: -104.7091 }
    },
    {
      id: CID.okafor, first_name: "Ben", last_name: "Okafor", medicaid_id: "CO5510283", date_of_birth: "1995-07-02",
      active_diagnoses: [{ code: "F84.0", description: "Autism spectrum disorder" }],
      insurance_provider: "Health First Colorado", service_plan_start: todayStr(-90), service_plan_end: todayStr(275),
      authorized_scc_hours_per_week: 0, authorized_nmt_trips_per_week: 0,
      authorized_jc_hours_per_week: 8, authorized_dh_hours_per_week: 0, authorized_ei_hours_per_week: 0,
      case_manager_name: "J. Paulsen", ccb_name: "Envision", residence_gps: { lat: 40.4102, lng: -104.698 }
    },
    {
      id: CID.whitfield, first_name: "Cora", last_name: "Whitfield", medicaid_id: "CO6120944", date_of_birth: "2001-11-23",
      active_diagnoses: [
        { code: "F72", description: "Severe intellectual disability" },
        { code: "G40.909", description: "Epilepsy, unspecified" }
      ],
      insurance_provider: "Health First Colorado", service_plan_start: todayStr(-200), service_plan_end: todayStr(165),
      authorized_scc_hours_per_week: 12, authorized_nmt_trips_per_week: 0,
      authorized_jc_hours_per_week: 0, authorized_dh_hours_per_week: 4, authorized_ei_hours_per_week: 0,
      case_manager_name: "S. Whitcomb", ccb_name: "Envision", residence_gps: { lat: 40.4318, lng: -104.7205 }
    },
    {
      id: CID.ramirez, first_name: "Dev", last_name: "Ramírez", medicaid_id: "CO7093315", date_of_birth: "1999-01-30",
      active_diagnoses: [{ code: "F70", description: "Mild intellectual disability" }],
      insurance_provider: "Health First Colorado", service_plan_start: todayStr(-60), service_plan_end: todayStr(305),
      authorized_scc_hours_per_week: 8, authorized_nmt_trips_per_week: 1,
      authorized_jc_hours_per_week: 0, authorized_dh_hours_per_week: 0, authorized_ei_hours_per_week: 0,
      case_manager_name: "J. Paulsen", ccb_name: "Foothills Gateway", residence_gps: { lat: 40.4175, lng: -104.7322 }
    },
    {
      // EXPIRED plan + order → schedule red flag & QA "expired ITD authorization"
      id: CID.tran, first_name: "Noah", last_name: "Tran", medicaid_id: "CO8120117", date_of_birth: "2000-05-11",
      active_diagnoses: [{ code: "F71", description: "Moderate intellectual disability" }],
      insurance_provider: "Health First Colorado", service_plan_start: todayStr(-400), service_plan_end: todayStr(-10),
      authorized_scc_hours_per_week: 6, authorized_nmt_trips_per_week: 0,
      authorized_jc_hours_per_week: 0, authorized_dh_hours_per_week: 0, authorized_ei_hours_per_week: 0,
      case_manager_name: "J. Paulsen", ccb_name: "Envision", residence_gps: { lat: 40.4051, lng: -104.7133 }
    }
  ];

  const PO = {
    reyes: "00000000-0000-4000-c000-000000000001",
    okafor: "00000000-0000-4000-c000-000000000002",
    whitfield: "00000000-0000-4000-c000-000000000003",
    ramirez: "00000000-0000-4000-c000-000000000004",
    tran: "00000000-0000-4000-c000-000000000005"
  } as const;

  const physicianOrders: PhysicianOrder[] = [
    { id: PO.reyes, client_id: CID.reyes, order_number: "PO-2026-0141", ordering_physician: "Dr. H. Okonkwo", order_type: "Standing", effective_date: todayStr(-180), expiration_date: todayStr(185), document_url: null },
    { id: PO.okafor, client_id: CID.okafor, order_number: "PO-2026-0177", ordering_physician: "Dr. L. Fischer", order_type: "Standing", effective_date: todayStr(-90), expiration_date: todayStr(275), document_url: null },
    { id: PO.whitfield, client_id: CID.whitfield, order_number: "PO-2026-0102", ordering_physician: "Dr. H. Okonkwo", order_type: "Standing", effective_date: todayStr(-200), expiration_date: todayStr(165), document_url: null },
    { id: PO.ramirez, client_id: CID.ramirez, order_number: "PO-2026-0198", ordering_physician: "Dr. P. Marsh", order_type: "Standing", effective_date: todayStr(-60), expiration_date: todayStr(305), document_url: null },
    { id: PO.tran, client_id: CID.tran, order_number: "PO-2025-0871", ordering_physician: "Dr. L. Fischer", order_type: "Standing", effective_date: todayStr(-400), expiration_date: todayStr(-10), document_url: null } // EXPIRED
  ];

  const VIS = (n: number) => `00000000-0000-4000-d000-${String(n).padStart(12, "0")}`;

  const visits: Visit[] = [
    { id: VIS(1), client_id: CID.reyes, staff_id: UID.vega, visit_type: "SCC", scheduled_start: ts(monday, 0, "09:00"), scheduled_end: ts(monday, 0, "11:00"), physician_order_id: PO.reyes, status: "Completed" },
    { id: VIS(2), client_id: CID.okafor, staff_id: UID.vega, visit_type: "Job_Coaching", scheduled_start: ts(monday, 0, "13:00"), scheduled_end: ts(monday, 0, "15:00"), physician_order_id: PO.okafor, status: "Scheduled" },
    { id: VIS(3), client_id: CID.whitfield, staff_id: UID.vega, visit_type: "SCC", scheduled_start: ts(monday, 0, "16:00"), scheduled_end: ts(monday, 0, "17:30"), physician_order_id: PO.whitfield, status: "Scheduled" },
    { id: VIS(4), client_id: CID.whitfield, staff_id: UID.vega, visit_type: "SCC", scheduled_start: ts(monday, 2, "10:00"), scheduled_end: ts(monday, 2, "11:30"), physician_order_id: PO.whitfield, status: "Scheduled" },
    { id: VIS(5), client_id: CID.ramirez, staff_id: UID.price, visit_type: "SCC", scheduled_start: ts(monday, 0, "09:30"), scheduled_end: ts(monday, 0, "11:00"), physician_order_id: PO.ramirez, status: "Completed" },
    { id: VIS(6), client_id: CID.reyes, staff_id: UID.price, visit_type: "SCC", scheduled_start: ts(monday, 3, "14:00"), scheduled_end: ts(monday, 3, "16:00"), physician_order_id: PO.reyes, status: "Scheduled" },
    { id: VIS(7), client_id: CID.whitfield, staff_id: UID.martinez, visit_type: "SCC", scheduled_start: ts(monday, -6, "10:00"), scheduled_end: ts(monday, -6, "12:30"), physician_order_id: PO.whitfield, status: "Completed" },
    { id: VIS(8), client_id: CID.okafor, staff_id: UID.vega, visit_type: "Job_Coaching", scheduled_start: ts(monday, -5, "13:00"), scheduled_end: ts(monday, -5, "14:30"), physician_order_id: PO.okafor, status: "Completed" },
    { id: VIS(9), client_id: CID.reyes, staff_id: UID.vega, visit_type: "SCC", scheduled_start: ts(monday, -4, "09:00"), scheduled_end: ts(monday, -4, "11:00"), physician_order_id: PO.reyes, status: "Completed" },
    { id: VIS(10), client_id: CID.ramirez, staff_id: UID.price, visit_type: "SCC", scheduled_start: ts(monday, -3, "10:00"), scheduled_end: ts(monday, -3, "11:15"), physician_order_id: PO.ramirez, status: "Completed" }
  ];

  const EVV = (n: number) => `00000000-0000-4000-e000-${String(n).padStart(12, "0")}`;
  const evvLogs: EvvLog[] = [
    { id: EVV(1), visit_id: VIS(1), clock_in_time: ts(monday, 0, "09:01"), clock_out_time: ts(monday, 0, "11:03"), clock_in_gps: { lat: 40.42335, lng: -104.70915 }, clock_out_gps: { lat: 40.42331, lng: -104.70909 }, clock_in_distance_m: 6.1, clock_out_distance_m: 4.4, verification_method: "GPS", offline_locked: true, manual_adjustment_reason: null },
    { id: EVV(5), visit_id: VIS(5), clock_in_time: ts(monday, 0, "09:32"), clock_out_time: ts(monday, 0, "11:02"), clock_in_gps: { lat: 40.41748, lng: -104.73222 }, clock_out_gps: { lat: 40.41752, lng: -104.73218 }, clock_in_distance_m: 3.0, clock_out_distance_m: 2.7, verification_method: "GPS", offline_locked: true, manual_adjustment_reason: null },
    { id: EVV(7), visit_id: VIS(7), clock_in_time: ts(monday, -6, "10:02"), clock_out_time: ts(monday, -6, "12:31"), clock_in_gps: { lat: 40.43182, lng: -104.72052 }, clock_out_gps: { lat: 40.43179, lng: -104.72047 }, clock_in_distance_m: 2.4, clock_out_distance_m: 2.9, verification_method: "GPS", offline_locked: true, manual_adjustment_reason: null },
    { id: EVV(9), visit_id: VIS(9), clock_in_time: ts(monday, -4, "09:00"), clock_out_time: ts(monday, -4, "11:05"), clock_in_gps: { lat: 40.42338, lng: -104.70907 }, clock_out_gps: { lat: 40.4233, lng: -104.70911 }, clock_in_distance_m: 3.3, clock_out_distance_m: 1.8, verification_method: "GPS", offline_locked: true, manual_adjustment_reason: null },
    { id: EVV(10), visit_id: VIS(10), clock_in_time: ts(monday, -3, "10:01"), clock_out_time: ts(monday, -3, "11:14"), clock_in_gps: { lat: 40.4175, lng: -104.73219 }, clock_out_gps: { lat: 40.41747, lng: -104.73224 }, clock_in_distance_m: 1.2, clock_out_distance_m: 2.2, verification_method: "GPS", offline_locked: true, manual_adjustment_reason: null }
    // NOTE: visit 8 (Okafor JC) is Completed WITHOUT an EVV log → QA flag demo.
  ];

  const NOTE = (n: number) => `00000000-0000-4000-f000-${String(n).padStart(12, "0")}`;
  const progressNotes: ProgressNote[] = [
    {
      id: NOTE(9), visit_id: VIS(9), client_id: CID.reyes, staff_id: UID.vega,
      date: dateStr(monday, -4), start_time: "09:00", end_time: "11:05",
      specific_services_provided: "Community connection: grocery shopping at King Soopers; practiced budgeting with a $40 limit; client selected items independently and used self-checkout with verbal prompting.",
      caregiver_signature_data: SIG, client_signature_data: SIG, client_redirection_logged: false,
      goals_addressed: [
        { goal: "Community integration", progress: "Navigated store independently" },
        { goal: "Independent living skills", progress: "Budget kept within limit" }
      ]
    },
    {
      // Missing CLIENT signature → claim blocker
      id: NOTE(8), visit_id: VIS(8), client_id: CID.okafor, staff_id: UID.vega,
      date: dateStr(monday, -5), start_time: "13:00", end_time: "14:30",
      specific_services_provided: "Job coaching at Goodwill: practiced greeting customers and restocking; supervisor check-in completed.",
      caregiver_signature_data: SIG, client_signature_data: null, client_redirection_logged: false,
      goals_addressed: [{ goal: "Communication", progress: "Greeted 5 customers with prompting" }]
    },
    {
      // Staff (Martinez) license expired → claim blocker
      id: NOTE(7), visit_id: VIS(7), client_id: CID.whitfield, staff_id: UID.martinez,
      date: dateStr(monday, -6), start_time: "10:00", end_time: "12:30",
      specific_services_provided: "Community outing to the library; client selected sensory-friendly reading room; practiced checkout interaction.",
      caregiver_signature_data: SIG, client_signature_data: SIG, client_redirection_logged: true,
      goals_addressed: [{ goal: "Community integration", progress: "Tolerated 2 hours in community setting" }]
    },
    {
      id: NOTE(10), visit_id: VIS(10), client_id: CID.ramirez, staff_id: UID.price,
      date: dateStr(monday, -3), start_time: "10:00", end_time: "11:15",
      specific_services_provided: "SCC: bus-route training to work site; client swiped pass and signaled stop independently.",
      caregiver_signature_data: SIG, client_signature_data: SIG, client_redirection_logged: false,
      goals_addressed: [{ goal: "Self-advocacy", progress: "Asked driver for route confirmation" }]
    },
    {
      id: NOTE(1), visit_id: VIS(1), client_id: CID.reyes, staff_id: UID.vega,
      date: dateStr(monday, 0), start_time: "09:00", end_time: "11:03",
      specific_services_provided: "Morning SCC: pharmacy pickup and post office; practiced waiting in line and payment interaction.",
      caregiver_signature_data: SIG, client_signature_data: SIG, client_redirection_logged: false,
      goals_addressed: [{ goal: "Community integration", progress: "Completed both errands" }]
    }
  ];

  const jobCoachingLogs: JobCoachingLog[] = [
    {
      id: "00000000-0000-4000-f100-000000000008", progress_note_id: NOTE(8),
      employer_name: "Goodwill of Northern Colorado", job_title: "Retail Associate",
      supervisor_name: "M. Sisneros", supervisor_phone: "970-555-0142",
      milestone_number: 2, job_duties_completed: "Customer greeting; restocking; register shadowing",
      upc_rotation_prompted: true, employer_contact_count: 2,
      dvr_authorization_number: "DVR-2026-3315", dvr_cumulative_hours: 42.5
    }
  ];

  const medicationLogs: MedicationLog[] = [
    { id: "00000000-0000-4000-f300-000000000001", client_id: CID.reyes, medication_name: "Sertraline", dosage: "50 mg", route: "Oral", scheduled_time: `${todayStr()}T08:00:00`, administered_time: null, administered_by: null, status: "Missed", notes: null },
    { id: "00000000-0000-4000-f300-000000000002", client_id: CID.ramirez, medication_name: "Levetiracetam", dosage: "500 mg", route: "Oral", scheduled_time: `${todayStr()}T09:00:00`, administered_time: null, administered_by: null, status: "Missed", notes: null },
    // Administered yesterday with NO EVV overlap → QA flag demo
    { id: "00000000-0000-4000-f300-000000000003", client_id: CID.whitfield, medication_name: "Lamotrigine", dosage: "100 mg", route: "Oral", scheduled_time: `${todayStr(-1)}T08:00:00`, administered_time: `${todayStr(-1)}T08:10:00`, administered_by: UID.martinez, status: "Administered", notes: null },
    { id: "00000000-0000-4000-f300-000000000004", client_id: CID.reyes, medication_name: "Sertraline", dosage: "50 mg", route: "Oral", scheduled_time: `${todayStr(-1)}T08:00:00`, administered_time: null, administered_by: UID.vega, status: "Refused", notes: "Client declined; will retry per plan." }
  ];

  const nmtTrips: NmtTrip[] = [
    // Reyes: 1 of 2 used this week
    { id: "00000000-0000-4000-f200-000000000001", visit_id: VIS(1), client_id: CID.reyes, staff_id: UID.vega, trip_date: dateStr(monday, 0), destination: "Goodwill, Michaels", purpose: "Errands + community access", miles: 6.2 }
  ];

  const documents: DocumentRow[] = [
    {
      id: "00000000-0000-4000-f900-000000000001", kind: "field_upload", client_id: CID.reyes, visit_id: VIS(9),
      uploaded_by: UID.vega, file_name: "receipt-king-soopers.jpg", content_type: "image/jpeg", size_bytes: 482113,
      storage_provider: "demo", storage_key: "demo/receipt-king-soopers.jpg", status: "synced",
      metadata: { note: "Budgeting practice receipt" }, created_at: ts(monday, -4, "11:10")
    },
    {
      id: "00000000-0000-4000-f900-000000000002", kind: "field_upload", client_id: CID.okafor, visit_id: VIS(8),
      uploaded_by: UID.vega, file_name: "schedule-goodwill-week.pdf", content_type: "application/pdf", size_bytes: 120031,
      storage_provider: "demo", storage_key: "demo/schedule-goodwill-week.pdf", status: "synced",
      metadata: {}, created_at: ts(monday, -5, "14:40")
    }
  ];

  const timesheets: Timesheet[] = [
    { id: "00000000-0000-4000-f400-000000000001", staff_id: UID.vega, period_start: dateStr(monday, 0), period_end: dateStr(monday, 6), status: "open", submitted_at: null }
  ];

  const timesheetEntries: TimesheetEntry[] = [
    { id: "00000000-0000-4000-f500-000000000001", timesheet_id: "00000000-0000-4000-f400-000000000001", work_date: dateStr(monday, 0), service_code: "SCC", client_id: CID.reyes, start_time: "09:01", end_time: "11:03", hours: 2.0, source: "evv", source_id: EVV(1), notes: null },
    { id: "00000000-0000-4000-f500-000000000002", timesheet_id: "00000000-0000-4000-f400-000000000001", work_date: dateStr(monday, 0), service_code: "T", client_id: CID.reyes, start_time: null, end_time: null, hours: 0.5, source: "nmt", source_id: "00000000-0000-4000-f200-000000000001", notes: "NMT: Goodwill, Michaels" }
  ];

  const payrollPeriods: PayrollPeriod[] = [
    {
      id: "00000000-0000-4000-f600-000000000001",
      period_start: dateStr(monday, -21), period_end: dateStr(monday, -8), paydate: dateStr(monday, 5),
      status: "open", certified_by: null, certified_at: null, snapshot: null
    }
  ];

  const feeSchedule: FeeScheduleRow[] = [
    { id: "00000000-0000-4000-f700-000000000001", payer: "COLORADO_MEDICAID", visit_type: "SCC", procedure_code: "T2021", modifier: null, rate_per_unit: 15.5, effective_date: "2026-01-01", end_date: null },
    { id: "00000000-0000-4000-f700-000000000002", payer: "COLORADO_MEDICAID", visit_type: "Job_Coaching", procedure_code: "H2023", modifier: null, rate_per_unit: 18.25, effective_date: "2026-01-01", end_date: null },
    { id: "00000000-0000-4000-f700-000000000003", payer: "COLORADO_MEDICAID", visit_type: "Day_Habilitation", procedure_code: "T2021", modifier: "HQ", rate_per_unit: 12.75, effective_date: "2026-01-01", end_date: null },
    { id: "00000000-0000-4000-f700-000000000004", payer: "COLORADO_MEDICAID", visit_type: "Early_Intervention", procedure_code: "T1027", modifier: null, rate_per_unit: 21.0, effective_date: "2026-01-01", end_date: null }
  ];

  const RC = (n: number) => `00000000-0000-4000-f800-${String(n).padStart(12, "0")}`;
  const reliasCourses: ReliasCourse[] = [
    { id: RC(1), code: "QMAP", name: "QMAP Medication Administration", required: true, renewal_months: 12 },
    { id: RC(2), code: "CPR", name: "CPR / First Aid", required: true, renewal_months: 24 },
    { id: RC(3), code: "ANP", name: "Abuse & Neglect Prevention", required: true, renewal_months: 12 },
    { id: RC(4), code: "HIPAA", name: "HIPAA Privacy & Security", required: true, renewal_months: 12 },
    { id: RC(5), code: "PCP", name: "Person-Centered Planning", required: false, renewal_months: null }
  ];

  const reliasCompletions: ReliasCompletion[] = [
    { id: "00000000-0000-4000-fa00-000000000001", user_id: UID.vega, course_id: RC(1), completed_on: todayStr(-335), expires_on: todayStr(30), source: "api", synced_at: `${todayStr(-1)}T02:00:00` },
    { id: "00000000-0000-4000-fa00-000000000002", user_id: UID.vega, course_id: RC(2), completed_on: todayStr(-200), expires_on: todayStr(530), source: "api", synced_at: `${todayStr(-1)}T02:00:00` },
    { id: "00000000-0000-4000-fa00-000000000003", user_id: UID.price, course_id: RC(1), completed_on: todayStr(-120), expires_on: todayStr(245), source: "api", synced_at: `${todayStr(-1)}T02:00:00` },
    { id: "00000000-0000-4000-fa00-000000000004", user_id: UID.torres, course_id: RC(2), completed_on: todayStr(-400), expires_on: todayStr(-35), source: "api", synced_at: `${todayStr(-1)}T02:00:00` } // expired
  ];

  const recurringTemplates: RecurringVisitTemplate[] = [
    { id: "00000000-0000-4000-fb00-000000000001", client_id: CID.reyes, staff_id: UID.vega, visit_type: "SCC", weekday: 1, start_time: "09:00", end_time: "11:00", physician_order_id: PO.reyes, active: true }
  ];

  const menuConfig: MenuConfigRow[] = [
    { role: "Scheduler", sections: { CORE: true, COMPLIANCE: true, BUSINESS: true, TRAINING: true, SYSTEM: false } },
    { role: "Field_Staff", sections: { CORE: true, COMPLIANCE: false, BUSINESS: false, TRAINING: true, SYSTEM: false } }
  ];

  const userPrefs: UserPrefs[] = [
    { user_id: UID.vega, field_home: "visits", prefs: {} }
  ];

  const incidents: Incident[] = [];

  // A few starter audit rows so the Audit Trail screen isn't empty pre-demo.
  const auditTrail: AuditRow[] = [
    {
      id: "00000000-0000-4000-fc00-000000000001", table_name: "progress_notes", record_id: NOTE(9),
      action: "INSERT", performed_by: UID.vega, impersonating: null,
      timestamp: ts(monday, -4, "11:07"),
      old_values: null, new_values: { id: NOTE(9), client_signature_data: "[signature captured]", caregiver_signature_data: "[signature captured]" }
    },
    {
      id: "00000000-0000-4000-fc00-000000000002", table_name: "medication_logs", record_id: "00000000-0000-4000-f300-000000000003",
      action: "UPDATE", performed_by: UID.martinez, impersonating: null,
      timestamp: `${todayStr(-1)}T08:10:00`,
      old_values: { status: "Missed" }, new_values: { status: "Administered" }
    }
  ];

  return {
    users, clients, physicianOrders, visits, evvLogs, progressNotes, jobCoachingLogs,
    medicationLogs, nmtTrips, documents, timesheets, timesheetEntries, payrollPeriods,
    feeSchedule, reliasCourses, reliasCompletions, recurringTemplates, menuConfig,
    userPrefs, incidents, auditTrail,
    appSettings: { evv_geofence_radius_m: 150, agency_timezone: "America/Denver" }
  };
}
