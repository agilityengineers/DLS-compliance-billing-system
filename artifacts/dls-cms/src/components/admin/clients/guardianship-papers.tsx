// components/admin/clients/guardianship-papers.tsx — the paperwork a
// guardian's authority rests on (letters of guardianship, the court order),
// uploaded from the Guardian part of the record, and the same for a rep
// payee's paperwork from the Rep payee part. Each rides the record itself, so
// it works whether or not the Files tab is switched on; what is uploaded here
// is filed under its own category and shows on that tab too.
//
// It sits inside the record's <form>, so it is a plain block with buttons of
// type="button": nothing here submits or is submitted with the record.
"use client";

import { useEffect, useRef, useState } from "react";
import { clientsApi, type ClientFile } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { daysUntil, formatBytes, formatDate } from "./format";

type Listing = { files: ClientFile[]; maxBytes: number; contentTypes: string[] };
type PapersApi = typeof clientsApi.guardianshipPapers;

/** What changes between the guardian's papers and the rep payee's. */
interface PapersKind {
  api: PapersApi;
  idPrefix: string;
  title: string;
  description: string;
  empty: string;
}

export function GuardianshipPapers({ clientId, today }: { clientId: string; today: string }) {
  return (
    <RecordPapers
      clientId={clientId}
      today={today}
      kind={{
        api: clientsApi.guardianshipPapers,
        idPrefix: "guardian-papers",
        title: "Guardianship papers",
        description: "Letters of guardianship or the court order.",
        empty: "No guardianship papers on file yet.",
      }}
    />
  );
}

export function RepPayeePapers({ clientId, today }: { clientId: string; today: string }) {
  return (
    <RecordPapers
      clientId={clientId}
      today={today}
      kind={{
        api: clientsApi.repPayeePapers,
        idPrefix: "rep-payee-papers",
        title: "Rep payee paperwork",
        description: "The payee appointment letter or other documents for the arrangement.",
        empty: "No rep payee paperwork on file yet.",
      }}
    />
  );
}

function RecordPapers({ clientId, today, kind }: { clientId: string; today: string; kind: PapersKind }) {
  const { api } = kind;
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
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
  }, [clientId, api]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setData(await api.list(clientId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const tooBig = picked !== null && data !== null && picked.size > data.maxBytes;

  return (
    <div className="space-y-3 border-t border-border p-4">
      <div>
        <h3 className="text-sm font-medium">{kind.title}</h3>
        <p className="text-xs text-muted-foreground">
          {kind.description} Uploads save straight away{data ? `, up to ${formatBytes(data.maxBytes)} each` : ""}; you don’t need to press Save record for them.
        </p>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {data && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {data.files.map((f) => {
            const left = daysUntil(f.endDate, today);
            return (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 space-x-2">
                  <a className="font-medium text-plum hover:underline" href={api.contentUrl(clientId, f.id)}>{f.fileName}</a>
                  <span className="text-muted-foreground">{formatBytes(f.sizeBytes)} · added {formatDate(f.createdAt.slice(0, 10))}</span>
                  {f.endDate && left !== null && left < 0 && <Badge variant="destructive">Expired {formatDate(f.endDate)}</Badge>}
                  {f.endDate && left !== null && left >= 0 && <span className="text-muted-foreground">valid to {formatDate(f.endDate)}</span>}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(() => api.remove(clientId, f.id).then(() => undefined))}
                >
                  Remove
                </Button>
              </li>
            );
          })}
          {data.files.length === 0 && <li className="px-3 py-3 text-muted-foreground">{kind.empty}</li>}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor={`${kind.idPrefix}-file`}>Add a document</Label>
          <Input
            id={`${kind.idPrefix}-file`}
            ref={fileInput}
            type="file"
            accept={data?.contentTypes.join(",")}
            onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${kind.idPrefix}-end`}>Valid until (optional)</Label>
          <Input id={`${kind.idPrefix}-end`} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !picked || tooBig}
          onClick={() => {
            if (!picked) return;
            const file = picked;
            void run(async () => {
              await api.upload(clientId, file, { fileName: file.name, endDate });
              setPicked(null);
              setEndDate("");
              if (fileInput.current) fileInput.current.value = "";
            });
          }}
        >
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {tooBig && data && picked && (
        <p className="text-xs text-destructive">That file is {formatBytes(picked.size)}; the limit is {formatBytes(data.maxBytes)}.</p>
      )}
    </div>
  );
}
