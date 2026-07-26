// Dünner Wrapper um sql.js (WASM-SQLite im Browser) + Persistenz via IndexedDB.
//
// sql.js hält die Datenbank nur im Arbeitsspeicher. Nach jeder schreibenden Operation wird
// deshalb ein kompletter Snapshot (Uint8Array = SQLite-Dateiformat) in IndexedDB abgelegt und
// beim nächsten App-Start wieder geladen. Bewusst einfach gehalten (kein inkrementelles WAL,
// kein Diffing) – für die Datenmenge einer persönlichen Zeiterfassung (ein paar tausend
// Einträge über Jahre) völlig ausreichend, und deutlich weniger riskant als eine komplexere
// Lösung ohne Möglichkeit, sie hier in der Sandbox laufen zu lassen (kein npm-Registry-Zugriff,
// siehe README).
//
// Für die späteren nativen Hüllen (Tauri/Capacitor, M4/M5) wird stattdessen eine echte
// Dateisystem-SQLite-Anbindung hinter demselben StorageAdapter-Interface eingesetzt – diese
// Datei hier wird dann durch eine analoge sqliteAdapterTauri/Capacitor-Variante ersetzt, ohne
// dass sich an der SQL-Logik in sqliteAdapter.ts etwas ändern muss.

import initSqlJs, { type Database } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const IDB_NAME = 'ducktime-sqlite';
const IDB_STORE = 'snapshot';
const IDB_KEY = 'db';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSnapshot(): Promise<Uint8Array | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveSnapshot(data: Uint8Array): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let dbPromise: Promise<Database> | null = null;

// Singleton – mehrere Aufrufer (z.B. init() und spätere Zugriffe) bekommen dieselbe,
// bereits initialisierte Datenbankinstanz statt versehentlich mehrfach WASM zu laden.
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
      const existing = await loadSnapshot().catch(err => {
        console.error('DuckTime: Konnte SQLite-Snapshot nicht aus IndexedDB laden, starte leer', err);
        return null;
      });
      return existing ? new SQL.Database(existing) : new SQL.Database();
    })();
  }
  return dbPromise;
}

// Nach jeder schreibenden Operation aufrufen. Bewusst "fire and forget" mit Fehler-Log statt
// throw: ein IndexedDB-Ausfall (z.B. Safari privater Modus mit strikten Speicherlimits) soll
// die App nicht lahmlegen – die Daten bleiben dann zumindest für die laufende Session im
// sql.js-Arbeitsspeicher erhalten, gehen nur beim Neuladen der Seite verloren.
export async function persistDb(db: Database): Promise<void> {
  try {
    await saveSnapshot(db.export());
  } catch (e) {
    console.error('DuckTime: SQLite-Snapshot konnte nicht in IndexedDB gespeichert werden', e);
  }
}
