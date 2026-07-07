// components/field/note-form.tsx — continuous-scroll single-page progress
// note (no pagination). Sections: service time (live unit calc) → goals →
// narrative → SCC panel → DVR supported-employment panel (job coaching) →
// cancellation → dual signatures (both REQUIRED to submit).
// Auto-saves to encrypted IndexedDB; drafts are PURGED after submit; the
// submission itself goes through the offline sync queue.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/field/signature-pad";
import { useAutoSave, loadDraft } from "@/lib/offline/useAutoSave";
import { db, writeLocal, newLocalId } from "@/lib/offline/db";
import { SyncEngine } from "@/lib/offline/syncEngine";
import { calculateBillingUnits } from "@/lib/billing/units";

interface NoteState {
  date: string;
  start_time: string;
  end_time: string;
  goals: { goal: string; addressed: boolean; progress: string }[];
  narrative: string;
  redirection_logged: boolean;
  scc: { activities: string; redirection_events: string };
  se: {
    employer_name: string; job_title: string; supervisor_name: string; supervisor_phone: string;
    job_duties_completed: string; upc_rotation_prompted: boolean;
    employer_contact_count: number; milestone_number: 1 | 2 | 3;
    dvr_authorization_number: string; dvr_cumulative_hours: string;
  };
  client_signature: string | null;
  caregiver_signature: string | null;
}

// Default ISP goal set — replace with per-client ISP goals when the client
// provides their plan documents (tracked as an open item with the client).
const DEFAULT_GOALS = [
  "Community integration", "Independent living skills", "Communication", "Self-advocacy"
];

