// lib/supabase/types.ts — hand-maintained row/domain types shared by the
// Supabase repo, the demo repo, and the UI. Mirrors supabase/migrations/*.
// Regenerate candidates with: supabase gen types typescript --linked

export type Role = "Admin" | "Scheduler" | "Field_Staff";
export type VisitType = "SCC" | "Job_Coaching" | "Day_Habilitation" | "Early_Intervention";
export type VisitStatus = "Scheduled" | "In_Progress" | "Completed" | "Cancelled" | "Billed";
export type VerificationMethod = "GPS" | "Telephony" | "Manual";
export type MedStatus = "Administered" | "Refused" | "Missed";
export type ServiceCode = "SCC" | "JC" | "DH" | "T";
export type DocumentKind = "field_upload" | "dvr_notice" | "monthly_billing_note" | "dvr_monthly_report" | "agency";
export type DocumentStatus = "uploading" | "synced" | "error";
export type IncidentType = "abuse_neglect" | "critical" | "medication_error" | "injury" | "other";

export interface TrainingRecord {
  course: string;
  completed_on: string; // ISO date
  expires_on: string | null;
  required?: boolean;
}

export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: "Active" | "Suspended";
  license_number: string | null;
  license_expiration_date: string | null;
  training_completed: TrainingRecord[];
}

export interface Client {
  id: string;
  first_name: string;
  last_name: string;
  medicaid_id: string;
  date_of_birth: string;
  calculated_age?: number; // from v_clients view / computed in demo
  active_diagnoses: { code: string; description: string }[];
  insurance_provider: string | null;
  service_plan_start: string | null;
  service_plan_end: string | null;
  authorized_scc_hours_per_week: number;
  authorized_nmt_trips_per_week: number;
  authorized_jc_hours_per_week: number;
  authorized_dh_hours_per_week: number;
  authorized_ei_hours_per_week: number;
  case_manager_name: string | null;
  ccb_name: string | null;
  residence_gps: { lat: number; lng: number } | null;
}

export interface PhysicianOrder {
  id: string;
  client_id: string;
  order_number: string;
  ordering_physician: string;
  order_type: string;
  effective_date: string;
  expiration_date: string | null;
  document_url: string | null;
}

export interface Visit {
  id: string;
  client_id: string;
  staff_id: string;
  visit_type: VisitType;
  scheduled_start: string;
  scheduled_end: string;
  /** @deprecated scaffold free-text ref — use physician_order_id */
  active_physician_order_id?: string | null;
  physician_order_id: string | null;
  template_id?: string | null;
  cancellation_reason?: string | null;
  status: VisitStatus;
}

/** Visit joined with display names for lists. */
export interface VisitWithNames extends Visit {
  client_name: string;
  staff_name: string;
}

export interface EvvLog {
  id: string;
  visit_id: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  clock_in_gps: { lat: number; lng: number } | null;
  clock_out_gps: { lat: number; lng: number } | null;
  clock_in_distance_m?: number | null;
  clock_out_distance_m?: number | null;
  verification_method: VerificationMethod;
  offline_locked: boolean;
  manual_adjustment_reason: string | null;
}

export interface ProgressNote {
  id: string;
  visit_id: string;
  client_id: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  calculated_billable_hours?: number;
  calculated_billing_units?: number;
  specific_services_provided: string | null;
  caregiver_signature_data: string | null;
  client_signature_data: string | null;
  client_redirection_logged: boolean;
  goals_addressed: { goal: string; progress: string }[];
  cancellation_reason?: string | null;
  billed_at?: string | null;
  claim_export_id?: string | null;
}

export interface JobCoachingLog {
  id: string;
  progress_note_id: string;
  employer_name: string;
  job_title: string | null;
  supervisor_name: string | null;
  supervisor_phone: string | null;
  milestone_number: 1 | 2 | 3 | null;
  job_duties_completed: string | null;
  upc_rotation_prompted: boolean;
  employer_contact_count: number;
  dvr_authorization_number?: string | null;
  dvr_cumulative_hours?: number | null;
}

export interface MedicationLog {
  id: string;
  client_id: string;
  medication_name: string;
  dosage: string;
  route: string;
  scheduled_time: string;
  administered_time: string | null;
  administered_by: string | null;
  status: MedStatus;
  notes: string | null;
}

export interface NmtTrip {
  id: string;
  visit_id: string | null;
  client_id: string;
  staff_id: string;
  trip_date: string;
  destination: string;
  purpose: string | null;
  miles: number | null;
}

export interface DocumentRow {
  id: string;
  kind: DocumentKind;
  client_id: string | null;
  visit_id: string | null;
  uploaded_by: string | null;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_provider: "s3" | "drive" | "demo";
  storage_key: string | null;
  status: DocumentStatus;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Timesheet {
  id: string;
  staff_id: string;
  period_start: string;
  period_end: string;
  status: "open" | "submitted";
  submitted_at: string | null;
}

export interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  work_date: string;
  service_code: ServiceCode;
  client_id: string | null;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  source: "evv" | "nmt" | "manual";
  source_id: string | null;
  notes: string | null;
}

export interface UserPrefs {
  user_id: string;
  field_home: "visits" | "dashboard";
  prefs: Record<string, unknown>;
}

export interface FeeScheduleRow {
  id: string;
  payer: string;
  visit_type: VisitType;
  procedure_code: string;
  modifier: string | null;
  rate_per_unit: number;
  effective_date: string;
  end_date: string | null;
}

export interface ClaimExport {
  id: string;
  exported_by: string | null;
  exported_at: string;
  format: string;
  payer: string;
  control_number: number;
  note_ids: string[];
  total_units: number;
  total_charge: number;
  file_content: string | null;
}

export interface PayrollPeriod {
  id: string;
  period_start: string;
  period_end: string;
  paydate: string;
  status: "open" | "submitted";
  certified_by: string | null;
  certified_at: string | null;
  snapshot: PayrollLine[] | null;
}

/** Computed per-employee payroll transmittal line (mirrors the paper form). */
export interface PayrollLine {
  staff_id: string;
  employee_name: string;
  all_notes_in: boolean;
  wk1_hours: number;
  wk1_ot: number;
  wk2_hours: number;
  wk2_ot: number;
  total_regular: number;
  total_ot: number;
}

export interface MenuConfigRow {
  role: "Scheduler" | "Field_Staff";
  sections: Record<string, boolean>;
}

export interface ReliasCourse {
  id: string;
  code: string;
  name: string;
  required: boolean;
  renewal_months: number | null;
}

export interface ReliasCompletion {
  id: string;
  user_id: string;
  course_id: string;
  completed_on: string;
  expires_on: string | null;
  source: "api" | "manual" | "sso";
  synced_at: string;
}

export interface Incident {
  id: string;
  client_id: string | null;
  reported_by: string;
  incident_type: IncidentType;
  occurred_at: string;
  description: string;
  immediate_action: string | null;
  status: "draft" | "submitted";
  submitted_at: string | null;
}

export interface AuditRow {
  id: string;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  performed_by: string | null;
  impersonating: string | null;
  timestamp: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}

export interface QaResolution {
  id: string;
  flag_key: string;
  resolved_by: string;
  resolution_note: string;
  resolved_at: string;
}

export interface RecurringVisitTemplate {
  id: string;
  client_id: string;
  staff_id: string;
  visit_type: VisitType;
  weekday: number; // 0 = Sunday
  start_time: string;
  end_time: string;
  physician_order_id: string | null;
  active: boolean;
}
