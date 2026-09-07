// lib/offline/syncEngine.ts — drains sync_queue to POST /api/sync.
//
// The server route is the single enforcement point: it authenticates the
// session, validates the payload per table, and writes through the repo,
// where the DATABASE (or the demo store's identical rules) rejects
// geofence/NMT/order/manual violations.
//
// Ordering: FIFO per RECORD. A failing record blocks only its own later
// mutations — other records keep syncing (no head-of-line blocking).
//
// NOTHING LEAVES THE DEVICE WITHOUT AN ACKNOWLEDGEMENT (review #15, #16):
//  - Transient failures (network, 5xx) back off exponentially with a cap
//    (lib/offline/backoff.ts). After SYNC_MAX_ATTEMPTS the item is PARKED in
//    the durable sync_failed table, never deleted; the user can retry it.
//  - Rule rejections (4xx with a rule code) are terminal for that payload:
//    parked with the rule text so the user can act on it.
//  - A 401 PAUSES syncing and asks for sign-in. It does not wipe: an expired
//    token must not destroy unsynced notes. Wiping is an explicit action
//    (sign-out, idle timeout, and the Admin remote wipe still to build —
//    PRODUCTION-READINESS.md §3).
//  - A note's draft is deleted only when the server acknowledges the note.
"use client";

import { db, type FailedItem, type SyncQueueItem } from "./db";
import { backoffMs, SYNC_MAX_ATTEMPTS } from "./backoff";

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  /** Parked items, newest first (durable — survives reloads). */
  failed: FailedItem[];
  lastSyncAt: Date | null;
  lastError: string | null;
  /** The server no longer accepts our session: sign in again to resume. */
  authRequired: boolean;
}

type Listener = (s: SyncState) => void;

type PushOutcome =
  | { kind: "ok" }
  | { kind: "rejected"; error: string }
  | { kind: "transient"; error: string }
  | { kind: "unauthenticated" };

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
    // Back online: retry everything now, regardless of per-item backoff.
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

  /**
   * Drain the queue. `force` ignores per-item backoff and re-probes after a
   * 401 (the Retry button, coming back online, a fresh sign-in).
   */
  async drain(opts: { force?: boolean } = {}) {
    if (this.state.syncing || !navigator.onLine) return;
    if (this.state.authRequired && !opts.force) return;
    this.set({ syncing: true, lastError: null, authRequired: false });
    clearTimeout(this.retryTimer);

    const now = Date.now();
    let nextAt: number | null = null; // earliest backoff expiry among skipped items
    try {
      const items = await db.sync_queue.orderBy("id").toArray();
      // Records whose earlier mutation failed (or is still backing off) this
      // pass: skip their later mutations to preserve per-record ordering.
      const blockedRecords = new Set<string>();

      for (const item of items) {
        const recordId = String(item.payload.id ?? "");
        if (recordId && blockedRecords.has(recordId)) continue;

        const due = item.next_attempt_at ? Date.parse(item.next_attempt_at) : 0;
        if (!opts.force && due > now) {
          nextAt = nextAt === null ? due : Math.min(nextAt, due);
          if (recordId) blockedRecords.add(recordId);
          continue;
        }

        const outcome = await this.push(item);

        if (outcome.kind === "ok") {
          await db.sync_queue.delete(item.id!);
          if (item.table === "progress_notes" || item.table === "evv_logs" || item.table === "medication_logs") {
            const row = await db.table(item.table).get(recordId);
            if (row) await db.table(item.table).put({ ...(row as object), synced: 1 });
          }
          // The note is on the server now: its draft has served its purpose.
          if (item.table === "progress_notes" && item.payload.visit_id) {
            await db.drafts.delete(`note:${String(item.payload.visit_id)}`);
          }
          continue;
        }

        if (outcome.kind === "unauthenticated") {
          // Session expired or revoked. Keep every queued item; ask for sign-in.
          this.set({ authRequired: true, lastError: "Signed out — sign in to resume syncing." });
          return;
        }

        if (outcome.kind === "rejected") {
          // Business-rule rejection — terminal for this payload. Park it with
          // the rule text; retrying unchanged can never succeed.
          await this.park(item, "rejected", outcome.error);
          if (recordId) blockedRecords.add(recordId);
          this.set({ lastError: outcome.error });
          continue;
        }

        // Transient failure: count the attempt and back off this record only.
        const attempts = item.attempts + 1;
        if (attempts >= SYNC_MAX_ATTEMPTS) {
          await this.park(item, "exhausted", outcome.error);
        } else {
          const at = Date.now() + backoffMs(attempts);
          const row = await db.sync_queue.get(item.id!);
          if (row) {
            await db.sync_queue.put({ ...row, attempts, last_error: outcome.error, next_attempt_at: new Date(at).toISOString() });
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

  /** Move a queue item to the durable failed list (one transaction: never lost in between). */
  private async park(item: SyncQueueItem, kind: FailedItem["kind"], error: string) {
    if (kind === "exhausted") console.error("[SyncEngine] parking after max attempts", item.table, error);
    await db.transaction("rw", db.sync_queue, db.sync_failed, async () => {
      await db.sync_failed.add({
        table: item.table, op: item.op, payload: item.payload, created_at: item.created_at,
        attempts: item.attempts, kind, error, failed_at: new Date().toISOString()
      });
      await db.sync_queue.delete(item.id!);
    });
  }

  /** Put a parked item back in the queue and push it now. */
  async retryFailed(id: number) {
    const f = await db.sync_failed.get(id);
    if (!f) return;
    await db.transaction("rw", db.sync_queue, db.sync_failed, async () => {
      await db.sync_queue.add({
        table: f.table, op: f.op, payload: f.payload, created_at: f.created_at,
        attempts: 0, last_error: null, next_attempt_at: null
      });
      await db.sync_failed.delete(id);
    });
    await this.refreshPending();
    void this.drain({ force: true });
  }

  async retryAllFailed() {
    const ids = (await db.sync_failed.toArray()).map((f) => f.id!).filter(Boolean);
    for (const id of ids) {
      const f = await db.sync_failed.get(id);
      if (!f) continue;
      await db.transaction("rw", db.sync_queue, db.sync_failed, async () => {
        await db.sync_queue.add({
          table: f.table, op: f.op, payload: f.payload, created_at: f.created_at,
          attempts: 0, last_error: null, next_attempt_at: null
        });
        await db.sync_failed.delete(id);
      });
    }
    await this.refreshPending();
    void this.drain({ force: true });
  }

  /**
   * Acknowledge a parked item. Only the queue copy goes: the record itself
   * stays on the device marked unsynced (synced: 0) until it is re-done or
   * an Admin resolves it.
   */
  async dismissFailed(id: number) {
    await db.sync_failed.delete(id);
    await this.refreshPending();
  }

  private async push(item: SyncQueueItem): Promise<PushOutcome> {
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: item.table,
          op: item.op,
          payload: item.payload,
          client_created_at: item.created_at
        })
      });
      if (res.ok) return { kind: "ok" };
      if (res.status === 401) return { kind: "unauthenticated" };
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      const error = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
      // 400 = the payload itself is malformed (retrying cannot fix it);
      // 403/409/422 = business-rule rejection (geofence, cap, order, CHECK…).
      if (res.status === 400 || res.status === 403 || res.status === 409 || res.status === 422) {
        return { kind: "rejected", error };
      }
      return { kind: "transient", error };
    } catch (e) {
      return { kind: "transient", error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export const SyncEngine = new SyncEngineImpl();
