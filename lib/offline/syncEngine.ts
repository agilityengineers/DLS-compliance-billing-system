// lib/offline/syncEngine.ts — drains sync_queue to POST /api/sync.
//
// The server route is the single enforcement point: it authenticates the
// session and writes through the repo, where the DATABASE (or the demo
// store's identical rules) rejects geofence/NMT/order/manual violations.
//
// Ordering: FIFO per RECORD. A failing record blocks only its own later
// mutations — other records keep syncing (no head-of-line blocking).
// Rule rejections (4xx with a code) are terminal: the item moves out of the
// queue and surfaces to the user instead of retrying forever.
// A 401 means the session was revoked → local wipe + sign-in (remote
// sign-out hook, lost-device protocol).
"use client";

import { db, type SyncQueueItem } from "./db";
import { wipeLocalData } from "./wipe";

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  lastError: string | null;
  rejected: { table: string; error: string }[];
}

type Listener = (s: SyncState) => void;

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 5_000;

class SyncEngineImpl {
  private state: SyncState = {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    syncing: false, pendingCount: 0, lastSyncAt: null, lastError: null, rejected: []
  };
  private listeners = new Set<Listener>();
  private started = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

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

  /** Drain the queue. Public so the UI retry button can call it. */
  async drain() {
    if (this.state.syncing || !navigator.onLine) return;
    this.set({ syncing: true, lastError: null });
    clearTimeout(this.retryTimer);

    let scheduleRetry = false;
    try {
      const items = await db.sync_queue.orderBy("id").toArray();
      // Records whose earlier mutation failed this pass: skip their later
      // mutations to preserve per-record ordering.
      const blockedRecords = new Set<string>();

      for (const item of items) {
        const recordId = String(item.payload.id ?? "");
        if (recordId && blockedRecords.has(recordId)) continue;

        const outcome = await this.push(item);

        if (outcome.kind === "ok") {
          await db.sync_queue.delete(item.id!);
          if (item.table === "progress_notes" || item.table === "evv_logs" || item.table === "medication_logs") {
            const row = await db.table(item.table).get(recordId);
            if (row) await db.table(item.table).put({ ...(row as object), synced: 1 });
          }
          continue;
        }

        if (outcome.kind === "unauthenticated") {
          // Session revoked server-side → remote sign-out: wipe and re-auth.
          await wipeLocalData();
          window.location.href = "/login?error=session_revoked";
          return;
        }

        if (outcome.kind === "rejected") {
          // Business-rule rejection — terminal. Remove from the queue and
          // surface; retrying can never succeed.
          await db.sync_queue.delete(item.id!);
          this.set({
            rejected: [...this.state.rejected.slice(-4), { table: item.table, error: outcome.error }],
            lastError: outcome.error
          });
          if (recordId) blockedRecords.add(recordId);
          continue;
        }

        // Transient failure: count the attempt, block this record only.
        const attempts = item.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          console.error("[SyncEngine] giving up after max attempts", item.table, outcome.error);
          await db.sync_queue.delete(item.id!);
          this.set({
            rejected: [...this.state.rejected.slice(-4), { table: item.table, error: `Gave up after ${MAX_ATTEMPTS} attempts: ${outcome.error}` }]
          });
        } else {
          const row = await db.sync_queue.get(item.id!);
          if (row) await db.sync_queue.put({ ...row, attempts, last_error: outcome.error });
          scheduleRetry = true;
        }
        if (recordId) blockedRecords.add(recordId);
        this.set({ lastError: outcome.error });
      }
      this.set({ lastSyncAt: new Date() });
    } finally {
      await this.refreshPending();
      this.set({ syncing: false });
      if (scheduleRetry && navigator.onLine) {
        this.retryTimer = setTimeout(() => void this.drain(), BACKOFF_BASE_MS + Math.random() * 5_000);
      }
    }
  }

  clearRejected() {
    this.set({ rejected: [], lastError: null });
  }

  private async push(item: SyncQueueItem): Promise<
    { kind: "ok" } | { kind: "rejected"; error: string } | { kind: "transient"; error: string } | { kind: "unauthenticated" }
  > {
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
      // 409/422 = business-rule rejection (geofence, NMT cap, order, CHECK…)
      if (res.status === 409 || res.status === 422 || res.status === 403) {
        return { kind: "rejected", error };
      }
      return { kind: "transient", error };
    } catch (e) {
      return { kind: "transient", error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export const SyncEngine = new SyncEngineImpl();
