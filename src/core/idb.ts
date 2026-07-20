/** Minimal promise wrapper over one IndexedDB key-value store. */

const DB_NAME = "frame";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise(function (res, rej) {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE); };
    rq.onsuccess = function () { res(rq.result); };
    rq.onerror = function () { rej(rq.error); };
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>(function (res, rej) {
    try {
      const t = db.transaction(STORE, mode);
      const rq = fn(t.objectStore(STORE));
      t.oncomplete = function () { res(rq.result as T); db.close(); };
      t.onerror = function () { rej(t.error); db.close(); };
      t.onabort = function () { rej(t.error); db.close(); };
    } catch (e) {
      db.close(); // sync throws (clone failures etc.) must not leak the connection
      rej(e);
    }
  });
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return tx<T | undefined>("readonly", function (s) { return s.get(key); });
}
export function idbSet(key: string, val: unknown): Promise<void> {
  return tx<void>("readwrite", function (s) { return s.put(val, key); });
}
export function idbDel(key: string): Promise<void> {
  return tx<void>("readwrite", function (s) { return s.delete(key); });
}
