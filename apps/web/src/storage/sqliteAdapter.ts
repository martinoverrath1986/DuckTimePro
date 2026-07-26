// SQLite-Storage-Adapter (Meilenstein M3) – löst den localStorageAdapter aus M1 als Standard ab.
// Nutzt sql.js (WASM-SQLite) über den Wrapper in sqlite/db.ts. Spaltennamen sind bewusst 1:1
// wie im Supabase-Schema (0001_init.sql) gehalten (snake_case), damit die Sync-Engine
// (sync/engine.ts) beim Mapping so wenig wie möglich übersetzen muss.
//
// Wichtiger Unterschied zu Supabase: Hier gibt es zusätzlich eine "dirty"-Spalte (0/1) – das
// braucht der Server nicht (er hat ja immer den aktuellen Stand), aber der Client muss sich
// merken, welche Zeilen seit dem letzten Sync geändert wurden (siehe getDirtyRows/markSynced).

import type { StorageAdapter, DirtyRows } from './adapter';
import type { Employer, Entry, Settings, Duration } from '../types';
import { getDb, persistDb } from './sqlite/db';
import type { Database } from 'sql.js';

function nowIso(): string {
  return new Date().toISOString();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Feste UUIDs (statt zufällig) für die beiden Beispiel-Arbeitgeber, damit ein frischer Start
// deterministisch bleibt (u.a. für Tests/Debugging leichter nachvollziehbar).
function defaultEmployers(): Employer[] {
  const ts = nowIso();
  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Hauptjob', color: '#eab308',
      wageType: 'hourly', wage: 16.0, monthlySalary: 0,
      weeklyTargetHours: 35, vacationDaysPerYear: 24, isMinijob: false,
      updatedAt: ts, deletedAt: null, dirty: true
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Minijob', color: '#8b5cf6',
      wageType: 'hourly', wage: 13.5, monthlySalary: 0,
      weeklyTargetHours: 8, vacationDaysPerYear: 10, isMinijob: true,
      updatedAt: ts, deletedAt: null, dirty: true
    }
  ];
}

