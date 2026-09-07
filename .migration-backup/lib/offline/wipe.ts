// lib/offline/wipe.ts — local device wipe (lost-device protocol).
// Called on sign-out, on 401 from sync (server-side session revocation =
// remote sign-out stage), and manually. Destroys the offline DB, the
// encryption key, and SW caches. Admin-triggered per-device wipe is the
// remaining 🔴 go-live item (PRODUCTION-READINESS.md §3).
"use client";

import { db } from "./db";
import { destroyPhiKey } from "./crypto";

export async function wipeLocalData(): Promise<void> {
  try {
    await db.delete();
  } catch (e) {
    console.error("[wipe] db delete failed", e);
  }
  await destroyPhiKey();
  if (typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* cache API unavailable */
    }
  }
}
