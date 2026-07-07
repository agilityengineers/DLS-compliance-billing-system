// lib/offline/syncEngine.ts — drains sync_queue FIFO to Supabase on reconnect.
// Conflict rule: server timestamps win for CLOSED records (visit Completed/
// Billed, evv offline_locked); client timestamps win for OPEN drafts.
"use client";

import { createClient } from "@/lib/supabase/client";
import { db, type SyncQueueItem } from "./db";

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  lastError: string | null;
}

type Listener = (s: SyncState) => void;

const MAX_ATTEMPTS = 8;

class SyncEngineImpl {
  private state: SyncState = {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    syncing: false, pendingCount: 0, lastSyncAt: null, lastError: null
  };
  private listeners = new Set<Listener>();
  private started = false;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    window.addEventListener("online", () => { this.set({ online: true }); void this.drain(); });
    window.addEventListener("offline", () => this.set({ online: false }));
    void this.refreshPending();
    if (navigator.onLine) void this.drain();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState() { return this.state; }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  async refreshPending() {
    this.set({ pendingCount: await db.sync_queue.count() });
  }

  /** Drain the queue FIFO. Public so the UI retry button can call it. */
  async drain() {
    if (this.state.syncing || !navigator.onLine) return;
    this.set({ syncing: true, lastError: null });
    const supabase = createClient();
    try {
      // FIFO by insertion order (auto-increment id)
      const items = await db.sync_queue.orderBy("id").toArray();
      for (const item of items) {
        try {
          await this.push(supabase, item);
          await db.sync_queue.delete(item.id!);
          if (item.table !== "job_coaching_logs") {
            await db.table(item.table).update(item.payload.id as string, { synced: 1 });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await db.sync_queue.update(item.id!, {
            attempts: item.attempts + 1, last_error: msg
          });
          if (item.attempts + 1 >= MAX_ATTEMPTS) {
            console.error("[SyncEngine] giving up after max attempts", item, msg);
            // Leave in queue for manual retry; surface via lastError.
          }
          this.set({ lastError: msg });
          break; // stop draining on first failure to preserve FIFO ordering
        }
      }
      this.set({ lastSyncAt: new Date() });
    } finally {
      await this.refreshPending();
      this.set({ syncing: false });
    }
  }

  private async push(supabase: ReturnType<typeof createClient>, item: SyncQueueItem) {
    const { table, op, payload } = item;
    if (op === "insert") {
      // uuid PK minted offline → upsert is idempotent across retries.
      const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
      if (error) throw new Error(error.message);
      return;
    }
    // UPDATE — conflict resolution:
    const id = payload.id as string;
    const { data: server, error: readErr } = await supabase
      .from(table).select("updated_at,*").eq("id", id).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (server) {
      const closed = isClosedRecord(table, server as Record<string, unknown>);
      const serverNewer = new Date(server.updated_at as string) > new Date(item.created_at);
      if (closed && serverNewer) {
        // Server wins for closed records: drop the local mutation, keep server copy.
        if (table !== "job_coaching_logs") {
          await db.table(table).put({ ...(server as object), synced: 1 } as never);
        }
        return;
      }
    }
    // Open draft → client wins.
    const { error } = await supabase.from(table).update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  }
}

function isClosedRecord(table: SyncQueueItem["table"], row: Record<string, unknown>): boolean {
  if (table === "evv_logs") return row.offline_locked === true;
  if (table === "medication_logs") return row.status === "Administered";
  // progress_notes: closed once both signatures are captured server-side
  return Boolean(row.caregiver_signature_data && row.client_signature_data);
}

export const SyncEngine = new SyncEngineImpl();
