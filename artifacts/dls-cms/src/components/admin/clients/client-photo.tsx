// components/admin/clients/client-photo.tsx — the photo on the client's face
// sheet, so whoever opens the record can recognise the person they serve.
// One photo per client: uploading again replaces it. Rides clients.core, like
// the rest of the face sheet.
"use client";

import { useRef, useState } from "react";
import { CLIENT_PHOTO_CONTENT_TYPES, CLIENT_PHOTO_MAX_BYTES, clientsApi, type ClientRecord } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { formatBytes } from "./format";

/** Why a picked file cannot be the photo, or null when it can. Checked again by the API. */
export function photoProblem(file: File): string | null {
  if (!(CLIENT_PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type)) return "Choose a JPEG, PNG or WebP image.";
  if (file.size > CLIENT_PHOTO_MAX_BYTES) return `That photo is ${formatBytes(file.size)}; the limit is ${formatBytes(CLIENT_PHOTO_MAX_BYTES)}.`;
  return null;
}

export const PHOTO_ACCEPT = CLIENT_PHOTO_CONTENT_TYPES.join(",");

/** The frame the photo sits in, or the client's initials when there is none. */
export function PhotoFrame({ src, initials, size = "lg" }: { src: string | null; initials: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-28 w-28 text-2xl" : "h-20 w-20 text-xl";
  return (
    <div className={`${box} shrink-0 overflow-hidden rounded-card border border-border bg-muted`}>
      {src ? (
        // A same-origin, authenticated image; next/image would add nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Client photo" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-semibold text-muted-foreground" aria-label="No photo on file">
          {initials}
        </div>
      )}
    </div>
  );
}

export function ClientPhoto({ client, onSaved }: { client: ClientRecord; onSaved: (c: ClientRecord) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const initials = `${client.firstName.charAt(0)}${client.lastName.charAt(0)}`.toUpperCase();
  const src = client.photoUpdatedAt ? clientsApi.photo.url(client.id, client.photoUpdatedAt) : null;

  async function run(fn: () => Promise<{ client: ClientRecord }>) {
    setBusy(true);
    setError(null);
    try {
      onSaved((await fn()).client);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <PhotoFrame src={src} initials={initials} />
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        className="sr-only"
        aria-label="Client photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const problem = photoProblem(file);
          if (problem) {
            setError(problem);
            return;
          }
          void run(() => clientsApi.photo.upload(client.id, file));
        }}
      />
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Saving…" : src ? "Change photo" : "Upload photo"}
        </Button>
        {src && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => clientsApi.photo.remove(client.id))}>
            Remove
          </Button>
        )}
      </div>
      {error && <p className="max-w-[14rem] text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
