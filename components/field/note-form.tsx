// components/field/note-form.tsx — continuous-scroll single-page progress note.
// No pagination. Auto-saves to IndexedDB via useAutoSave; submits through the
// offline sync queue. Sections: vitals → goals → narrative → SCC panel →
// Supported Employment panel → signatures.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/field/signature-pad";
import { useAutoSave, loadDraft } from "@/lib/offline/useAutoSave";
import { writeLocal, newLocalId } from "@/lib/offline/db";
import { calculateBillingUnits } from "@/lib/billing/units";

interface NoteState {
  date: string;
  start_time: string;
  end_time: string;
  vitals: { temperature: string; pulse: string; blood_pressure: string };
  goals: { goal: string; addressed: boolean; progress: string }[];
  narrative: string;
  redirection_logged: boolean;
  // SCC panel
  scc: { trip_destination: string; trip_purpose: string; activities: string; redirection_events: string };
  // Supported Employment panel
  se: {
    employer_name: string; job_title: string; supervisor_name: string; supervisor_phone: string;
    job_duties_completed: string; upc_rotation_prompted: boolean;
    employer_contact_count: number; milestone_number: 1 | 2 | 3;
  };
  client_signature: string | null;
  caregiver_signature: string | null;
}

const DEFAULT_GOALS = [
  "Community integration", "Independent living skills", "Communication", "Self-advocacy"
];

