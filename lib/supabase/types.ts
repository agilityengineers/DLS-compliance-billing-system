// lib/supabase/types.ts — hand-maintained Database types.
// Regenerate with: supabase gen types typescript --linked > lib/supabase/types.ts

export type Role = "Admin" | "Scheduler" | "Field_Staff";
export type VisitType = "SCC" | "Job_Coaching" | "Day_Habilitation" | "Early_Intervention";
export type VisitStatus = "Scheduled" | "In_Progress" | "Completed" | "Cancelled" | "Billed";
export type VerificationMethod = "GPS" | "Telephony" | "Manual";
export type MedStatus = "Administered" | "Refused" | "Missed";

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
  calculated_age?: number; // from v_clients view
  active_diagnoses: { code: string; description: string }[];
  insurance_provider: string | null;
  service_plan_start: string | null;
  service_plan_end: string | null;
  authorized_scc_hours_per_week: number;
  authorized_nmt_trips_per_week: number;
  residence_gps: { lat: number; lng: number } | null;
}

export interface Visit {
  id: string;
  client_id: string;
  staff_id: string;
  visit_type: VisitType;
  scheduled_start: string;
  scheduled_end: string;
  active_physician_order_id: string | null;
  status: VisitStatus;
}

export interface EvvLog {
  id: string;
  visit_id: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  clock_in_gps: { lat: number; lng: number } | null;
  clock_out_gps: { lat: number; lng: number } | null;
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
