// lib/data/clients-api.ts — the organization's REAL client records (the API's
// `clients` table), fetched once per navigation/revalidation and merged into
// the roster by the repo layer, next to the synthetic demo clients, until the
// rest of the domain data moves to the database too. Mirrors
// lib/auth/directory.ts: unreachable API → an empty list, never a broken screen.
import "server-only";
import { isApiAuth } from "@/lib/auth/mode";
import { apiFetch } from "@/lib/api/client";
import type { ClientRecord } from "@/lib/api/admin";
import { getSessionContext } from "@/lib/auth/session";
import { subscribeRevalidate } from "@/shims/nav-bridge";
import type { Client } from "@/lib/supabase/types";

let cached: Promise<Client[]> | null = null;
subscribeRevalidate(() => {
  cached = null;
});

export function invalidateClients(): void {
  cached = null;
}

/** The API's camelCase record in the shape every client screen already reads. */
export function clientRecordToClient(c: ClientRecord): Client {
  return {
    id: c.id,
    first_name: c.firstName,
    last_name: c.lastName,
    medicaid_id: c.medicaidId ?? "",
    date_of_birth: c.dateOfBirth ?? "",
    active_diagnoses: c.activeDiagnoses ?? [],
    insurance_provider: c.insuranceProvider,
    service_plan_start: c.servicePlanStart,
    service_plan_end: c.servicePlanEnd,
    authorized_scc_hours_per_week: c.authorizedSccHoursPerWeek,
    authorized_nmt_trips_per_week: c.authorizedNmtTripsPerWeek,
    authorized_jc_hours_per_week: c.authorizedJcHoursPerWeek,
    authorized_dh_hours_per_week: c.authorizedDhHoursPerWeek,
    authorized_ei_hours_per_week: c.authorizedEiHoursPerWeek,
    case_manager_name: c.caseManagerName,
    ccb_name: c.ccbName,
    residence_gps: c.residenceLat !== null && c.residenceLng !== null ? { lat: c.residenceLat, lng: c.residenceLng } : null,
    email: c.email,
    phone: c.phone,
    phone_cell: c.phoneCell,
    phone_work: c.phoneWork,
    middle_name: c.middleName,
    gender: c.gender,
    gender_identity: c.genderIdentity,
    marital_status: c.maritalStatus,
    ethnicity: c.ethnicity,
    race: c.race,
    guardianship_status: c.guardianshipStatus,
    account_code: c.accountCode,
    admission_date: c.admissionDate,
    discharge_date: c.dischargeDate,
    address1: c.address1,
    address2: c.address2,
    city: c.city,
    state: c.state,
    county: c.county,
    zip: c.zip,
    allergies: c.allergies,
    medical_concerns: c.medicalConcerns,
    supervision_requirements: c.supervisionRequirements,
    general_information: c.generalInformation,
    has_behavior_support_plan: c.hasBehaviorSupportPlan,
    behavior_support_plan_notes: c.behaviorSupportPlanNotes,
    status: c.status,
    is_record: true,
  };
}

export function listClientRecords(): Promise<Client[]> {
  if (!isApiAuth()) return Promise.resolve([]);
  if (!cached) {
    cached = (async () => {
      const ctx = await getSessionContext();
      if (!ctx.realUser || !ctx.effectiveUser?.org_id || !ctx.features.has("clients.core")) return [];
      try {
        const res = await apiFetch<{ clients: ClientRecord[] }>("/clients");
        return res.clients.map(clientRecordToClient);
      } catch {
        return [];
      }
    })().catch(() => {
      cached = null;
      return [];
    });
  }
  return cached;
}
