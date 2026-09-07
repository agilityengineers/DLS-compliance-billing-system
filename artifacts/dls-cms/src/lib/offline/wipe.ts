// lib/offline/wipe.ts — local device wipe (lost-device protocol).
// Called only by explicit sign-out/wipe and field idle timeout. A sync 401
// pauses for reauthentication and never destroys unsynced work.
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
