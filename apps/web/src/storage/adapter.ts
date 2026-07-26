// StorageAdapter-Abstraktion (siehe Plan, Abschnitt 2 "Offline-first Speicher + Sync-Engine").
// Business-Logik (calendar.ts, employers.ts, entries.ts, stats.ts, ...) greift NIE direkt
// auf localStorage/SQLite zu, sondern immer nur über dieses Interface. Das ist die zentrale
// Weiche, die in M3 (Offline-SQLite) und M4/M5 (Tauri/Capacitor) getauscht wird, ohne dass
// sich an der restlichen App etwas ändern muss.
//
// In M1 existiert nur `localStorageAdapter`. `sqliteAdapterTauri` / `sqliteAdapterCapacitor`
// kommen in M3 hinzu und implementieren exakt dasselbe Interface.

import type { Employer, Entry, Settings } from '../types';

export interface DirtyRows {
  employers: Employer[];
  entries: Entry[];
  settings: Settings | null;
}

export interface StorageAdapter {
  init(): Promise<void>;

  getEmployers(): Promise<Employer[]>;
  upsertEmployer(e: Employer): Promise<void>;

  getEntries(): Promise<Entry[]>;
  upsertEntry(e: Entry): Promise<void>;
  softDeleteEmployer(id: string): Promise<void>;
  softDeleteEntry(id: string): Promise<void>;

  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<void>;

  // Ab M3 relevant: alle seit dem letzten Sync geänderten Zeilen (dirty = true).
  getDirtyRows(): Promise<DirtyRows>;
  // settingsSynced: true nur setzen, wenn Settings TATSÄCHLICH Teil dieses Push-Vorgangs waren –
  // sonst würde ein Sync, der nur Employers/Entries pusht, fälschlich auch noch nicht
  // hochgeladene Settings-Änderungen als "synced" markieren.
  markSynced(ids: { employers: string[]; entries: string[]; settingsSynced?: boolean }): Promise<void>;
  applyRemoteRows(rows: DirtyRows): Promise<void>;
  getLastPulledAt(): Promise<string | null>;
  setLastPulledAt(ts: string): Promise<void>;
}
