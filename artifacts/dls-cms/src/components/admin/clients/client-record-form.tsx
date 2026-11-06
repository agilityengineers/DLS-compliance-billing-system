// components/admin/clients/client-record-form.tsx — the record itself:
// identity, demographics, contact details, address, the service plan window,
// diagnoses and status. One form, saved as a whole; the status control is
// shown only to an Admin because the API refuses it from anyone else.
"use client";

import { useState } from "react";
import {
  CLIENT_GENDERS,
  CLIENT_STATUSES,
  GUARDIANSHIP_STATUSES,
  MARITAL_STATUSES,
  clientsApi,
  type ClientDiagnosis,
  type ClientGender,
  type ClientPatchInput,
  type ClientRecord,
  type ClientStatus,
} from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "./format";

type Draft = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCell: string;
  phoneWork: string;
  medicaidId: string;
  dateOfBirth: string;
  gender: ClientGender | "";
  genderIdentity: string;
  maritalStatus: string;
  ethnicity: string;
  race: string;
  guardianshipStatus: string;
  accountCode: string;
  admissionDate: string;
  dischargeDate: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  county: string;
  zip: string;
  insuranceProvider: string;
  servicePlanStart: string;
  servicePlanEnd: string;
  authorizedSccHoursPerWeek: number;
  authorizedNmtTripsPerWeek: number;
  authorizedJcHoursPerWeek: number;
  authorizedDhHoursPerWeek: number;
  authorizedEiHoursPerWeek: number;
  caseManagerName: string;
  ccbName: string;
  ccbPhone: string;
  ccbEmail: string;
  ccbAddress1: string;
  ccbCity: string;
  ccbState: string;
  ccbZip: string;
  status: ClientStatus;
};

function draftOf(c: ClientRecord): Draft {
  return {
    firstName: c.firstName,
    middleName: c.middleName ?? "",
    lastName: c.lastName,
    email: c.email ?? "",
    phone: c.phone ?? "",
    phoneCell: c.phoneCell ?? "",
    phoneWork: c.phoneWork ?? "",
    medicaidId: c.medicaidId ?? "",
    dateOfBirth: c.dateOfBirth ?? "",
    gender: c.gender ?? "",
    genderIdentity: c.genderIdentity ?? "",
    maritalStatus: c.maritalStatus ?? "",
    ethnicity: c.ethnicity ?? "",
    race: c.race ?? "",
    guardianshipStatus: c.guardianshipStatus ?? "",
    accountCode: c.accountCode ?? "",
    admissionDate: c.admissionDate ?? "",
    dischargeDate: c.dischargeDate ?? "",
    address1: c.address1 ?? "",
    address2: c.address2 ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    county: c.county ?? "",
    zip: c.zip ?? "",
    insuranceProvider: c.insuranceProvider ?? "",
    servicePlanStart: c.servicePlanStart ?? "",
    servicePlanEnd: c.servicePlanEnd ?? "",
    authorizedSccHoursPerWeek: c.authorizedSccHoursPerWeek,
    authorizedNmtTripsPerWeek: c.authorizedNmtTripsPerWeek,
    authorizedJcHoursPerWeek: c.authorizedJcHoursPerWeek,
    authorizedDhHoursPerWeek: c.authorizedDhHoursPerWeek,
    authorizedEiHoursPerWeek: c.authorizedEiHoursPerWeek,
    caseManagerName: c.caseManagerName ?? "",
    ccbName: c.ccbName ?? "",
    ccbPhone: c.ccbPhone ?? "",
    ccbEmail: c.ccbEmail ?? "",
    ccbAddress1: c.ccbAddress1 ?? "",
    ccbCity: c.ccbCity ?? "",
    ccbState: c.ccbState ?? "",
    ccbZip: c.ccbZip ?? "",
    status: c.status,
  };
}

