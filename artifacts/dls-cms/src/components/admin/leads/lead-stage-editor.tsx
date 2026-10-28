// components/admin/leads/lead-stage-editor.tsx — the funnel: rename, reorder,
// add and remove stages. "New", "Converted" and "Closed" are structural: the
// inbox and the conversion flow find them by what they mean, so they can be
// renamed but never removed.
"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Lock } from "lucide-react";
import { leadsApi, type LeadFormLimits, type LeadStage } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stageVariant } from "./lead-stage-badge";

const KIND_LABELS = { open: "In progress", won: "Became a client", lost: "Closed" } as const;

export function LeadStageEditor() {
  const [stages, setStages] = useState<LeadStage[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [limits, setLimits] = useState<LeadFormLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [newLabel, setNewLabel] = useState("");

  async function load() {
    try {
      const res = await leadsApi.stages.list();
      setStages(res.stages);
      setCounts(res.counts);
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
    if (!stages) return;
    const ids = stages.map((s) => s.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(`move:${id}`, () => leadsApi.stages.reorder(ids));
  }

  if (error && !stages) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!stages) return <p className="text-sm text-muted-foreground">Loading the funnel…</p>;

  const entry = stages.find((s) => s.active && s.kind === "open");
  const activeCount = stages.filter((s) => s.active).length;
  const atLimit = limits ? activeCount >= limits.activeStages : false;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
            <tr>
              <th className="w-20">Order</th>
              <th>Stage</th>
              <th>Means</th>
              <th>Inquiries</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-t [&_tr]:border-border">
            {stages.map((s, index) => {
              const n = counts[s.id] ?? 0;
              return (
                <tr key={s.id} className={s.active ? undefined : "opacity-60"}>
                  <td>
                    <div className="flex gap-1">
                      <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label={`Move ${s.label} up`} disabled={index === 0 || busy !== null} onClick={() => move(s.id, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label={`Move ${s.label} down`} disabled={index === stages.length - 1 || busy !== null} onClick={() => move(s.id, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td>
                    {renaming?.id === s.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const label = renaming.label.trim();
                          if (!label) return;
                          void run(`rename:${s.id}`, async () => {
                            await leadsApi.stages.update(s.id, { label });
                            setRenaming(null);
                          });
                        }}
                      >
                        <Input className="h-9 max-w-xs" autoFocus value={renaming.label} onChange={(e) => setRenaming({ id: s.id, label: e.target.value })} aria-label={`New name for ${s.label}`} />
                        <Button type="submit" size="sm" disabled={busy !== null}>Save</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        {s.isSystem && <Lock className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-label="Built in" />}
                        <Badge variant={stageVariant(s.kind)}>{s.label}</Badge>
                        {entry?.id === s.id && <span className="text-xs text-muted-foreground">new inquiries land here</span>}
                        {!s.active && <Badge variant="muted">Retired</Badge>}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground">{KIND_LABELS[s.kind]}</td>
                  <td className="tabular-nums">{n}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setRenaming({ id: s.id, label: s.label })}>Rename</Button>
                      {!s.isSystem && s.active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null || n > 0}
                          title={n > 0 ? `Move its ${n} ${n === 1 ? "inquiry" : "inquiries"} first` : undefined}
                          onClick={() => void run(`remove:${s.id}`, () => leadsApi.stages.remove(s.id))}
                        >
                          Remove
                        </Button>
                      )}
                      {!s.isSystem && !s.active && (
                        <Button size="sm" variant="ghost" disabled={busy !== null || atLimit} onClick={() => void run(`restore:${s.id}`, () => leadsApi.stages.update(s.id, { active: true }))}>
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

      <form
        className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const label = newLabel.trim();
          if (!label) return;
          void run("add", async () => {
            await leadsApi.stages.create(label);
            setNewLabel("");
          });
        }}
      >
        <div className="min-w-[16rem] space-y-1.5">
          <Label htmlFor="new-stage-label">Add a stage</Label>
          <Input id="new-stage-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Waiting on paperwork" disabled={atLimit} />
        </div>
        <Button type="submit" disabled={busy !== null || atLimit || !newLabel.trim()}>{busy === "add" ? "Adding…" : "Add stage"}</Button>
        <span className="text-xs text-muted-foreground">New stages go just before Converted and Closed; move them with the arrows.</span>
      </form>
    </div>
  );
}
