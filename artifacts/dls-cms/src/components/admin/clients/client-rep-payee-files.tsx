// components/admin/clients/client-rep-payee-files.tsx — the rep payee's
// paperwork, right where the payee is recorded. The files live in the
// client's paperwork folder under the "Rep payee paperwork" category, so they
// also show on the Files tab; this is a shortcut to that one category.
// Rides clients.paperwork: the record form only shows it when that is on.
"use client";

import { useEffect, useRef, useState } from "react";
import { REP_PAYEE_FILE_CATEGORY, clientsApi, type ClientFile, type ClientFilesResponse } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "./format";

export function ClientRepPayeeFiles({ clientId }: { clientId: string }) {
  const [files, setFiles] = useState<ClientFile[] | null>(null);
  const [accept, setAccept] = useState<string>("");
  const [maxBytes, setMaxBytes] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const show = (r: ClientFilesResponse) => {
    setFiles(r.files.filter((f) => f.category === REP_PAYEE_FILE_CATEGORY));
    setAccept(r.contentTypes.join(","));
    setMaxBytes(r.maxBytes);
  };
  const load = () => clientsApi.files.list(clientId).then(show);

  useEffect(() => {
    let cancelled = false;
    clientsApi.files
      .list(clientId)
      .then((r) => {
        if (!cancelled) show(r);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function upload(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(picked)) {
        if (maxBytes && file.size > maxBytes) throw new Error(`${file.name} is larger than ${formatBytes(maxBytes)}.`);
        await clientsApi.files.upload(clientId, file, { fileName: file.name, category: REP_PAYEE_FILE_CATEGORY });
      }
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await clientsApi.files.remove(clientId, id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 sm:col-span-2 lg:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Rep payee paperwork</span>
        <div>
          <input
            ref={input}
            id="client-repPayeeFiles"
            type="file"
            multiple
            accept={accept || undefined}
            className="sr-only"
            onChange={(e) => upload(e.target.files)}
            aria-label="Upload rep payee paperwork"
          />
          <Button type="button" variant="outline" size="sm" disabled={busy || files === null} onClick={() => input.current?.click()}>
            {busy ? "Working…" : "Upload paperwork"}
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border text-sm">
        {files === null && !error && <li className="px-3 py-3 text-muted-foreground">Loading…</li>}
        {files?.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>
              <a href={clientsApi.files.contentUrl(clientId, f.id)} className="font-medium text-plum hover:underline" target="_blank" rel="noreferrer">
                {f.fileName}
              </a>
              <span className="text-muted-foreground"> · {formatBytes(f.sizeBytes)} · added {formatDate(f.createdAt.slice(0, 10))}</span>
            </span>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(f.id)}>
              Remove
            </Button>
          </li>
        ))}
        {files?.length === 0 && (
          <li className="px-3 py-3 text-muted-foreground">No rep payee paperwork on file yet. Upload the appointment letter or other documents here.</li>
        )}
      </ul>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">Uploads save right away and also appear on the Files tab.</p>
    </div>
  );
}
