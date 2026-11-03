// components/admin/clients/client-files-tab.tsx — the paperwork on file for
// the client, by category, with the dates each covers: a passed end date is
// what makes a document due for renewal. Rides clients.paperwork.
"use client";

import { useEffect, useRef, useState } from "react";
import { clientsApi, type ClientFile, type ClientFilesResponse } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { daysUntil, formatBytes, formatDate, selectClass } from "./format";

function renewal(file: ClientFile, today: string): { label: string; variant: "success" | "warning" | "destructive" | "muted" } | null {
  const left = daysUntil(file.endDate, today);
  if (left === null) return null;
  if (left < 0) return { label: `Expired ${formatDate(file.endDate)}`, variant: "destructive" };
  if (left <= 30) return { label: `Renew within ${left} days`, variant: "warning" };
  return { label: `Valid to ${formatDate(file.endDate)}`, variant: "success" };
}

export function ClientFilesTab({ clientId, today }: { clientId: string; today: string }) {
  const [data, setData] = useState<ClientFilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [meta, setMeta] = useState({ category: "", fileName: "", startDate: "", endDate: "", notes: "" });
  const [picked, setPicked] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    clientsApi.files
      .list(clientId)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => clientsApi.files.list(clientId).then(setData);

  if (error && !data) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading files…</p>;

  const accept = data.contentTypes.join(",");
  const byCategory = new Map<string, ClientFile[]>();
  for (const f of data.files) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Documents on file, up to {formatBytes(data.maxBytes)} each. Give a document the dates it covers and a lapsed one stands out here.
        </p>
        {!adding && <Button size="sm" onClick={() => setAdding(true)}>Add document</Button>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {adding && (
        <form
          className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!picked || !meta.category) return;
            const file = picked;
            void run(async () => {
              await clientsApi.files.upload(clientId, file, {
                fileName: meta.fileName.trim() || file.name,
                category: meta.category,
                startDate: meta.startDate,
                endDate: meta.endDate,
                notes: meta.notes,
              });
              await refresh();
              setAdding(false);
              setPicked(null);
              setMeta({ category: "", fileName: "", startDate: "", endDate: "", notes: "" });
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="file-pick">File</Label>
              <Input
                id="file-pick"
                ref={fileInput}
                type="file"
                accept={accept}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setPicked(f);
                  if (f && !meta.fileName) setMeta((m) => ({ ...m, fileName: f.name }));
                }}
              />
              {picked && picked.size > data.maxBytes && <p className="text-xs text-destructive">That file is {formatBytes(picked.size)}; the limit is {formatBytes(data.maxBytes)}.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file-category">Category</Label>
              <select id="file-category" className={selectClass} required value={meta.category} onChange={(e) => setMeta((m) => ({ ...m, category: e.target.value }))}>
                <option value="">Choose…</option>
                {data.categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="file-name">Name</Label><Input id="file-name" value={meta.fileName} onChange={(e) => setMeta((m) => ({ ...m, fileName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="file-start">Covers from</Label><Input id="file-start" type="date" value={meta.startDate} onChange={(e) => setMeta((m) => ({ ...m, startDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="file-end">Covers to (renewal due)</Label><Input id="file-end" type="date" value={meta.endDate} onChange={(e) => setMeta((m) => ({ ...m, endDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="file-notes">Notes</Label><Input id="file-notes" value={meta.notes} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !picked || !meta.category || picked.size > data.maxBytes}>{busy ? "Uploading…" : "Upload"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setPicked(null); }}>Cancel</Button>
          </div>
        </form>
      )}

      {data.files.length === 0 && !adding && (
        <div className="rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Nothing on file yet.</div>
      )}
      {[...byCategory.entries()].map(([category, files]) => (
        <section key={category} className="rounded-card border border-border bg-card">
          <h3 className="border-b border-border px-4 py-2 text-sm font-medium">{category}</h3>
          <ul className="divide-y divide-border">
            {files.map((f) => {
              const r = renewal(f, today);
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <a className="font-medium text-plum hover:underline" href={clientsApi.files.contentUrl(clientId, f.id)} download={f.fileName}>{f.fileName}</a>
                      {r && <Badge variant={r.variant}>{r.label}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 text-muted-foreground">
                      <span>{formatBytes(f.sizeBytes)}</span>
                      {f.startDate && <span>From {formatDate(f.startDate)}</span>}
                      <span>Added {formatDate(f.createdAt.slice(0, 10))}</span>
                      {f.notes && <span>{f.notes}</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await clientsApi.files.remove(clientId, f.id);
                        await refresh();
                      })
                    }
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