function queryAll(db: Database, sql: string, params: (string | number | null)[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db: Database, sql: string, params: (string | number | null)[] = []): Record<string, unknown> | null {
  return queryAll(db, sql, params)[0] ?? null;
}

function rowToEmployer(row: Record<string, unknown>): Employer {
  return {
    id: row.id as string,
    name: row.name as string,
    color: (row.color as string) ?? '',
    wageType: row.wage_type as Employer['wageType'],
    wage: row.wage as number,
    monthlySalary: row.monthly_salary as number,
    weeklyTargetHours: row.weekly_target_hours as number,
    vacationDaysPerYear: row.vacation_days_per_year as number,
    isMinijob: !!row.is_minijob,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
    dirty: !!row.dirty
  };
}

function rowToEntry(row: Record<string, unknown>): Entry {
  return {
    id: row.id as string,
    type: row.type as Entry['type'],
    employerId: (row.employer_id as string) ?? '',
    date: row.date as string,
    start: (row.start_time as string) ?? '',
    end: (row.end_time as string) ?? '',
    break: (row.break_minutes as number) ?? 0,
    duration: ((row.duration as string) ?? '') as Duration,
    note: (row.note as string) ?? '',
    snapshot: row.snapshot ? JSON.parse(row.snapshot as string) : null,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
    dirty: !!row.dirty
  };
}

function rowToSettings(row: Record<string, unknown>): Settings {
  return {
    minijobLimit: row.minijob_limit as number,
    updatedAt: row.updated_at as string,
    dirty: !!row.dirty
  };
}

export class SqliteAdapter implements StorageAdapter {
  private db!: Database;

  async init(): Promise<void> {
    this.db = await getDb();
    this.db.run(`
      CREATE TABLE IF NOT EXISTS employers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT,
        wage_type TEXT NOT NULL,
        wage REAL NOT NULL DEFAULT 0,
        monthly_salary REAL NOT NULL DEFAULT 0,
        weekly_target_hours REAL NOT NULL DEFAULT 40,
        vacation_days_per_year REAL NOT NULL DEFAULT 20,
        is_minijob INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        employer_id TEXT,
        date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        break_minutes INTEGER NOT NULL DEFAULT 0,
        duration TEXT,
        note TEXT,
        snapshot TEXT,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        minijob_limit REAL NOT NULL DEFAULT 603,
        updated_at TEXT NOT NULL,
        dirty INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    const hasSettings = queryOne(this.db, 'SELECT id FROM settings WHERE id = 1');
    if (!hasSettings) {
      this.db.run('INSERT INTO settings (id, minijob_limit, updated_at, dirty) VALUES (1, ?, ?, 1)', [603, nowIso()]);
    }

    const employerCountRow = queryOne(this.db, 'SELECT COUNT(*) as c FROM employers');
    const employerCount = (employerCountRow?.c as number) ?? 0;
    if (employerCount === 0) {
      const migrated = this.migrateFromLocalStorage();
      if (!migrated) {
        for (const e of defaultEmployers()) {
          this.writeEmployerRow(e, true);
        }
      }
    }

    await persistDb(this.db);
  }

  // Einmalige Übernahme evtl. vorhandener M1/M2-Daten aus localStorage (LocalStorageAdapter),
  // damit beim Umstieg auf SQLite keine bereits eingetragenen Kalendereinträge verloren gehen.
  // IDs, die keine echten UUIDs sind (z.B. alte Date.now()-basierte IDs), werden dabei durch
  // frische UUIDs ersetzt (Voraussetzung für den Supabase-Sync, siehe Migration 0001_init.sql).
  // Die alten localStorage-Schlüssel werden bewusst NICHT gelöscht (kostenloses Backup-Netz).
  private migrateFromLocalStorage(): boolean {
    try {
      const rawEmployers = localStorage.getItem('duck_employers_v4');
      const rawEntries = localStorage.getItem('duck_entries_v4');
      const rawSettings = localStorage.getItem('duck_settings_v4');
      if (!rawEmployers) return false;

      const oldEmployers = JSON.parse(rawEmployers) as Employer[];
      if (!Array.isArray(oldEmployers) || oldEmployers.length === 0) return false;
      const oldEntries = rawEntries ? (JSON.parse(rawEntries) as Entry[]) : [];
      const oldSettings = rawSettings ? (JSON.parse(rawSettings) as Settings) : null;

      const idMap = new Map<string, string>();
      const remapId = (id: string): string => {
        if (UUID_RE.test(id)) return id;
        if (!idMap.has(id)) idMap.set(id, crypto.randomUUID());
        return idMap.get(id)!;
      };

      for (const e of oldEmployers) {
        this.writeEmployerRow({ ...e, id: remapId(e.id), dirty: true }, true);
      }
      for (const e of oldEntries) {
        this.writeEntryRow(
          { ...e, id: remapId(e.id), employerId: e.employerId ? remapId(e.employerId) : e.employerId, dirty: true },
          true
        );
      }
      if (oldSettings) {
        this.db.run('UPDATE settings SET minijob_limit = ?, updated_at = ?, dirty = 1 WHERE id = 1', [
          oldSettings.minijobLimit,
          oldSettings.updatedAt || nowIso()
        ]);
      }
      console.info(`DuckTime: ${oldEmployers.length} Arbeitgeber und ${oldEntries.length} Einträge aus localStorage in SQLite übernommen.`);
      return true;
    } catch (e) {
      console.error('DuckTime: Migration von localStorage nach SQLite fehlgeschlagen, starte mit Beispieldaten', e);
      return false;
    }
  }

  private writeEmployerRow(e: Employer, dirty: boolean): void {
    this.db.run(
      `INSERT INTO employers (id, name, color, wage_type, wage, monthly_salary, weekly_target_hours, vacation_days_per_year, is_minijob, updated_at, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, color=excluded.color, wage_type=excluded.wage_type, wage=excluded.wage,
         monthly_salary=excluded.monthly_salary, weekly_target_hours=excluded.weekly_target_hours,
         vacation_days_per_year=excluded.vacation_days_per_year, is_minijob=excluded.is_minijob,
         updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, dirty=excluded.dirty`,
      [
        e.id, e.name, e.color, e.wageType, e.wage, e.monthlySalary, e.weeklyTargetHours,
        e.vacationDaysPerYear, e.isMinijob ? 1 : 0, e.updatedAt, e.deletedAt, dirty ? 1 : 0
      ]
    );
  }

  private writeEntryRow(e: Entry, dirty: boolean): void {
    this.db.run(
      `INSERT INTO entries (id, type, employer_id, date, start_time, end_time, break_minutes, duration, note, snapshot, updated_at, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type=excluded.type, employer_id=excluded.employer_id, date=excluded.date,
         start_time=excluded.start_time, end_time=excluded.end_time, break_minutes=excluded.break_minutes,
         duration=excluded.duration, note=excluded.note, snapshot=excluded.snapshot,
         updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, dirty=excluded.dirty`,
      [
        e.id, e.type, e.employerId || null, e.date, e.start || null, e.end || null, e.break || 0,
        e.duration || null, e.note || null, JSON.stringify(e.snapshot), e.updatedAt, e.deletedAt, dirty ? 1 : 0
      ]
    );
  }

  async getEmployers(): Promise<Employer[]> {
    return queryAll(this.db, 'SELECT * FROM employers WHERE deleted_at IS NULL').map(rowToEmployer);
  }

  async upsertEmployer(e: Employer): Promise<void> {
    this.writeEmployerRow({ ...e, updatedAt: nowIso() }, true);
    await persistDb(this.db);
  }

  async softDeleteEmployer(id: string): Promise<void> {
    const ts = nowIso();
    this.db.run('UPDATE employers SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [ts, ts, id]);
    await persistDb(this.db);
  }

  async getEntries(): Promise<Entry[]> {
    return queryAll(this.db, 'SELECT * FROM entries WHERE deleted_at IS NULL').map(rowToEntry);
  }

  async upsertEntry(e: Entry): Promise<void> {
    this.writeEntryRow({ ...e, updatedAt: nowIso() }, true);
    await persistDb(this.db);
  }

  async softDeleteEntry(id: string): Promise<void> {
    const ts = nowIso();
    this.db.run('UPDATE entries SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [ts, ts, id]);
    await persistDb(this.db);
  }

  async getSettings(): Promise<Settings> {
    const row = queryOne(this.db, 'SELECT * FROM settings WHERE id = 1');
    return row ? rowToSettings(row) : { minijobLimit: 603, updatedAt: nowIso(), dirty: false };
  }

  async setSettings(s: Settings): Promise<void> {
    this.db.run('UPDATE settings SET minijob_limit = ?, updated_at = ?, dirty = 1 WHERE id = 1', [s.minijobLimit, nowIso()]);
    await persistDb(this.db);
  }

  async getDirtyRows(): Promise<DirtyRows> {
    const employers = queryAll(this.db, 'SELECT * FROM employers WHERE dirty = 1').map(rowToEmployer);
    const entries = queryAll(this.db, 'SELECT * FROM entries WHERE dirty = 1').map(rowToEntry);
    const settingsRow = queryOne(this.db, 'SELECT * FROM settings WHERE id = 1 AND dirty = 1');
    return { employers, entries, settings: settingsRow ? rowToSettings(settingsRow) : null };
  }

  async markSynced(ids: { employers: string[]; entries: string[]; settingsSynced?: boolean }): Promise<void> {
    for (const id of ids.employers) {
      this.db.run('UPDATE employers SET dirty = 0 WHERE id = ?', [id]);
    }
    for (const id of ids.entries) {
      this.db.run('UPDATE entries SET dirty = 0 WHERE id = ?', [id]);
    }
    if (ids.settingsSynced) {
      this.db.run('UPDATE settings SET dirty = 0 WHERE id = 1');
    }
    await persistDb(this.db);
  }

  // Wendet vom Server gepullte Zeilen lokal an. Ist eine lokale Zeile noch "dirty" (= eigene,
  // noch nicht hochgeladene Änderung), wird sie NICHT überschrieben – sie wird beim nächsten
  // Push hochgeladen, danach greift der normale Last-Write-Wins-Abgleich. Das verhindert, dass
  // ein Pull mitten in einer laufenden lokalen Bearbeitung Daten verwirft.
  async applyRemoteRows(rows: DirtyRows): Promise<void> {
    for (const e of rows.employers) {
      const local = queryOne(this.db, 'SELECT dirty FROM employers WHERE id = ?', [e.id]);
      if (local && local.dirty) continue;
      this.writeEmployerRow(e, false);
    }
    for (const e of rows.entries) {
      const local = queryOne(this.db, 'SELECT dirty FROM entries WHERE id = ?', [e.id]);
      if (local && local.dirty) continue;
      this.writeEntryRow(e, false);
    }
    if (rows.settings) {
      const local = queryOne(this.db, 'SELECT dirty FROM settings WHERE id = 1');
      if (!local || !local.dirty) {
        this.db.run('UPDATE settings SET minijob_limit = ?, updated_at = ?, dirty = 0 WHERE id = 1', [
          rows.settings.minijobLimit,
          rows.settings.updatedAt
        ]);
      }
    }
    await persistDb(this.db);
  }

  async getLastPulledAt(): Promise<string | null> {
    const row = queryOne(this.db, 'SELECT value FROM sync_meta WHERE key = ?', ['last_pulled_at']);
    return (row?.value as string) ?? null;
  }

  async setLastPulledAt(ts: string): Promise<void> {
    this.db.run('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      'last_pulled_at',
      ts
    ]);
    await persistDb(this.db);
  }
}