const initialState = (): NoteState => ({
  date: new Date().toISOString().slice(0, 10),
  start_time: "", end_time: "",
  vitals: { temperature: "", pulse: "", blood_pressure: "" },
  goals: DEFAULT_GOALS.map((goal) => ({ goal, addressed: false, progress: "" })),
  narrative: "",
  redirection_logged: false,
  scc: { trip_destination: "", trip_purpose: "", activities: "", redirection_events: "" },
  se: {
    employer_name: "", job_title: "", supervisor_name: "", supervisor_phone: "",
    job_duties_completed: "", upc_rotation_prompted: false, employer_contact_count: 0, milestone_number: 1
  },
  client_signature: null, caregiver_signature: null
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function NoteForm({
  visitId, clientId, staffId, visitType, clientName
}: {
  visitId: string; clientId: string; staffId: string; visitType: string; clientName: string;
}) {
  const router = useRouter();
  const draftKey = `note:${visitId}`;
  const [form, setForm] = useState<NoteState>(initialState);
  const [restored, setRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, lastSavedAt } = useAutoSave(form as unknown as Record<string, unknown>, draftKey);

  useEffect(() => {
    void loadDraft<NoteState>(draftKey).then((d) => {
      if (d) setForm({ ...initialState(), ...d });
      setRestored(true);
    });
  }, [draftKey]);

  const units = useMemo(() => {
    if (!form.start_time || !form.end_time) return 0;
    return calculateBillingUnits(
      new Date(`${form.date}T${form.start_time}`),
      new Date(`${form.date}T${form.end_time}`)
    );
  }, [form.date, form.start_time, form.end_time]);

  const patch = (p: Partial<NoteState>) => setForm((f) => ({ ...f, ...p }));

  async function submit() {
    setError(null);
    if (!form.start_time || !form.end_time) { setError("Start and end times are required."); return; }
    if (!form.client_signature || !form.caregiver_signature) {
      setError("Both signatures are required before submitting. (You can keep the draft and collect them later.)");
      return;
    }
    setSubmitting(true);
    const noteId = newLocalId();
    await writeLocal("progress_notes", "insert", {
      id: noteId,
      visit_id: visitId,
      client_id: clientId,
      staff_id: staffId,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      specific_services_provided: [
        form.narrative,
        visitType === "SCC" ? `SCC trip: ${form.scc.trip_destination} — ${form.scc.trip_purpose}. Activities: ${form.scc.activities}` : null
      ].filter(Boolean).join("\n\n"),
      caregiver_signature_data: form.caregiver_signature,
      client_signature_data: form.client_signature,
      client_redirection_logged: form.redirection_logged,
      goals_addressed: form.goals.filter((g) => g.addressed).map((g) => ({ goal: g.goal, progress: g.progress }))
    });
    if (visitType === "Job_Coaching") {
      await writeLocal("job_coaching_logs", "insert", {
        id: newLocalId(),
        progress_note_id: noteId,
        employer_name: form.se.employer_name,
        job_title: form.se.job_title || null,
        supervisor_name: form.se.supervisor_name || null,
        supervisor_phone: form.se.supervisor_phone || null,
        milestone_number: form.se.milestone_number,
        job_duties_completed: form.se.job_duties_completed || null,
        upc_rotation_prompted: form.se.upc_rotation_prompted,
        employer_contact_count: form.se.employer_contact_count
      });
    }
    setSubmitting(false);
    router.push(`/field/visits/${visitId}`);
  }

  if (!restored) return <p className="p-4 text-sm text-muted-foreground">Loading draft…</p>;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold">Progress note</h1>
          <p className="text-sm text-muted-foreground">{clientName} · {visitType.replace("_", " ")}</p>
        </div>
        <span className="text-xs text-muted-foreground" role="status">
          {status === "saving" ? "Saving…" : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
        </span>
      </div>

      <Section title="Service time">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Start</Label><Input type="time" value={form.start_time} onChange={(e) => patch({ start_time: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>End</Label><Input type="time" value={form.end_time} onChange={(e) => patch({ end_time: e.target.value })} /></div>
        </div>
        <p className="text-sm text-muted-foreground">Billable units: <strong className="text-foreground">{units}</strong> (15 min = 1 unit)</p>
      </Section>

      <Section title="Vitals">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Temp °F</Label><Input inputMode="decimal" value={form.vitals.temperature} onChange={(e) => patch({ vitals: { ...form.vitals, temperature: e.target.value } })} /></div>
          <div className="space-y-1.5"><Label>Pulse</Label><Input inputMode="numeric" value={form.vitals.pulse} onChange={(e) => patch({ vitals: { ...form.vitals, pulse: e.target.value } })} /></div>
          <div className="space-y-1.5"><Label>BP</Label><Input placeholder="120/80" value={form.vitals.blood_pressure} onChange={(e) => patch({ vitals: { ...form.vitals, blood_pressure: e.target.value } })} /></div>
        </div>
      </Section>

      <Section title="Goals addressed">
        <div className="flex flex-col gap-3">
          {form.goals.map((g, i) => (
            <div key={g.goal} className="space-y-2">
              <label className="flex min-h-touch items-center gap-3">
                <input
                  type="checkbox" className="h-5 w-5"
                  checked={g.addressed}
                  onChange={(e) => {
                    const goals = [...form.goals];
                    goals[i] = { ...g, addressed: e.target.checked };
                    patch({ goals });
                  }}
                />
                <span className="text-sm font-medium">{g.goal}</span>
              </label>
              {g.addressed && (
                <Input
                  placeholder="Progress observed…"
                  value={g.progress}
                  onChange={(e) => {
                    const goals = [...form.goals];
                    goals[i] = { ...g, progress: e.target.value };
                    patch({ goals });
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Narrative">
        <Textarea
          rows={5}
          placeholder="Specific services provided, client response, observations…"
          value={form.narrative}
          onChange={(e) => patch({ narrative: e.target.value })}
        />
        <label className="flex min-h-touch items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={form.redirection_logged}
            onChange={(e) => patch({ redirection_logged: e.target.checked })} />
          <span className="text-sm">Client redirection was required and is documented above</span>
        </label>
      </Section>

      {visitType === "SCC" && (
        <Section title="SCC — community connection">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Trip destination</Label><Input value={form.scc.trip_destination} onChange={(e) => patch({ scc: { ...form.scc, trip_destination: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Trip purpose</Label><Input value={form.scc.trip_purpose} onChange={(e) => patch({ scc: { ...form.scc, trip_purpose: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Activities</Label><Textarea rows={3} value={form.scc.activities} onChange={(e) => patch({ scc: { ...form.scc, activities: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Redirection events</Label><Textarea rows={2} value={form.scc.redirection_events} onChange={(e) => patch({ scc: { ...form.scc, redirection_events: e.target.value } })} /></div>
          </div>
        </Section>
      )}

      {visitType === "Job_Coaching" && (
        <Section title="Supported employment">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Employer</Label><Input value={form.se.employer_name} onChange={(e) => patch({ se: { ...form.se, employer_name: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Job title</Label><Input value={form.se.job_title} onChange={(e) => patch({ se: { ...form.se, job_title: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Supervisor</Label><Input value={form.se.supervisor_name} onChange={(e) => patch({ se: { ...form.se, supervisor_name: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Supervisor phone</Label><Input inputMode="tel" value={form.se.supervisor_phone} onChange={(e) => patch({ se: { ...form.se, supervisor_phone: e.target.value } })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Job duties completed</Label><Textarea rows={3} value={form.se.job_duties_completed} onChange={(e) => patch({ se: { ...form.se, job_duties_completed: e.target.value } })} /></div>
            <label className="flex min-h-touch items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={form.se.upc_rotation_prompted}
                onChange={(e) => patch({ se: { ...form.se, upc_rotation_prompted: e.target.checked } })} />
              <span className="text-sm">UPC rotation prompted</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Employer contacts</Label>
                <Input type="number" min={0} value={form.se.employer_contact_count}
                  onChange={(e) => patch({ se: { ...form.se, employer_contact_count: Number(e.target.value) } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Milestone (1–3)</Label>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={form.se.milestone_number}
                  onChange={(e) => patch({ se: { ...form.se, milestone_number: Number(e.target.value) as 1 | 2 | 3 } })}
                >
                  <option value={1}>Milestone 1</option>
                  <option value={2}>Milestone 2</option>
                  <option value={3}>Milestone 3</option>
                </select>
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section title="Signatures">
        <SignaturePad label="Client signature" value={form.client_signature} onChange={(v) => patch({ client_signature: v })} />
        <SignaturePad label="Caregiver signature" value={form.caregiver_signature} onChange={(v) => patch({ caregiver_signature: v })} />
      </Section>

      {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}

      <Button size="touch" className="h-14 w-full text-base" disabled={submitting} onClick={() => void submit()}>
        {submitting ? "Saving…" : "Submit note"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Works offline — the note syncs automatically when you reconnect.
      </p>
    </div>
  );
}
