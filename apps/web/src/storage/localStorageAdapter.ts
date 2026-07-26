import type { StorageAdapter, DirtyRows } from './adapter';
import type { Employer, Entry, Settings } from '../types';

// Gleiche Semantik wie im Browser-Prototyp, jetzt hinter dem StorageAdapter-Interface.
// Schlüssel auf "_v4" angehoben, weil das Schema um updatedAt/deletedAt/dirty erweitert wurde
// (siehe types.ts) – verhindert Parse-Fehler durch alte "_v3"-Daten aus der Preview-Phase.
const KEY_EMPLOYERS = 'duck_employers_v4';
const KEY_ENTRIES = 'duck_entries_v4';
const KEY_SETTINGS = 'duck_settings_v4';
const KEY_LAST_PULLED = 'duck_last_pulled_v4';

function nowIso(): string {
  return new Date().toISOString();
}

function defaultEmployers(): Employer[] {
  return [
    {
      id: '1', name: 'Hauptjob', color: '#eab308',
      wageType: 'hourly', wage: 16.0, monthlySalary: 0,
      weeklyTargetHours: 35, vacationDaysPerYear: 24, isMinijob: false,
      updatedAt: nowIso(), deletedAt: null, dirty: false
    },
    {
      id: '2', name: 'Minijob', color: '#8b5cf6',
      wageType: 'hourly', wage: 13.5, monthlySalary: 0,
      weeklyTargetHours: 8, vacationDaysPerYear: 10, isMinijob: true,
      updatedAt: nowIso(), deletedAt: null, dirty: false
    }
  ];
}

function defaultSettings(): Settings {
  return { minijobLimit: 603, updatedAt: nowIso(), dirty: false };
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private employers: Employer[] = [];
  private entries: Entry[] = [];
  private settings: Settings = defaultSettings();

  async init(): Promise<void> {
    this.employers = readJson<Employer[]>(KEY_EMPLOYERS, defaultEmployers());
    this.entries = readJson<Entry[]>(KEY_ENTRIES, []);
    this.settings = readJson<Settings>(KEY_SETTINGS, defaultSettings());
  }

  private persist(): void {
    localStorage.setItem(KEY_EMPLOYERS, JSON.stringify(this.employers));
    localStorage.setItem(KEY_ENTRIES, JSON.stringify(this.entries));
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(this.settings));
  }

  async getEmployers(): Promise<Employer[]> {
    return this.employers.filter(e => !e.deletedAt);
  }

  async upsertEmployer(e: Employer): Promise<void> {
    const idx = this.employers.findIndex(x => x.id === e.id);
    const withMeta: Employer = { ...e, updatedAt: nowIso(), dirty: true };
    if (idx !== -1) this.employers[idx] = withMeta;
    else this.employers.push(withMeta);
    this.persist();
  }

  async softDeleteEmployer(id: string): Promise<void> {
    const idx = this.employers.findIndex(x => x.id === id);
    if (idx !== -1) {
      this.employers[idx] = { ...this.employers[idx], deletedAt: nowIso(), updatedAt: nowIso(), dirty: true };
      this.persist();
    }
  }

  async getEntries(): Promise<Entry[]> {
    return this.entries.filter(e => !e.deletedAt);
  }

  async upsertEntry(e: Entry): Promise<void> {
    const idx = this.entries.findIndex(x => x.id === e.id);
    const withMeta: Entry = { ...e, updatedAt: nowIso(), dirty: true };
    if (idx !== -1) this.entries[idx] = withMeta;
    else this.entries.push(withMeta);
    this.persist();
  }

  async softDeleteEntry(id: string): Promise<void> {
    const idx = this.entries.findIndex(x => x.id === id);
    if (idx !== -1) {
      this.entries[idx] = { ...this.entries[idx], deletedAt: nowIso(), updatedAt: nowIso(), dirty: true };
      this.persist();
    }
  }

  async getSettings(): Promise<Settings> {
    return this.settings;
  }

  async setSettings(s: Settings): Promise<void> {
    this.settings = { ...s, updatedAt: nowIso(), dirty: true };
    this.persist();
  }

  async getDirtyRows(): Promise<DirtyRows> {
    return {
      employers: this.employers.filter(e => e.dirty),
      entries: this.entries.filter(e => e.dirty),
      settings: this.settings.dirty ? this.settings : null
    };
  }

  async markSynced(ids: { employers: string[]; entries: string[]; settingsSynced?: boolean }): Promise<void> {
    this.employers = this.employers.map(e => (ids.employers.includes(e.id) ? { ...e, dirty: false } : e));
    this.entries = this.entries.map(e => (ids.entries.includes(e.id) ? { ...e, dirty: false } : e));
    if (ids.settingsSynced) {
      this.settings = { ...this.settings, dirty: false };
    }
    this.persist();
  }

  async applyRemoteRows(rows: DirtyRows): Promise<void> {
    // Ist eine lokale Zeile noch "dirty" (eigene, noch nicht hochgeladene Änderung), wird sie
    // NICHT überschrieben – siehe sqliteAdapter.ts (Standard-Adapter seit M3) für die
    // ausführliche Begründung dieses Last-Write-Wins-Schutzes.
    rows.employers.forEach(e => {
      const idx = this.employers.findIndex(x => x.id === e.id);
      if (idx !== -1 && this.employers[idx].dirty) return;
      if (idx !== -1) this.employers[idx] = { ...e, dirty: false };
      else this.employers.push({ ...e, dirty: false });
    });
    rows.entries.forEach(e => {
      const idx = this.entries.findIndex(x => x.id === e.id);
      if (idx !== -1 && this.entries[idx].dirty) return;
      if (idx !== -1) this.entries[idx] = { ...e, dirty: false };
      else this.entries.push({ ...e, dirty: false });
    });
    if (rows.settings && !this.settings.dirty) this.settings = { ...rows.settings, dirty: false };
    this.persist();
  }

  async getLastPulledAt(): Promise<string | null> {
    return localStorage.getItem(KEY_LAST_PULLED);
  }

  async setLastPulledAt(ts: string): Promise<void> {
    localStorage.setItem(KEY_LAST_PULLED, ts);
  }
}
