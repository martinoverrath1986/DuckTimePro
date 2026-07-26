import * as XLSX from 'xlsx';
import { byId } from './dom';
import { state, saveEmployer, saveEntry } from './state';
import { calcEntryHours, calcEntryEarnings, getEffectiveEmployerData } from './calc';
import { renderCalendar } from './calendar';

export function exportToExcel(): void {
  const selectedEmpId = byId<HTMLSelectElement>('export-employer-select').value;
  const year = state.statsDate.getFullYear();
  const month = state.statsDate.getMonth();

  const filtered = state.entries.filter(entry => {
    const [eYear, eMonth] = entry.date.split('-').map(Number);
    const matchesMonth = eYear === year && eMonth - 1 === month;
    const matchesEmp = selectedEmpId === 'all' || entry.employerId === selectedEmpId;
    return matchesMonth && matchesEmp;
  });

  if (filtered.length === 0) {
    alert('Keine Einträge für diesen Zeitraum gefunden.');
    return;
  }

  const data = filtered.map(entry => {
    const snap = getEffectiveEmployerData(entry, state.employers);
    const hours = calcEntryHours(entry, state.employers);
    return {
      Datum: entry.date,
      Arbeitgeber: snap ? snap.name : 'Unbekannt',
      Minijob: snap && snap.isMinijob ? 'Ja' : 'Nein',
      Typ: entry.type === 'vacation' ? 'Urlaub' : entry.type === 'sick' ? 'Krank' : 'Arbeit',
      Von: entry.start || '',
      Bis: entry.end || '',
      'Pause (Min)': entry.break || 0,
      Stunden: hours.toFixed(2),
      'Verdienst (€)': calcEntryEarnings(entry, state.employers).toFixed(2),
      Notiz: entry.note || ''
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Arbeitszeiten');
  XLSX.writeFile(wb, `DuckTime_Export_${year}_${month + 1}.xlsx`);
}

export function exportJSON(): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute('href', dataStr);
  dlAnchorElem.setAttribute('download', 'ducktime_backup.json');
  dlAnchorElem.click();
}

export function importJSON(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const parsed = JSON.parse(String(e.target?.result));
      if (parsed.employers && parsed.entries) {
        for (const emp of parsed.employers) await saveEmployer(emp);
        for (const entry of parsed.entries) await saveEntry(entry);
        renderCalendar();
        alert('Backup erfolgreich importiert!');
      } else {
        alert('Ungültiges Backup-Format.');
      }
    } catch {
      alert('Fehler beim Lesen der Datei.');
    }
  };
  reader.readAsText(file);
}
