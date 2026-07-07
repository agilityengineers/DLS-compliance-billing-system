// lib/offline/crypto.ts — at-rest encryption for offline PHI (lost-device
// protocol stage 1, PRODUCTION-READINESS.md §3).
//
// AES-GCM via WebCrypto. The key is generated NON-EXTRACTABLE and stored as
// a CryptoKey object in its own IndexedDB database — the raw key material
// never exists in JS and can't be lifted from disk. LIMITATION (documented,
// gated before pilot): someone holding the unlocked device can still use the
// key; the PIN/biometric wrap closes that and is a 🔴 go-live item.
"use client";

const KEY_DB = "dls-cms-keys";
const KEY_STORE = "keys";
const KEY_ID = "phi-at-rest-v1";

let cachedKey: CryptoKey | null = null;

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(KEY_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readonly");
    const req = tx.objectStore(KEY_STORE).get(key);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    tx.objectStore(KEY_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPhiKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const db = await openKeyDb();
  try {
    let key = await idbGet(db, KEY_ID);
    if (!key) {
      key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await idbPut(db, KEY_ID, key);
    }
    cachedKey = key;
    return key;
  } finally {
    db.close();
  }
}

export interface EncryptedBox {
  __enc: true;
  iv: number[];
  data: number[];
}

export function isEncryptedBox(v: unknown): v is EncryptedBox {
  return !!v && typeof v === "object" && (v as EncryptedBox).__enc === true;
}

export async function encryptJson(value: unknown): Promise<EncryptedBox> {
  const key = await getPhiKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value ?? null));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { __enc: true, iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) };
}

export async function decryptJson<T>(box: EncryptedBox): Promise<T> {
  const key = await getPhiKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(box.iv) },
    key,
    new Uint8Array(box.data)
  );
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
