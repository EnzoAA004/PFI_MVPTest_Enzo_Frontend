const memory = new Map<string, string>();
const DB_NAME = "lumbar-mri-analysis-storage";
const STORE_NAME = "kv";
const DB_VERSION = 1;

type StoreMode = "readonly" | "readwrite";

function hasIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
  });
}

async function withStore<T>(mode: StoreMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB operation failed"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
  });
}

export async function asyncGetItem(key: string): Promise<string | null> {
  try {
    const value = await withStore<string | undefined>("readonly", (store) => store.get(key));
    return value ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export async function asyncSetItem(key: string, value: string): Promise<void> {
  memory.set(key, value);
  try {
    await withStore<IDBValidKey>("readwrite", (store) => store.put(value, key));
  } catch {
    // Memory fallback keeps the app usable when IndexedDB is unavailable.
  }
}

export async function asyncRemoveItem(key: string): Promise<void> {
  memory.delete(key);
  try {
    await withStore<undefined>("readwrite", (store) => store.delete(key));
  } catch {
    // Best-effort cleanup.
  }
}
