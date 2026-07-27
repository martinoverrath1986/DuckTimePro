import * as XLSX from 'xlsx';
import { byId } from './dom';
import { state, saveEmployer, saveEntry } from './state';
import { calcEntryHours, calcEntryEarnings, getEffectiveEmployerData } from './calc';
import { renderCalendar } from './calendar';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Meilenstein M5 (Capacitor/Android): ein normaler Browser-Download (Blob + <a download>,
// bzw. XLSX.writeFile()) funktioniert in Android-WebViews nicht zuverlässig – es gibt dort
// keinen "Downloads"-Ordner-Zugriff wie im Desktop-Browser. Stattdessen: Datei ins App-eigene
// Cache-Verzeichnis schreiben und über den nativen Android-"Teilen"-Dialog anbieten (der Nutzer
// wählt dort z.B. "In Dateien speichern", "Per E-Mail senden", "Google Drive" o.ä.).
// Im Browser und in der Tauri-Windows-App (Capacitor.isNativePlatform() === false) bleibt der
// bisherige, bereits getestete Weg unverändert.
async function saveAndShareOnNative(filename: string, base64Data: string): Promise<void> {
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64Data,
    directory: Directory.Cache
  });
  await Share.share({
    title: filename,
    url: written.uri,
    dialogTitle: 'Datei speichern oder teilen'
  });
}

export async function exportToExcel(): Promise<void> {
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
  const filename = `DuckTime_Export_${year}_${month + 1}.xlsx`;

  if (Capacitor.isNativePlatform()) {
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await saveAndShareOnNative(filename, base64);
  } else {
    XLSX.writeFile(wb, filename);
  }
}

export async function exportJSON(): Promise<void> {
  const filename = 'ducktime_backup.json';
  const jsonStr = JSON.stringify(state);

  if (Capacitor.isNativePlatform()) {
    // btoa erwartet Latin1 – über encodeURIComponent/unescape sicher aus UTF-8 kodieren
    // (Notizen/Namen können Umlaute o.ä. enthalten).
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
    await saveAndShareOnNative(filename, base64);
  } else {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(jsonStr);
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', filename);
    dlAnchorElem.click();
  }
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
