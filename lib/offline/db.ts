// lib/offline/db.ts — Dexie (IndexedDB) schema. Client-side source of truth
// for the field app, hydrated from /api/field/bootstrap for offline reads.
//
// ENCRYPTION AT REST: a DBCore middleware folds every non-indexed property
// into an AES-GCM box (`box`), so PHI (narratives, signatures, GPS, med
// details) is never stored in cleartext. Indexed keys (uuids, dates, flags)
// stay plaintext — they're lookup keys, not PHI payloads.
// CAVEAT: cursor-based APIs (.modify/.each/Table.update) bypass decryption —
// use get/put/toArray/first in app code (enforced by convention here).
import Dexie, { type Table } from "dexie";
import { encryptJson, decryptJson, isEncryptedBox, type EncryptedBox } from "./crypto";
import type { Client, EvvLog, MedicationLog, NmtTrip, ProgressNote, Visit } from "@/lib/supabase/types";

export interface SyncQueueItem {
  id?: number; // auto-increment
  table: "progress_notes" | "evv_logs" | "medication_logs" | "job_coaching_logs" | "nmt_trips" | "visits";
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

type Local<T> = T & { synced?: 0 | 1 };

/** Fields kept OUTSIDE the encryption box per table (all indexed keys). */
const PLAINTEXT_FIELDS: Record<string, string[]> = {
  progress_notes: ["id", "visit_id", "client_id", "staff_id", "date", "synced"],
  evv_logs: ["id", "visit_id", "synced"],
  medication_logs: ["id", "client_id", "scheduled_time", "synced"],
  visits: ["id", "staff_id", "client_id", "scheduled_start", "status"],
  clients: ["id"],
  nmt_trips: ["id", "client_id", "trip_date"],
  sync_queue: ["id", "table", "op", "created_at", "attempts", "last_error"],
  drafts: ["key", "updated_at"]
};

async function encryptRow(tableName: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const plainKeys = PLAINTEXT_FIELDS[tableName];
  if (!plainKeys || typeof window === "undefined") return row;
  if (isEncryptedBox(row.box)) return row; // already encrypted
  const out: Record<string, unknown> = {};
  const secret: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (plainKeys.includes(k)) out[k] = v;
    else secret[k] = v;
  }
  out.box = await encryptJson(secret);
  return out;
}

async function decryptRow<T>(tableName: string, row: unknown): Promise<T> {
  if (!row || typeof row !== "object") return row as T;
  const r = row as Record<string, unknown>;
  if (!isEncryptedBox(r.box)) return row as T;
  const secret = await decryptJson<Record<string, unknown>>(r.box as EncryptedBox);
  const { box, ...plain } = r;
  void box;
  return { ...plain, ...secret } as T;
}

export class DlsDb extends Dexie {
  progress_notes!: Table<Local<ProgressNote>, string>;
  evv_logs!: Table<Local<EvvLog>, string>;
  medication_logs!: Table<Local<MedicationLog>, string>;
  visits!: Table<Visit & { client_name?: string }, string>;
  clients!: Table<Client, string>;
  nmt_trips!: Table<NmtTrip, string>;
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
    // v2: reference mirrors for offline reads (Today / Week / visit detail)
    this.version(2).stores({
      visits: "id, staff_id, client_id, scheduled_start, status",
      clients: "id"
    });
    // v3: NMT trips mirror (per-client weekly cap shown offline)
    this.version(3).stores({
      nmt_trips: "id, client_id, trip_date"
    });

    // Encryption middleware — see file header.
    this.use({
      stack: "dbcore",
      name: "phi-encryption",
      create: (down) => ({
        ...down,
        table: (name: string) => {
          const t = down.table(name);
          if (!PLAINTEXT_FIELDS[name]) return t;
          return {
            ...t,
            mutate: async (req) => {
              if (req.type === "add" || req.type === "put") {
                const values = await Promise.all(
                  req.values.map((v) => encryptRow(name, v as Record<string, unknown>))
                );
                return t.mutate({ ...req, values } as typeof req);
              }
              return t.mutate(req);
            },
            get: async (req) => decryptRow(name, await t.get(req)),
            getMany: async (req) => {
              const rows = await t.getMany(req);
              return Promise.all(rows.map((r) => decryptRow(name, r)));
            },
            query: async (req) => {
              const res = await t.query(req);
              if (req.values && Array.isArray(res.result)) {
                const result = await Promise.all(res.result.map((r) => decryptRow(name, r)));
                return { ...res, result };
              }
              return res;
            }
          };
        }
      })
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
  const mirrored =
    table === "progress_notes" || table === "evv_logs" || table === "medication_logs" || table === "visits";
  await db.transaction("rw", [db.table(mirrored ? table : "sync_queue"), db.sync_queue], async () => {
    if (mirrored) {
      if (table === "visits") {
        // Status-only mutation: merge over the mirrored visit row.
        const existing = await db.visits.get(payload.id);
        await db.visits.put({ ...(existing ?? {}), ...payload } as never);
      } else {
        await db.table(table).put({ ...payload, synced: 0 });
      }
    }
    await db.sync_queue.add({
      table, op, payload,
      created_at: new Date().toISOString(),
      attempts: 0, last_error: null
    });
  });
}
