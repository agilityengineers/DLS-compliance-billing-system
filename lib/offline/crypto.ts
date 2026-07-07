// lib/offline/crypto.ts — at-rest encryption for offline PHI (lost-device
// protocol stage 1, PRODUCTION-READINESS.md §3).
//
// XSalsa20-Poly1305 via tweetnacl — SYNCHRONOUS by design: the Dexie
// encryption middleware runs inside IndexedDB transactions and liveQuery
// zones, where awaiting foreign promises (WebCrypto) auto-commits/aborts
// transactions. Synchronous authenticated encryption is the same approach
// dexie-encrypted uses. The data key is random 32 bytes kept in a separate
// IndexedDB database and loaded once at DB-open.
// LIMITATION (documented, gated before pilot): the key lives on-device;
// the 🔴 PIN/biometric key-wrap closes that and is a go-live item.
"use client";

import nacl from "tweetnacl";

const KEY_DB = "dls-cms-keys";
const KEY_STORE = "keys";
const KEY_ID = "phi-at-rest-v2";

let cachedKey: Uint8Array | null = null;

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(KEY_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<Uint8Array | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readonly");
    const req = tx.objectStore(KEY_STORE).get(key);
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    tx.objectStore(KEY_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load (or create) the data key. Called ONCE from db.on('ready') — before
 *  any encrypted read/write, so the sync seal/open paths never wait. */
export async function ensurePhiKey(): Promise<void> {
  if (cachedKey) return;
  const db = await openKeyDb();
  try {
    let key = await idbGet(db, KEY_ID);
    if (!key || key.length !== nacl.secretbox.keyLength) {
      key = crypto.getRandomValues(new Uint8Array(nacl.secretbox.keyLength));
      await idbPut(db, KEY_ID, key);
    }
    cachedKey = key;
  } finally {
    db.close();
  }
}

export interface EncryptedBox {
  __enc: true;
  nonce: number[];
  data: number[];
}

export function isEncryptedBox(v: unknown): v is EncryptedBox {
  return !!v && typeof v === "object" && (v as EncryptedBox).__enc === true;
}

/** Synchronous authenticated encryption. Requires ensurePhiKey() to have run. */
export function sealJson(value: unknown): EncryptedBox {
  if (!cachedKey) throw new Error("PHI key not loaded — ensurePhiKey() must run at DB open.");
  const nonce = crypto.getRandomValues(new Uint8Array(nacl.secretbox.nonceLength));
  const plaintext = new TextEncoder().encode(JSON.stringify(value ?? null));
  const cipher = nacl.secretbox(plaintext, nonce, cachedKey);
  return { __enc: true, nonce: Array.from(nonce), data: Array.from(cipher) };
}

/** Synchronous authenticated decryption. Throws on tamper/wrong key. */
export function openJson<T>(box: EncryptedBox): T {
  if (!cachedKey) throw new Error("PHI key not loaded — ensurePhiKey() must run at DB open.");
  const plain = nacl.secretbox.open(
    new Uint8Array(box.data),
    new Uint8Array(box.nonce),
    cachedKey
  );
  if (!plain) throw new Error("PHI decryption failed (tampered or wrong key).");
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Deletes the encryption key DB — part of the local wipe. */
export function destroyPhiKey(): Promise<void> {
  cachedKey = null;
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(KEY_DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
