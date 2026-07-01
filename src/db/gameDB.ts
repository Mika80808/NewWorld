/**
 * gameDB.ts — IndexedDB 封裝層（D6）
 *
 * 對外暴露 readSave / writeSave，
 * 呼叫方完全不需要接觸 IDBDatabase 細節。
 */

const DB_NAME    = 'rpworld_db';
const DB_VERSION = 1;
const STORE_SAVES = 'saves';

export const SLOT_DEFAULT = 'default';

// ─── 單例 DB 連線 ──────────────────────────────────────────────────────────────
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SAVES)) {
        db.createObjectStore(STORE_SAVES); // key path = slotId（外部傳入）
      }
    };

    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = ()  => {
      _dbPromise = null; // 下次可重試
      reject(req.error);
    };
  });
  return _dbPromise;
}

// ─── 寫入存檔 ─────────────────────────────────────────────────────────────────
export async function writeSave(slotId: string, data: unknown): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx    = db.transaction(STORE_SAVES, 'readwrite');
    const store = tx.objectStore(STORE_SAVES);
    const req   = store.put(data, slotId);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ─── 讀取存檔 ─────────────────────────────────────────────────────────────────
export async function readSave(slotId: string): Promise<Record<string, unknown> | null> {
  const db = await openDB();
  return new Promise<Record<string, unknown> | null>((resolve, reject) => {
    const tx    = db.transaction(STORE_SAVES, 'readonly');
    const store = tx.objectStore(STORE_SAVES);
    const req   = store.get(slotId);
    req.onsuccess = () => resolve((req.result as Record<string, unknown>) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

// ─── 刪除存檔 ─────────────────────────────────────────────────────────────────
export async function deleteSave(slotId: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx    = db.transaction(STORE_SAVES, 'readwrite');
    const store = tx.objectStore(STORE_SAVES);
    const req   = store.delete(slotId);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
