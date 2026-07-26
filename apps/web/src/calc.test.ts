// Eigenständiger Test-Runner (kein Test-Framework nötig) für die reinen Rechenfunktionen.
// Ausführbar mit `npx tsx src/calc.test.ts` – lässt sich später 1:1 in Vitest überführen (M6).
// Die Erwartungswerte stammen aus den bereits im Chat mit Playwright gegen den Browser-
// Prototyp verifizierten Szenarien (Hauptjob/Minijob-Beispiel), damit sichergestellt ist,
// dass die Portierung nach TypeScript das Verhalten nicht verändert hat.

import { calcEntryHours, calcEntryEarnings, weekdaysInMonth, findOverlaps, computeEmployerStats } from './calc';
import type { Employer, Entry } from './types';

let failures = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✅' : '❌'} ${label} — erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
  if (!ok) failures++;
}

function makeEmployer(overrides: Partial<Employer> = {}): Employer {
  return {
    id: '1', name: 'Hauptjob', color: '#eab308',
    wageType: 'hourly', wage: 16, monthlySalary: 0,
    weeklyTargetHours: 35, vacationDaysPerYear: 24, isMinijob: false,
    updatedAt: '', deletedAt: null, dirty: false,
    ...overrides
  };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1', type: 'work', employerId: '1', date: '2026-07-15',
    start: '09:00', end: '17:00', break: 0, duration: '', note: '',
    snapshot: null, updatedAt: '', deletedAt: null, dirty: false,
    ...overrides
  };
}

// --- 1) Hauptjob: 8h Arbeit à 16€/h -> 128€ (siehe Playwright-Test aus der Preview-Phase) ---
const hauptjob = makeEmployer();
const entryHauptjob = makeEntry();
assertEqual(calcEntryHours(entryHauptjob, [hauptjob]), 8, 'Hauptjob 09:00-17:00 = 8 Stunden');
assertEqual(calcEntryEarnings(entryHauptjob, [hauptjob]), 128, 'Hauptjob 8h * 16€/h = 128€');

// --- 2) Minijob: 3h Arbeit à 13.50€/h -> 40.50€ ---
const minijob = makeEmployer({ id: '2', name: 'Minijob', wage: 13.5, weeklyTargetHours: 8, isMinijob: true });
const entryMinijob = makeEntry({ id: 'e2', employerId: '2', start: '16:00', end: '19:00' });
assertEqual(calcEntryHours(entryMinijob, [minijob]), 3, 'Minijob 16:00-19:00 = 3 Stunden');
assertEqual(calcEntryEarnings(entryMinijob, [minijob]), 40.5, 'Minijob 3h * 13.50€/h = 40.50€');

// --- 3) Wochentage/Soll-Stunden Juli 2026 (Monat-Index 6) ---
assertEqual(weekdaysInMonth(2026, 6), 23, 'Juli 2026 hat 23 Wochentage (Mo-Fr)');

// --- 4) computeEmployerStats: Soll-Stunden je Arbeitgeber getrennt (Feedback-Punkt 1) ---
const statsHauptjob = computeEmployerStats(hauptjob, [entryHauptjob], 2026, 6);
assertEqual(Math.round(statsHauptjob.targetHours * 10) / 10, 161, 'Hauptjob Soll-Stunden Juli 2026 (35h/Woche) = 161.0h');
const statsMinijob = computeEmployerStats(minijob, [entryMinijob], 2026, 6);
assertEqual(Math.round(statsMinijob.targetHours * 10) / 10, 36.8, 'Minijob Soll-Stunden Juli 2026 (8h/Woche) = 36.8h');

// --- 5) Festgehalt: Verdienst ist der Fixbetrag, unabhängig von geloggten Stunden (Feedback-Punkt 5) ---
const hauptjobFestgehalt = makeEmployer({ wageType: 'salary', monthlySalary: 2500, wage: 0 });
const statsFestgehalt = computeEmployerStats(hauptjobFestgehalt, [entryHauptjob], 2026, 6);
assertEqual(statsFestgehalt.earnings, 2500, 'Festgehalt zeigt 2500€ unabhängig von Stunden');

// --- 6) Schnappschuss bleibt bei Lohnänderung korrekt (Feedback-Punkt 4) ---
const entryMitSchnappschuss = makeEntry({
  snapshot: {
    name: 'Hauptjob', color: '#eab308', wageType: 'hourly', wage: 16,
    monthlySalary: 0, weeklyTargetHours: 35, vacationDaysPerYear: 24, isMinijob: false
  }
});
const hauptjobNachLohnerhoehung = makeEmployer({ wage: 20 }); // Lohn wurde später auf 20€ erhöht
assertEqual(
  calcEntryEarnings(entryMitSchnappschuss, [hauptjobNachLohnerhoehung]),
  128,
  'Alter Eintrag bleibt bei 128€ (16€/h-Schnappschuss), obwohl aktueller Lohn jetzt 20€/h ist'
);

// --- 7) Überschneidungs-Warnung (Feedback-Punkt 7) ---
const overlaps = findOverlaps(entryMinijob, [entryHauptjob, entryMinijob]);
assertEqual(overlaps.length, 1, 'Minijob 16-19 Uhr überschneidet sich mit Hauptjob 09-17 Uhr (16-17 Uhr Overlap)');

// --- 8) Kein Overlap wenn Zeiten sich nicht schneiden ---
const entryOhneOverlap = makeEntry({ id: 'e3', start: '18:00', end: '20:00' });
const keineOverlaps = findOverlaps(entryOhneOverlap, [entryHauptjob, entryOhneOverlap]);
assertEqual(keineOverlaps.length, 0, 'Kein Overlap bei 18:00-20:00 vs. 09:00-17:00');

console.log('\n' + (failures === 0 ? '✅ ALLE TESTS BESTANDEN' : `❌ ${failures} TEST(S) FEHLGESCHLAGEN`));
process.exit(failures === 0 ? 0 : 1);
