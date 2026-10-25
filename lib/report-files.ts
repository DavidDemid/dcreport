const DB_NAME = "dc-crm-analytics";
const DB_VERSION = 1;
const FILE_STORE = "files";

type ReportFile = {
  key: string;
  name: string;
  buffer: ArrayBuffer;
};

function openReportsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Report file storage is only available in the browser."));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      if (!window.indexedDB) throw new Error("IndexedDB is unavailable.");
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new Error("Could not open browser report storage. Check browser storage permissions.", { cause: error }));
      return;
    }

    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Browser report storage is blocked. Close other report tabs and try again."));
    };
    request.onupgradeneeded = () => {
      if (blocked) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        // The existing page uses out-of-line keys, not a keyPath.
        db.createObjectStore(FILE_STORE);
      }
    };
    request.onerror = () => {
      reject(new Error("Could not open browser report storage.", { cause: request.error }));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.close();
        reject(new Error("Browser report storage is missing the files store."));
        return;
      }
      resolve(db);
    };
  });
}

export async function loadReportFile(key: string): Promise<ReportFile | null> {
  if (!key.trim()) throw new Error("A report file key is required.");
  const db = await openReportsDb();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readonly");
      let result: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("The report storage read failed."));
      tx.onabort = () => reject(tx.error ?? new Error("The report storage read was aborted."));
      const request = tx.objectStore(FILE_STORE).get(key);
      request.onsuccess = () => {
        result = request.result;
      };
    });

    if (value == null) return null;
    if (
      typeof value !== "object" ||
      !("name" in value) || typeof value.name !== "string" ||
      !("buffer" in value) || !(value.buffer instanceof ArrayBuffer)
    ) {
      throw new Error("The saved report file is invalid. Upload it again.");
    }

    // Legacy records have no embedded key; the object-store key is authoritative.
    return { key, name: value.name, buffer: value.buffer };
  } catch (error) {
    throw new Error("Could not load the report file from browser storage.", { cause: error });
  } finally {
    db.close();
  }
}

export async function saveReportFile(key: string, name: string, buffer: ArrayBuffer): Promise<void> {
  if (!key.trim()) throw new Error("A report file key is required.");
  if (!name.trim()) throw new Error("A report file name is required.");
  if (!(buffer instanceof ArrayBuffer)) throw new Error("Report file contents must be an ArrayBuffer.");

  const db = await openReportsDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("The report storage write failed."));
      tx.onabort = () => reject(tx.error ?? new Error("The report storage write was aborted."));
      // Keep finance-april-2026 and kommo-v1 independent; never rewrite a caller's key.
      tx.objectStore(FILE_STORE).put({ key, name, buffer, savedAt: Date.now() }, key);
    });
  } catch (error) {
    throw new Error("Could not save the report file in browser storage.", { cause: error });
  } finally {
    db.close();
  }
}
