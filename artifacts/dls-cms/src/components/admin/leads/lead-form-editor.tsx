// components/admin/leads/lead-form-editor.tsx — add, reword, reorder and
// retire the questions the website asks. The four built-in questions (name,
// email, consent) keep their shape; everything else is the Admin's to change.
// No drag-and-drop and no dialogs, in keeping with the other settings screens.
"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Lock } from "lucide-react";
import { leadsApi, type LeadFormLimits, type LeadQuestion, type LeadQuestionType } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LeadFormPreview } from "./lead-form-preview";

const TYPE_LABELS: Record<LeadQuestionType, string> = {
  short_text: "Short answer",
  long_text: "Paragraph",
  email: "Email address",
  phone: "Phone number",
  select: "Choice list",
  yes_no: "Checkbox (yes / no)",
};

const TYPE_CHOICES: LeadQuestionType[] = ["short_text", "long_text", "select", "yes_no", "phone", "email"];

const splitOptions = (text: string): string[] =>
  text
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

export function LeadFormEditor() {
  const [questions, setQuestions] = useState<LeadQuestion[] | null>(null);
  const [limits, setLimits] = useState<LeadFormLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  async function load() {
    try {
      const res = await leadsApi.questions.list();
      setQuestions(res.questions);
      setLimits(res.limits);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function move(id: string, direction: -1 | 1) {
    if (!questions) return;
    const ids = questions.map((q) => q.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(`move:${id}`, () => leadsApi.questions.reorder(ids));
  }

  if (error && !questions) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!questions) return <p className="text-sm text-muted-foreground">Loading the form…</p>;

  const active = questions.filter((q) => q.active);
  const retired = questions.filter((q) => !q.active);
  const visible = showRetired ? questions : active;
  const atLimit = limits ? active.length >= limits.activeQuestions : false;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span>
          {active.length} question{active.length === 1 ? "" : "s"} on the form{limits ? ` (up to ${limits.activeQuestions})` : ""} · {active.filter((q) => q.isSystem).length} built in
        </span>
        {retired.length > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 rounded border-border" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
            Show {retired.length} retired
          </label>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <div className="w-full overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
                <tr>
                  <th className="w-20">Order</th>
                  <th>Question</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
                {visible.map((q) => {
                  const first = questions[0]?.id === q.id;
                  const last = questions[questions.length - 1]?.id === q.id;
                  if (editing === q.id) {
                    return (
                      <tr key={q.id}>
                        <td colSpan={5}>
                          <EditQuestionForm
                            question={q}
                            busy={busy === `edit:${q.id}`}
                            onCancel={() => setEditing(null)}
                            onSave={(patch) =>
                              void run(`edit:${q.id}`, async () => {
                                await leadsApi.questions.update(q.id, patch);
                                setEditing(null);
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={q.id} className={q.active ? undefined : "opacity-60"}>
                      <td>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded p-1 hover:bg-muted disabled:opacity-30"
                            aria-label={`Move ${q.label} up`}
                            disabled={first || busy !== null}
                            onClick={() => move(q.id, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 hover:bg-muted disabled:opacity-30"
                            aria-label={`Move ${q.label} down`}
                            disabled={last || busy !== null}
                            onClick={() => move(q.id, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-start gap-2">
                          {q.isSystem && <Lock className="mt-0.5 h-3.5 w-3.5 flex-none text-muted-foreground" aria-label="Built in" />}
                          <div>
                            <div className="font-medium">{q.label}</div>
                            {q.helpText && <div className="text-xs text-muted-foreground">{q.helpText}</div>}
                            {q.type === "select" && <div className="text-xs text-muted-foreground">{q.options.join(" · ")}</div>}
                            {!q.active && <Badge variant="muted" className="mt-1">Retired</Badge>}
                          </div>
                        </div>
                      </td>
                      <td className="text-muted-foreground">{TYPE_LABELS[q.type]}</td>
                      <td>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          aria-label={`${q.label} is required`}
                          checked={q.required}
                          disabled={q.isSystem || !q.active || busy !== null}
                          onChange={(e) => void run(`required:${q.id}`, () => leadsApi.questions.update(q.id, { required: e.target.checked }))}
                        />
                      </td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setEditing(q.id)}>Edit</Button>
                          {!q.isSystem && q.active && (
                            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run(`retire:${q.id}`, () => leadsApi.questions.remove(q.id))}>
                              Retire
                            </Button>
                          )}
                          {!q.isSystem && !q.active && (
                            <Button size="sm" variant="ghost" disabled={busy !== null || atLimit} onClick={() => void run(`restore:${q.id}`, () => leadsApi.questions.update(q.id, { active: true }))}>
                              Restore
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AddQuestionForm disabled={atLimit} onCreated={() => void load()} />
        </div>
        <LeadFormPreview questions={active} />
      </div>
    </div>
  );
}

function EditQuestionForm({
  question,
  busy,
  onSave,
  onCancel,
}: {
  question: LeadQuestion;
  busy: boolean;
  onSave: (patch: { label: string; helpText: string | null; options?: string[] }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(question.label);
  const [helpText, setHelpText] = useState(question.helpText ?? "");
  const [options, setOptions] = useState(question.options.join("\n"));
  return (
    <form
      className="space-y-3 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          label: label.trim(),
          helpText: helpText.trim() || null,
          ...(question.type === "select" && !question.isSystem ? { options: splitOptions(options) } : {}),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`edit-label-${question.id}`}>Question</Label>
          <Input id={`edit-label-${question.id}`} required value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`edit-help-${question.id}`}>Help text (optional)</Label>
          <Input id={`edit-help-${question.id}`} value={helpText} onChange={(e) => setHelpText(e.target.value)} />
        </div>
        {question.type === "select" && !question.isSystem && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`edit-options-${question.id}`}>Choices, one per line</Label>
            <Textarea id={`edit-options-${question.id}`} rows={4} value={options} onChange={(e) => setOptions(e.target.value)} />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !label.trim()}>{busy ? "Saving…" : "Save"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function AddQuestionForm({ disabled, onCreated }: { disabled: boolean; onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [helpText, setHelpText] = useState("");
  const [type, setType] = useState<LeadQuestionType>("short_text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await leadsApi.questions.create({
        label: label.trim(),
        helpText: helpText.trim() || undefined,
        type,
        options: type === "select" ? splitOptions(options) : undefined,
        required,
      });
      setLabel("");
      setHelpText("");
      setOptions("");
      setRequired(false);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-card border border-border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">Add a question</summary>
      <form onSubmit={submit} className="space-y-4 border-t border-border p-4">
        {disabled && <p className="text-sm text-muted-foreground">The form has reached its limit. Retire a question to add another.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-q-label">Question</Label>
            <Input id="new-q-label" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="How did you hear about us?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-q-type">Answer type</Label>
            <select
              id="new-q-type"
              className="h-10 w-full rounded-btn border border-border bg-card px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as LeadQuestionType)}
            >
              {TYPE_CHOICES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="new-q-help">Help text (optional)</Label>
            <Input id="new-q-help" value={helpText} onChange={(e) => setHelpText(e.target.value)} placeholder="Shown under the question." />
          </div>
          {type === "select" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="new-q-options">Choices, one per line</Label>
              <Textarea id="new-q-options" rows={4} required value={options} onChange={(e) => setOptions(e.target.value)} placeholder={"A friend\nOur website\nCase manager"} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 rounded border-border" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Required
          </label>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={saving || disabled || !label.trim()}>{saving ? "Adding…" : "Add question"}</Button>
      </form>
    </details>
  );
}
