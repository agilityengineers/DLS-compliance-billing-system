// lib/offline/useAutoSave.ts — persist form state to (encrypted) IndexedDB on
// every change (debounced 800ms) AND on a 15s interval safety net.
// `enabled` guards against overwriting a stored draft with the initial state
// before restoration has finished.
"use client";

import { useEffect, useRef, useState } from "react";
import { db } from "./db";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutoSave<T extends Record<string, unknown>>(
  formState: T,
  key: string,
  enabled = true
) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const latest = useRef(formState);
  latest.current = formState;
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const persist = async () => {
    try {
      setStatus("saving");
      await db.drafts.put({ key, data: latest.current, updated_at: new Date().toISOString() });
      setStatus("saved");
      setLastSavedAt(new Date());
    } catch (e) {
      console.error("[useAutoSave]", e);
      setStatus("error");
    }
  };

  // Debounced save on every field change
  useEffect(() => {
    if (!enabled) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(persist, 800);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState, key, enabled]);

  // 15-second interval safety net
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(persist, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { status, lastSavedAt };
}

/** Restore a previously auto-saved draft (call once on mount). */
export async function loadDraft<T>(key: string): Promise<T | null> {
  const d = await db.drafts.get(key);
  return (d?.data as T) ?? null;
}
