// Zentrale Datentypen – gespiegelt vom validierten Prototyp (DuckTimePro_Vorschau.html)
// und um Sync-Felder erweitert, die ab M2/M3 (Supabase + Offline-Sync) gebraucht werden.
// Wichtig: updatedAt/deletedAt/dirty existieren schon jetzt (M1), auch wenn sie in M1
// noch nicht aktiv genutzt werden – so muss das Schema in M2/M3 nicht mehr angefasst werden.

export type WageType = 'hourly' | 'salary';
export type EntryType = 'work' | 'vacation' | 'sick';
export type Duration = 'full' | 'half' | '';

export interface Employer {
  id: string;
  name: string;
  color: string;
  wageType: WageType;
  wage: number; // €/Stunde, nur relevant wenn wageType === 'hourly'
  monthlySalary: number; // €/Monat, nur relevant wenn wageType === 'salary'
  weeklyTargetHours: number; // Soll-Stunden/Woche (Basis für Überstunden-Berechnung)
  vacationDaysPerYear: number;
  isMinijob: boolean;
  updatedAt: string; // ISO-8601, wird ab M2 serverseitig überschrieben
  deletedAt: string | null; // Soft-Delete/Tombstone für späteren Sync
  dirty: boolean; // true = seit letztem Sync geändert (ab M3 relevant)
}

// Schnappschuss der Arbeitgeber-Daten zum Zeitpunkt, an dem ein Eintrag gespeichert wurde.
// Dadurch bleiben historische Verdienst-/Überstunden-Berechnungen korrekt, auch wenn sich
// Stundenlohn, Soll-Stunden etc. beim Arbeitgeber später ändern (siehe Feedback-Punkt 4).
export interface EmployerSnapshot {
  name: string;
  color: string;
  wageType: WageType;
  wage: number;
  monthlySalary: number;
  weeklyTargetHours: number;
  vacationDaysPerYear: number;
  isMinijob: boolean;
}

export interface Entry {
  id: string;
  type: EntryType;
  employerId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM, nur bei type === 'work'
  end: string; // HH:MM, nur bei type === 'work'
  break: number; // Minuten, nur bei type === 'work'
  duration: Duration; // 'full' | 'half', nur bei type !== 'work'
  note: string;
  snapshot: EmployerSnapshot | null;
  updatedAt: string;
  deletedAt: string | null;
  dirty: boolean;
}

export interface Settings {
  minijobLimit: number; // €/Monat, gesetzlicher Wert 2026: 603€
  updatedAt: string;
  dirty: boolean;
}

export interface EmployerStats {
  hours: number;
  earnings: number;
  targetHours: number;
  overtime: number;
  vacationLeft: number;
  sickDays: number;
}

export interface AppState {
  currentDate: Date; // Kalender-Monat
  statsDate: Date; // Statistik-Monat (eigene Navigation, siehe Feedback-Punkt "Stats-Bug")
  calendarFilterEmployer: string; // 'all' oder employer.id
  employers: Employer[];
  entries: Entry[];
  settings: Settings;
}
