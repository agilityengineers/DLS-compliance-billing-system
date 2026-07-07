// components/field/upload-panel.tsx — photo/document upload → S3 with
// explicit "Uploading → Synced" states; files appear on desktop Documents.
// In demo mode no bytes leave the browser (labeled; PRODUCTION-READINESS §4).
"use client";

import { useRef, useState } from "react";
import { Camera, FileText, Check, CloudUpload, AlertTriangle } from "lucide-react";

interface UploadItem {
  documentId: string;
  fileName: string;
  status: "uploading" | "synced" | "error";
  error?: string;
}

export function UploadPanel({ visitId, clientId }: { visitId: string; clientId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);

  async function onPick(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    if (inputRef.current) inputRef.current.value = "";

    const temp: UploadItem = { documentId: crypto.randomUUID(), fileName: file.name, status: "uploading" };
    setItems((xs) => [temp, ...xs]);

    const patch = (p: Partial<UploadItem>) =>
      setItems((xs) => xs.map((x) => (x.documentId === temp.documentId ? { ...x, ...p } : x)));

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name, contentType: file.type || "application/octet-stream",
          sizeBytes: file.size, clientId, visitId
        })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
      const { documentId, uploadUrl } = (await res.json()) as { documentId: string; uploadUrl: string | null };
      patch({ documentId });

      if (uploadUrl) {
        const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!put.ok) throw new Error(`Storage PUT failed (${put.status})`);
      } else {
        // DEMO: simulate transfer time so the Uploading state is visible.
        await new Promise((r) => setTimeout(r, 1200));
      }

      const confirm = await fetch("/api/uploads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, status: "synced" })
      });
      if (!confirm.ok) throw new Error("Failed to confirm upload");
      patch({ status: "synced" });
    } catch (e) {
      patch({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <section className="space-y-3 rounded-card-m border border-border bg-card p-4">
      <h2 className="label-caps text-muted-foreground">Photos &amp; documents</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-btn border border-border bg-card p-3 text-sm font-medium active:bg-muted">
          <Camera className="h-4 w-4" /> Photo
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPick(e.target.files)} />
        </label>
        <label className="flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-btn border border-border bg-card p-3 text-sm font-medium active:bg-muted">
          <FileText className="h-4 w-4" /> Document
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => void onPick(e.target.files)} />
        </label>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.documentId} className="flex items-center justify-between gap-3 rounded-btn bg-muted px-3 py-2 text-sm">
              <span className="truncate">{item.fileName}</span>
              {item.status === "uploading" && (
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-plum">
                  <CloudUpload className="h-3.5 w-3.5 animate-pulse" /> Uploading…
                </span>
              )}
              {item.status === "synced" && (
                <span className="flex shrink-0 items-center gap-1.5 rounded-pill bg-pill-success px-2 py-0.5 text-xs font-medium text-pill-success-fg">
                  <Check className="h-3.5 w-3.5" /> Synced
                </span>
              )}
              {item.status === "error" && (
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-pill-danger-fg" title={item.error}>
                  <AlertTriangle className="h-3.5 w-3.5" /> Failed
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Uploads sync to secure storage (S3) and appear on the desktop Documents screen.
      </p>
    </section>
  );
}
