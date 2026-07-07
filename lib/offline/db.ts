// lib/offline/db.ts — Dexie (IndexedDB) schema. Client-side source of truth
// for the field app. Mirrors progress_notes, evv_logs, medication_logs and
// adds a sync_queue + drafts store.
import Dexie, { type Table } from "dexie";
import type { ProgressNote, EvvLog, MedicationLog } from "@/lib/supabase/types";

export interface SyncQueueItem {
  id?: number; // auto-increment
  table: "progress_notes" | "evv_logs" | "medication_logs" | "job_coaching_logs";
  op: "insert" | "update";
  payload: Record<string, unknown>; // includes signature data URLs + GPS coords
  created_at: string; // ISO — client timestamp, used for open-draft conflict wins
  attempts: number;
  last_error: string | null;
}

export interface Draft {
  key: string; // e.g. `note:${visitId}`
  data: Record<string, unknown>;
  updated_at: string;
}

/** Local rows carry a sync flag; `local_id` is a UUID minted offline that
 *  becomes the server row id (uuid PKs make offline-first idempotent). */
type Local<T> = T & { synced?: 0 | 1 };

export class DlsDb extends Dexie {
  progress_notes!: Table<Local<ProgressNote>, string>;
  evv_logs!: Table<Local<EvvLog>, string>;
  medication_logs!: Table<Local<MedicationLog>, string>;
  sync_queue!: Table<SyncQueueItem, number>;
  drafts!: Table<Draft, string>;

  constructor() {
    super("dls-cms");
    this.version(1).stores({
      progress_notes: "id, visit_id, client_id, staff_id, date, synced",
      evv_logs: "id, visit_id, synced",
      medication_logs: "id, client_id, scheduled_time, synced",
      sync_queue: "++id, table, created_at",
      drafts: "key, updated_at"
    });
  }
}

export const db = new DlsDb();

export function newLocalId(): string {
  return crypto.randomUUID();
}

/** Write locally AND enqueue for sync — the one write path for field mutations. */
export async function writeLocal(
  table: SyncQueueItem["table"],
  op: SyncQueueItem["op"],
  payload: Record<string, unknown> & { id: string }
) {
  await db.transaction("rw", [db.table(table === "job_coaching_logs" ? "sync_queue" : table), db.sync_queue], async () => {
    if (table !== "job_coaching_logs") {
      await db.table(table).put({ ...payload, synced: 0 });
    }
    await db.sync_queue.add({
      table, op, payload,
      created_at: new Date().toISOString(),
      attempts: 0, last_error: null
    });
  });
}
