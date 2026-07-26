import type { StorageAdapter } from './adapter';
import { SqliteAdapter } from './sqliteAdapter';

// Factory: wählt zur Laufzeit die passende StorageAdapter-Implementierung.
// Seit M3: SqliteAdapter (sql.js/WASM im Browser) ist der Standard – löst den localStorageAdapter
// aus M1 ab (der bleibt als Datei erhalten, u.a. als Referenz/Fallback, wird aber nicht mehr
// verwendet). M4/M5 ergänzen hier sqliteAdapterTauri/Capacitor (echte Dateisystem-SQLite statt
// IndexedDB-Snapshot), ohne dass sich am StorageAdapter-Interface oder an der restlichen App
// etwas ändern muss.
export function getStorageAdapter(): StorageAdapter {
  // Platzhalter für spätere Erkennung (M4/M5):
  // const isCapacitor = (window as any).Capacitor?.isNativePlatform?.();
  // const isTauri = '__TAURI_INTERNALS__' in window;
  // if (isCapacitor) return new SqliteAdapterCapacitor();
  // if (isTauri) return new SqliteAdapterTauri();
  return new SqliteAdapter();
}
