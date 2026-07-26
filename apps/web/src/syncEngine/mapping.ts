// Übersetzt zwischen den lokalen (camelCase) Typen aus types.ts und den Supabase-Zeilen
// (snake_case, siehe supabase/migrations/0001_init.sql). Zwei bewusste Besonderheiten:
//
// 1. "updated_at" wird beim PUSH nie mitgeschickt – der Server setzt ihn immer per Trigger
//    (touch_updated_at, siehe Migration), ein client-seitiger Wert würde ohnehin überschrieben.
//    Das ist auch die Grundlage für die Last-Write-Wins-Konfliktlösung: Zeitstempel kommen
//    IMMER vom Server, nie von (potenziell falsch eingestellten) Geräte-Uhren.
// 2. "user_id" wird beim PUSH nie mitgeschickt – die Spalte hat `default auth.uid()`, Postgres
//    füllt sie beim INSERT automatisch mit der ID des eingeloggten Nutzers. RLS sorgt dafür,
//    dass ein Upsert ohnehin nur die eigenen Zeilen treffen kann.

import type { Employer, Entry, Settings, Duration } from '../types';

export function employerToRow(e: Employer): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    color: e.color || null,
    wage_type: e.wageType,
    wage: e.wage,
    monthly_salary: e.monthlySalary,
    weekly_target_hours: e.weeklyTargetHours,
    vacation_days_per_year: e.vacationDaysPerYear,
    is_minijob: e.isMinijob,
    deleted_at: e.deletedAt
  };
}

export function rowToEmployer(row: Record<string, unknown>): Employer {
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
    dirty: false
  };
}

export function entryToRow(e: Entry): Record<string, unknown> {
  return {
    id: e.id,
    type: e.type,
    employer_id: e.employerId || null,
    date: e.date,
    start_time: e.start || null,
    end_time: e.end || null,
    break_minutes: e.break || 0,
    // '' -> null: der Server-CHECK auf "duration" erlaubt nur 'full'/'half'/NULL, keine leere
    // Zeichenkette (die lokale App nutzt '' für Arbeits-Einträge, wo "duration" nicht zutrifft).
    duration: e.duration || null,
    note: e.note || null,
    // jsonb-Spalte: supabase-js serialisiert ein übergebenes Objekt/null automatisch, kein
    // manuelles JSON.stringify nötig (anders als im lokalen SQLite-Adapter, der nur TEXT kennt).
    snapshot: e.snapshot,
    deleted_at: e.deletedAt
  };
}

export function rowToEntry(row: Record<string, unknown>): Entry {
  return {
    id: row.id as string,
    type: row.type as Entry['type'],
    employerId: (row.employer_id as string) ?? '',
    date: row.date as string,
    start: (row.start_time as string) ?? '',
    end: (row.end_time as string) ?? '',
    break: (row.break_minutes as number) ?? 0,
    duration: ((row.duration as string) ?? '') as Duration,
    // jsonb kommt von PostgREST schon als geparstes Objekt/null zurück, kein JSON.parse nötig.
    snapshot: (row.snapshot as Entry['snapshot']) ?? null,
    note: (row.note as string) ?? '',
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
    dirty: false
  };
}

export function settingsToRow(s: Settings): Record<string, unknown> {
  return { minijob_limit: s.minijobLimit };
}

export function rowToSettings(row: Record<string, unknown>): Settings {
  return {
    minijobLimit: row.minijob_limit as number,
    updatedAt: row.updated_at as string,
    dirty: false
  };
}