function Field({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function ClientRecordForm({
  client,
  isAdmin,
  onSaved,
}: {
  client: ClientRecord;
  isAdmin: boolean;
  onSaved: (client: ClientRecord) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(client));
  const [diagnoses, setDiagnoses] = useState<ClientDiagnosis[]>(client.activeDiagnoses);
  const [dx, setDx] = useState({ code: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof Draft>(key: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));
  };
  const text = (id: keyof Draft, label: string, type = "text", extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <Field id={`client-${id}`} label={label}>
      <Input id={`client-${id}`} type={type} value={String(draft[id])} onChange={set(id)} {...extra} />
    </Field>
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const patch: ClientPatchInput = { ...draft, activeDiagnoses: diagnoses };
      if (!isAdmin) delete patch.status;
      const res = await clientsApi.update(client.id, patch);
      onSaved(res.client);
      setDraft(draftOf(res.client));
      setDiagnoses(res.client.activeDiagnoses);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function markPrimary(index: number) {
    setSaved(false);
    setDiagnoses((list) => list.map((d, i) => ({ ...d, isPrimary: i === index })));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-card border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-medium">Identity</h2>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("firstName", "First name", "text", { required: true })}
          {text("middleName", "Middle name")}
          {text("lastName", "Last name", "text", { required: true })}
          {text("dateOfBirth", "Date of birth", "date")}
          <Field id="client-gender" label="Gender">
            <select id="client-gender" className={selectClass} value={draft.gender} onChange={set("gender")}>
              <option value="">Not recorded</option>
              {CLIENT_GENDERS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>
          {text("genderIdentity", "Gender identity")}
          {text("medicaidId", "Medicaid ID")}
          {text("accountCode", "Account code")}
          <Field id="client-guardianshipStatus" label="Guardianship">
            <select id="client-guardianshipStatus" className={selectClass} value={draft.guardianshipStatus} onChange={set("guardianshipStatus")}>
              <option value="">Not recorded</option>
              {GUARDIANSHIP_STATUSES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field id="client-maritalStatus" label="Marital status">
            <select id="client-maritalStatus" className={selectClass} value={draft.maritalStatus} onChange={set("maritalStatus")}>
              <option value="">Not recorded</option>
              {MARITAL_STATUSES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>
          {text("ethnicity", "Ethnicity")}
          {text("race", "Race")}
        </div>
      </section>

      <section className="rounded-card border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-medium">Status &amp; dates</h2>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="client-status" label="Status">
            {isAdmin ? (
              <select id="client-status" className={selectClass} value={draft.status} onChange={set("status")}>
                {CLIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <div className="flex h-10 items-center gap-2 text-sm">
                <Badge variant="muted">{draft.status}</Badge>
                <span className="text-xs text-muted-foreground">An Admin changes the status.</span>
              </div>
            )}
          </Field>
          {text("admissionDate", "Admission date", "date")}
          {text("dischargeDate", "Discharge date", "date")}
          {text("servicePlanStart", "Service plan start", "date")}
          {text("servicePlanEnd", "Service plan end", "date")}
        </div>
      </section>

      <section className="rounded-card border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-medium">Contact &amp; address</h2>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("email", "Email", "email")}
          {text("phone", "Phone (home)", "tel")}
          {text("phoneCell", "Phone (cell)", "tel")}
          {text("phoneWork", "Phone (work)", "tel")}
          {text("address1", "Address", "text", { className: "lg:col-span-2" } as never)}
          {text("address2", "Address line 2")}
          {text("city", "City")}
          {text("state", "State", "text", { maxLength: 2, placeholder: "CO" })}
          {text("zip", "ZIP", "text", { maxLength: 10 })}
          {text("county", "County")}
        </div>
      </section>

      <section className="rounded-card border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-medium">Care team &amp; weekly authorizations</h2>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("caseManagerName", "Case manager")}
          {text("ccbName", "Case Management Agency (CCB)")}
          {text("ccbPhone", "CCB phone", "tel")}
          {text("ccbEmail", "CCB email", "email")}
          {text("ccbAddress1", "CCB address")}
          {text("ccbCity", "CCB city")}
          {text("ccbState", "CCB state", "text", { maxLength: 2, placeholder: "CO" })}
          {text("ccbZip", "CCB ZIP", "text", { maxLength: 10 })}
          {text("insuranceProvider", "Insurance provider (summary)")}
          {text("authorizedSccHoursPerWeek", "SCC hrs / week", "number", { min: 0, step: 0.25 })}
          {text("authorizedJcHoursPerWeek", "Job Coaching hrs / week", "number", { min: 0, step: 0.25 })}
          {text("authorizedDhHoursPerWeek", "Day Habilitation hrs / week", "number", { min: 0, step: 0.25 })}
          {text("authorizedEiHoursPerWeek", "Early Intervention hrs / week", "number", { min: 0, step: 0.25 })}
          {text("authorizedNmtTripsPerWeek", "NMT trips / week", "number", { min: 0, step: 1 })}
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Claim readiness still reads these weekly caps. Record the authorization itself, with its number and period, on the Authorizations tab.
        </p>
      </section>

      <section className="rounded-card border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-medium">
          Diagnoses <Badge variant="muted">{diagnoses.length}</Badge>
        </h2>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <Input aria-label="ICD-10 code" placeholder="ICD-10 code" className="w-36" value={dx.code} onChange={(e) => setDx({ ...dx, code: e.target.value })} />
            <Input aria-label="Diagnosis description" placeholder="Description" className="min-w-48 flex-1" value={dx.description} onChange={(e) => setDx({ ...dx, description: e.target.value })} />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!dx.code.trim()) return;
                setSaved(false);
                setDiagnoses((d) => [...d, { code: dx.code.trim(), description: dx.description.trim(), isPrimary: d.length === 0 }]);
                setDx({ code: "", description: "" });
              }}
            >
              Add
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {diagnoses.map((d, i) => (
              <li key={`${d.code}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-medium tabular-nums">{d.code}</span>
                  {d.description && <span className="text-muted-foreground"> — {d.description}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {d.isPrimary ? (
                    <Badge variant="default">Principal on claims</Badge>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" onClick={() => markPrimary(i)}>Make principal</Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSaved(false);
                      setDiagnoses((list) => list.filter((_, j) => j !== i));
                    }}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            ))}
            {diagnoses.length === 0 && <li className="px-3 py-3 text-muted-foreground">No diagnosis on file. A claim needs at least one.</li>}
          </ul>
        </div>
      </section>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save record"}</Button>
        {saved && <span className="rounded-btn bg-pill-success px-3 py-1.5 text-sm text-pill-success-fg">Saved.</span>}
      </div>
    </form>
  );
}