const initialState = (): NoteState => ({
  date: new Date().toISOString().slice(0, 10),
  start_time: "", end_time: "",
  goals: DEFAULT_GOALS.map((goal) => ({ goal, addressed: false, progress: "" })),
  narrative: "",
  redirection_logged: false,
  scc: { activities: "", redirection_events: "" },
  se: {
    employer_name: "", job_title: "", supervisor_name: "", supervisor_phone: "",
    job_duties_completed: "", upc_rotation_prompted: false, employer_contact_count: 0, milestone_number: 1,
    dvr_authorization_number: "", dvr_cumulative_hours: ""
  },
  client_signature: null, caregiver_signature: null
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-card-m border border-border bg-card p-4">
      <h2 className="label-caps text-muted-foreground">{title}</h2>
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
  const { status, lastSavedAt } = useAutoSave(form as unknown as Record<string, unknown>, draftKey, restored);

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

  const hours = useMemo(() => {
    if (!form.start_time || !form.end_time) return 0;
    const ms = new Date(`${form.date}T${form.end_time}`).getTime() - new Date(`${form.date}T${form.start_time}`).getTime();
    return Math.max(0, Math.round((ms / 3600000) * 100) / 100);
  }, [form.date, form.start_time, form.end_time]);

  const patch = (p: Partial<NoteState>) => setForm((f) => ({ ...f, ...p }));

  async function submit() {
    setError(null);
    if (!form.start_time || !form.end_time) { setError("Start and end times are required."); return; }
    if (units <= 0) { setError("End time must be after start time."); return; }
    if (!form.client_signature || !form.caregiver_signature) {
      setError("Both signatures are required before submitting. (Your draft is saved — collect them and come back.)");
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
        visitType === "SCC" && form.scc.activities ? `Activities: ${form.scc.activities}` : null,
        visitType === "SCC" && form.scc.redirection_events ? `Redirection events: ${form.scc.redirection_events}` : null
      ].filter(Boolean).join("\n\n"),
      caregiver_signature_data: form.caregiver_signature,
      client_signature_data: form.client_signature,
      client_redirection_logged: form.redirection_logged,
      goals_addressed: form.goals.filter((g) => g.addressed).map((g) => ({ goal: g.goal, progress: g.progress })),
      cancellation_reason: null
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
        employer_contact_count: form.se.employer_contact_count,
        dvr_authorization_number: form.se.dvr_authorization_number || null,
        dvr_cumulative_hours: form.se.dvr_cumulative_hours ? Number(form.se.dvr_cumulative_hours) : null
      });
    }
    // Lost-device protocol: the draft (signatures, narrative) must not
    // linger after submit — the queued/synced copy is the record now.
    await db.drafts.delete(draftKey);
    void SyncEngine.drain();
    setSubmitting(false);
    router.push(`/field/visits/${visitId}`);
  }

  if (!restored) return <p className="p-4 text-sm text-muted-foreground">Loading draft…</p>;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold text-plum">Progress note</h1>
          <p className="text-sm text-muted-foreground">{clientName} · {visitType.replace(/_/g, " ")}</p>
        </div>
        <span className="text-xs text-muted-foreground" role="status">
          {status === "saving" ? "Saving…" : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Draft"}
        </span>
      </div>

      <Section title="Service time">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Start</Label><Input type="time" value={form.start_time} onChange={(e) => patch({ start_time: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>End</Label><Input type="time" value={form.end_time} onChange={(e) => patch({ end_time: e.target.value })} /></div>
        </div>
        <p className="text-sm text-muted-foreground">
          Billable: <strong className="text-foreground">{hours} hrs ({units} units)</strong>{" "}
          <span className="text-xs">(15 min = 1 unit)</span>
        </p>
      </Section>

      <Section title="Goals addressed">
        <div className="flex flex-col gap-3">
          {form.goals.map((g, i) => (
            <div key={g.goal} className="space-y-2">
              <label className="flex min-h-touch items-center gap-3">
                <input
                  type="checkbox" className="h-5 w-5 accent-[#5F7161]"
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
          <input type="checkbox" className="h-5 w-5 accent-[#5F7161]" checked={form.redirection_logged}
            onChange={(e) => patch({ redirection_logged: e.target.checked })} />
          <span className="text-sm">Client redirection was required and is documented above</span>
        </label>
      </Section>

      {visitType === "SCC" && (
        <Section title="SCC — community connection">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Activities</Label><Textarea rows={3} value={form.scc.activities} onChange={(e) => patch({ scc: { ...form.scc, activities: e.target.value } })} /></div>
            <div className="space-y-1.5"><Label>Redirection events</Label><Textarea rows={2} value={form.scc.redirection_events} onChange={(e) => patch({ scc: { ...form.scc, redirection_events: e.target.value } })} /></div>
            <p className="text-xs text-muted-foreground">NMT trips are logged on the visit screen and count against the weekly authorization.</p>
          </div>
        </Section>
      )}

      {visitType === "Job_Coaching" && (
        <Section title="DVR — supported employment">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>DVR authorization #</Label><Input value={form.se.dvr_authorization_number} onChange={(e) => patch({ se: { ...form.se, dvr_authorization_number: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Cumulative hours</Label><Input inputMode="decimal" value={form.se.dvr_cumulative_hours} onChange={(e) => patch({ se: { ...form.se, dvr_cumulative_hours: e.target.value } })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Employer</Label><Input value={form.se.employer_name} onChange={(e) => patch({ se: { ...form.se, employer_name: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Job title</Label><Input value={form.se.job_title} onChange={(e) => patch({ se: { ...form.se, job_title: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Supervisor</Label><Input value={form.se.supervisor_name} onChange={(e) => patch({ se: { ...form.se, supervisor_name: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Supervisor phone</Label><Input inputMode="tel" value={form.se.supervisor_phone} onChange={(e) => patch({ se: { ...form.se, supervisor_phone: e.target.value } })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Job duties completed</Label><Textarea rows={3} value={form.se.job_duties_completed} onChange={(e) => patch({ se: { ...form.se, job_duties_completed: e.target.value } })} /></div>
            <label className="flex min-h-touch items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[#5F7161]" checked={form.se.upc_rotation_prompted}
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
                  className="h-11 w-full rounded-btn border border-border bg-card px-3 text-sm"
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
        <p className="text-xs text-muted-foreground">Both signatures are required — missing signatures block the claim.</p>
      </Section>

      {error && <p className="rounded-btn bg-pill-danger p-3 text-sm text-pill-danger-fg" role="alert">{error}</p>}

      <Button size="touch" className="h-14 w-full text-base" disabled={submitting} onClick={() => void submit()}>
        {submitting ? "Saving…" : "Submit note"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Works offline — the note syncs automatically when you reconnect. If the visit didn&rsquo;t
        happen, record the cancellation from the visit screen instead.
      </p>
    </div>
  );
}
