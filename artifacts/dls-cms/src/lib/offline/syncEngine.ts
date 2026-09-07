// Durable in-browser sync for the migrated Vite app. Mutations are validated
// and sent through the same repository/rule layer in-process.
//
// Ordering: FIFO per RECORD. A failing record blocks only its own later
// mutations — other records keep syncing (no head-of-line blocking).
// Nothing leaves the device without an acknowledgement: terminal failures
// are parked durably, transient failures use capped exponential backoff, and
// an expired session pauses syncing without wiping unsynced work.
"use client";

import { db, type FailedItem, type SyncQueueItem } from "./db";
import { backoffMs, SYNC_MAX_ATTEMPTS } from "./backoff";
import { pushMutation, type PushOutcome } from "./field-api";

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  failed: FailedItem[];
  lastSyncAt: Date | null;
  lastError: string | null;
  authRequired: boolean;
}

type Listener = (s: SyncState) => void;

class SyncEngineImpl {
  private state: SyncState = {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    syncing: false, pendingCount: 0, failed: [], lastSyncAt: null, lastError: null, authRequired: false
  };
  private listeners = new Set<Listener>();
  private started = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    window.addEventListener("online", () => { this.set({ online: true }); void this.drain({ force: true }); });
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
    const [pendingCount, failed] = await Promise.all([
      db.sync_queue.count(),
      db.sync_failed.orderBy("failed_at").reverse().toArray()
    ]);
    this.set({ pendingCount, failed });
  }

  /** Force ignores backoff and probes again after a fresh sign-in. */
  async drain(opts: { force?: boolean } = {}) {
    if (this.state.syncing || !navigator.onLine) return;
    if (this.state.authRequired && !opts.force) return;
    this.set({ syncing: true, lastError: null, authRequired: false });
    clearTimeout(this.retryTimer);

    const now = Date.now();
    let nextAt: number | null = null;
    try {
      const items = await db.sync_queue.orderBy("id").toArray();
      // Records whose earlier mutation failed this pass: skip their later
      // mutations to preserve per-record ordering.
      const blockedRecords = new Set<string>();

      for (const item of items) {
        const recordId = String(item.payload.id ?? "");
        if (recordId && blockedRecords.has(recordId)) continue;
        const eligibleAt = item.next_attempt_at ? Date.parse(item.next_attempt_at) : 0;
        if (!opts.force && eligibleAt > now) {
          nextAt = nextAt === null ? eligibleAt : Math.min(nextAt, eligibleAt);
          continue;
        }

        const outcome = await this.push(item);

        if (outcome.kind === "ok") {
          await db.sync_queue.delete(item.id!);
          if (item.table === "progress_notes" || item.table === "evv_logs" || item.table === "medication_logs") {
            const row = await db.table(item.table).get(recordId);
            if (row) await db.table(item.table).put({ ...(row as object), synced: 1 });
          }
          if (item.table === "progress_notes") {
            const visitId = String(item.payload.visit_id ?? "");
            if (visitId) await db.drafts.delete(`note:${visitId}`);
          }
          continue;
        }

        if (outcome.kind === "unauthenticated") {
          this.set({ authRequired: true, lastError: "Sign in again to sync work kept on this device." });
          return;
        }

        if (outcome.kind === "rejected") {
          await this.park(item, "rejected", outcome.error);
          this.set({ lastError: outcome.error });
          if (recordId) blockedRecords.add(recordId);
          continue;
        }

        // Transient failure: count the attempt, block this record only.
        const attempts = item.attempts + 1;
        if (attempts >= SYNC_MAX_ATTEMPTS) {
          await this.park({ ...item, attempts }, "exhausted", outcome.error);
        } else {
          const at = Date.now() + backoffMs(attempts);
          const row = await db.sync_queue.get(item.id!);
          if (row) {
            await db.sync_queue.put({
              ...row, attempts, last_error: outcome.error,
              next_attempt_at: new Date(at).toISOString()
            });
          }
          nextAt = nextAt === null ? at : Math.min(nextAt, at);
        }
        if (recordId) blockedRecords.add(recordId);
        this.set({ lastError: outcome.error });
      }
      this.set({ lastSyncAt: new Date() });
    } finally {
      await this.refreshPending();
      this.set({ syncing: false });
      if (nextAt !== null && navigator.onLine && !this.state.authRequired) {
        this.retryTimer = setTimeout(() => void this.drain(), Math.max(1_000, nextAt - Date.now()));
      }
    }
  }

  private async park(item: SyncQueueItem, kind: FailedItem["kind"], error: string) {
    await db.transaction("rw", db.sync_queue, db.sync_failed, async () => {
      await db.sync_failed.add({
        table: item.table, op: item.op, payload: item.payload,
        created_at: item.created_at, attempts: item.attempts,
        kind, error, failed_at: new Date().toISOString()
      });
      await db.sync_queue.delete(item.id!);
    });
  }

  async retryFailed(id: number) {
    const failed = await db.sync_failed.get(id);
    if (!failed) return;
    await db.transaction("rw", db.sync_queue, db.sync_failed, async () => {
      await db.sync_queue.add({
        table: failed.table, op: failed.op, payload: failed.payload,
        created_at: failed.created_at, attempts: 0, last_error: null, next_attempt_at: null
      });
      await db.sync_failed.delete(id);
    });
    await this.refreshPending();
    void this.drain({ force: true });
  }

  async dismissFailed(id: number) {
    await db.sync_failed.delete(id);
    await this.refreshPending();
  }

  private async push(item: SyncQueueItem): Promise<PushOutcome> {
    try {
      return await pushMutation({
        table: item.table,
        op: item.op,
        payload: item.payload as Record<string, unknown> & { id: string },
        client_created_at: item.created_at
      });
    } catch (e) {
      return { kind: "transient", error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export const SyncEngine = new SyncEngineImpl();
