// components/admin/clients/client-health-tab.tsx — what staff read before a
// visit: allergies, medical concerns, supervision requirements, the behavior
// support plan and anything else worth knowing. Rides clients.health.
"use client";

import { useState } from "react";
import { clientsApi, type ClientRecord } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ClientHealthTab({ client, onSaved }: { client: ClientRecord; onSaved: (client: ClientRecord) => void }) {
  const [form, setForm] = useState({
    allergies: client.allergies ?? "",
    medicalConcerns: client.medicalConcerns ?? "",
    supervisionRequirements: client.supervisionRequirements ?? "",
    generalInformation: client.generalInformation ?? "",
    hasBehaviorSupportPlan: client.hasBehaviorSupportPlan,
    behaviorSupportPlanNotes: client.behaviorSupportPlanNotes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const area = (key: keyof typeof form, label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`health-${key}`}>{label}</Label>
      <Textarea
        id={`health-${key}`}
        rows={3}
        value={String(form[key])}
        placeholder={hint}
        onChange={(e) => {
          setSaved(false);
          setForm((f) => ({ ...f, [key]: e.target.value }));
        }}
      />
    </div>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        clientsApi
          .update(client.id, form)
          .then((res) => {
            onSaved(res.client);
            setSaved(true);
          })
          .catch((err) => setError(errorMessage(err)))
          .finally(() => setSaving(false));
      }}
    >
      <p className="text-sm text-muted-foreground">Written for the person walking in the door. Keep it plain and current.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {area("allergies", "Allergies", "Penicillin; tree nuts. None known.")}
        {area("medicalConcerns", "Medical concerns", "Seizure history; diabetic — check blood sugar before meals.")}
        {area("supervisionRequirements", "Supervision requirements", "Line of sight in the community; may be alone at home for up to two hours.")}
        {area("generalInformation", "General information", "Communication style, routines, what helps on a hard day.")}
      </div>
      <div className="space-y-3 rounded-card border border-border bg-card p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            id="health-bsp"
            type="checkbox"
            className="h-4 w-4 accent-[#5F7161]"
            checked={form.hasBehaviorSupportPlan}
            onChange={(e) => {
              setSaved(false);
              setForm((f) => ({ ...f, hasBehaviorSupportPlan: e.target.checked }));
            }}
          />
          Has a behavior support plan
        </label>
        {form.hasBehaviorSupportPlan && area("behaviorSupportPlanNotes", "Behavior support plan — what staff need to know", "Triggers, de-escalation steps, who to call.")}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        {saved && <span className="rounded-btn bg-pill-success px-3 py-1.5 text-sm text-pill-success-fg">Saved.</span>}
      </div>
    </form>
  );
}
