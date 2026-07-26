// Reine, seiteneffektfreie Rechenfunktionen – 1:1 aus dem im Chat getesteten Prototyp portiert
// (DuckTimePro_Vorschau.html). Nimmt bewusst nur einfache Werte/Arrays entgegen statt eines
// globalen State-Objekts, damit sich diese Funktionen ohne DOM/Browser mit `tsx` testen lassen
// (siehe calc.test.ts) und später 1:1 als Vitest-Suite in M6 weiterverwendet werden können.

import type { Employer, Entry, EmployerSnapshot, EmployerStats } from './types';

export function getEffectiveEmployerData(entry: Entry, employers: Employer[]): EmployerSnapshot | null {
  if (entry.snapshot) return entry.snapshot;
  const emp = employers.find(e => e.id === entry.employerId);
  if (!emp) return null;
  return {
    name: emp.name, color: emp.color, wageType: emp.wageType, wage: emp.wage,
    monthlySalary: emp.monthlySalary, weeklyTargetHours: emp.weeklyTargetHours,
    vacationDaysPerYear: emp.vacationDaysPerYear, isMinijob: emp.isMinijob
  };
}

export function calcEntryHours(entry: Entry, employers: Employer[]): number {
  const snap = getEffectiveEmployerData(entry, employers);
  const weeklyTarget = snap ? snap.weeklyTargetHours || 40 : 40;
  const targetDaily = weeklyTarget / 5;

  if (entry.type === 'vacation' || entry.type === 'sick') {
    return entry.duration === 'half' ? targetDaily / 2 : targetDaily;
  }
  if (!entry.start || !entry.end) return 0;
  const [sH, sM] = entry.start.split(':').map(Number);
  const [eH, eM] = entry.end.split(':').map(Number);
  let minutes = eH * 60 + eM - (sH * 60 + sM) - (entry.break || 0);
  if (minutes < 0) minutes = 0;
  return minutes / 60;
}

export function calcEntryEarnings(entry: Entry, employers: Employer[]): number {
  const snap = getEffectiveEmployerData(entry, employers);
  if (!snap) return 0;
  if (snap.wageType === 'salary') return 0; // Festgehalt wird auf Arbeitgeber-Ebene je Monat gezeigt
  return calcEntryHours(entry, employers) * (snap.wage || 0);
}

export function entryTypeLabel(entry: Entry): string {
  if (entry.type === 'vacation') return `Urlaub${entry.duration === 'half' ? ' (halber Tag)' : ''}`;
  if (entry.type === 'sick') return `Krank${entry.duration === 'half' ? ' (halber Tag)' : ''}`;
  return `${entry.start || '--:--'}-${entry.end || '--:--'}`;
}

export function weekdaysInMonth(year: number, month: number): number {
  const totalDays = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= totalDays; d++) {
    const day = new Date(year, month, d).getDay(); // 0=So,6=Sa
    if (day >= 1 && day <= 5) count++;
  }
  return count;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Überschneidungs-Warnung (Feedback-Punkt 7): findet andere Arbeits-Einträge am selben Tag,
// deren Zeitfenster sich mit `entryData` überschneidet.
export function findOverlaps(entryData: Entry, allEntries: Entry[]): Entry[] {
  if (entryData.type !== 'work' || !entryData.start || !entryData.end) return [];
  const newStart = toMinutes(entryData.start);
  const newEnd = toMinutes(entryData.end);
  return allEntries.filter(e => {
    if (e.id === entryData.id) return false;
    if (e.date !== entryData.date || e.type !== 'work' || !e.start || !e.end) return false;
    const s = toMinutes(e.start);
    const en = toMinutes(e.end);
    return newStart < en && s < newEnd;
  });
}

export function computeEmployerStats(
  emp: Employer,
  entries: Entry[],
  year: number,
  month: number
): EmployerStats {
  const monthEntries = entries.filter(e => {
    if (e.employerId !== emp.id) return false;
    const [ey, em] = e.date.split('-').map(Number);
    return ey === year && em - 1 === month;
  });

  let hours = 0;
  monthEntries.forEach(en => (hours += calcEntryHours(en, [emp])));

  let earnings: number;
  if (emp.wageType === 'salary') {
    earnings = emp.monthlySalary || 0;
  } else {
    earnings = monthEntries.reduce((sum, en) => sum + calcEntryEarnings(en, [emp]), 0);
  }

  const targetHours = (weekdaysInMonth(year, month) / 5) * (emp.weeklyTargetHours || 40);
  const overtime = hours - targetHours;

  let vacationDaysTaken = 0;
  let sickDays = 0;
  entries.forEach(en => {
    if (en.employerId !== emp.id) return;
    const [ey] = en.date.split('-').map(Number);
    if (ey !== year) return;
    const dayValue = en.duration === 'half' ? 0.5 : 1;
    if (en.type === 'vacation') vacationDaysTaken += dayValue;
    if (en.type === 'sick') sickDays += dayValue;
  });
  const vacationLeft = (emp.vacationDaysPerYear || 0) - vacationDaysTaken;

  return { hours, earnings, targetHours, overtime, vacationLeft, sickDays };
}
