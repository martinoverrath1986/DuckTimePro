// Die eigentliche Sync-Engine (Meilenstein M3): pusht lokal geänderte Zeilen zu Supabase und
// pullt anschließend alles, was seit dem letzten Sync auf dem Server neu/geändert ist – von
// diesem oder einem gekoppelten anderen Gerät (siehe M2, PIN-Kopplung).
//
// Reihenfolge bewusst Push-dann-Pull: Erst die eigenen Änderungen hochladen, DANACH den
// aktuellen Serverstand holen. So sieht der anschließende Pull sofort auch die eigenen
// gerade gepushten Zeilen (mit vom Server frisch gesetztem updated_at) und – falls ein zweites
// Gerät zwischenzeitlich synchronisiert hat – auch dessen Änderungen.
//
// Konfliktlösung: Last-Write-Wins über den serverseitig gesetzten "updated_at"-Zeitstempel.
// Ist eine lokale Zeile beim Pull noch "dirty" (eigene, noch nicht hochgeladene Änderung),
// überschreibt applyRemoteRows() im Storage-Adapter sie NICHT – sie wird beim nächsten Push
// hochgeladen und danach normal abgeglichen (siehe sqliteAdapter.ts).

import { supabase } from '../auth/supabaseClient';
import { adapter, refreshState } from '../state';
import { employerToRow, rowToEmployer, entryToRow, rowToEntry, settingsToRow, rowToSettings } from './mapping';
import type { Employer, Entry, Settings } from '../types';

export interface SyncResult {
  pushedEmployers: number;
  pushedEntries: number;
  pushedSettings: boolean;
  pulledEmployers: number;
  pulledEntries: number;
  pulledSettings: boolean;
}

async function pushDirtyRows(): Promise<{ employerIds: string[]; entryIds: string[]; settingsSynced: boolean }> {
  const dirty = await adapter.getDirtyRows();
  const employerIds: string[] = [];
  const entryIds: string[] = [];
  let settingsSynced = false;

  if (dirty.employers.length > 0) {
    const rows = dirty.employers.map(employerToRow);
    const { error } = await supabase!.from('employers').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`Push Arbeitgeber fehlgeschlagen: ${error.message}`);
    employerIds.push(...dirty.employers.map(e => e.id));
  }

  if (dirty.entries.length > 0) {
    const rows = dirty.entries.map(entryToRow);
    const { error } = await supabase!.from('entries').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`Push Einträge fehlgeschlagen: ${error.message}`);
    entryIds.push(...dirty.entries.map(e => e.id));
  }

  if (dirty.settings) {
    const { error } = await supabase!.from('settings').upsert(settingsToRow(dirty.settings), { onConflict: 'user_id' });
    if (error) throw new Error(`Push Einstellungen fehlgeschlagen: ${error.message}`);
    settingsSynced = true;
  }

  if (employerIds.length > 0 || entryIds.length > 0 || settingsSynced) {
    await adapter.markSynced({ employers: employerIds, entries: entryIds, settingsSynced });
  }

  return { employerIds, entryIds, settingsSynced };
}

async function pullRemoteChanges(): Promise<{ employers: number; entries: number; settings: boolean }> {
  const since = await adapter.getLastPulledAt();
  // WICHTIG: Zeitstempel VOR den Abfragen erfassen (nicht danach) – so bleibt er eine sichere
  // untere Grenze. Eine Zeile, die genau während dieser Sync-Runde auf dem Server geändert wird,
  // taucht dann beim NÄCHSTEN Pull garantiert noch auf, statt riskant übersprungen zu werden.
  const nowTs = new Date().toISOString();

  let employerQuery = supabase!.from('employers').select('*');
  let entryQuery = supabase!.from('entries').select('*');
  let settingsQuery = supabase!.from('settings').select('*');
  if (since) {
    employerQuery = employerQuery.gt('updated_at', since);
    entryQuery = entryQuery.gt('updated_at', since);
    settingsQuery = settingsQuery.gt('updated_at', since);
  }

  const [employersRes, entriesRes, settingsRes] = await Promise.all([employerQuery, entryQuery, settingsQuery]);
  if (employersRes.error) throw new Error(`Pull Arbeitgeber fehlgeschlagen: ${employersRes.error.message}`);
  if (entriesRes.error) throw new Error(`Pull Einträge fehlgeschlagen: ${entriesRes.error.message}`);
  if (settingsRes.error) throw new Error(`Pull Einstellungen fehlgeschlagen: ${settingsRes.error.message}`);

  const employers: Employer[] = (employersRes.data ?? []).map(rowToEmployer);
  const entries: Entry[] = (entriesRes.data ?? []).map(rowToEntry);
  const settingsRow = (settingsRes.data ?? [])[0];
  const settings: Settings | null = settingsRow ? rowToSettings(settingsRow) : null;

  if (employers.length > 0 || entries.length > 0 || settings) {
    await adapter.applyRemoteRows({ employers, entries, settings });
  }
  await adapter.setLastPulledAt(nowTs);

  return { employers: employers.length, entries: entries.length, settings: !!settings };
}

export async function runSync(): Promise<SyncResult> {
  if (!supabase) throw new Error('Cloud-Sync ist nicht konfiguriert (.env fehlt).');

  const pushed = await pushDirtyRows();
  const pulled = await pullRemoteChanges();
  await refreshState();

  return {
    pushedEmployers: pushed.employerIds.length,
    pushedEntries: pushed.entryIds.length,
    pushedSettings: pushed.settingsSynced,
    pulledEmployers: pulled.employers,
    pulledEntries: pulled.entries,
    pulledSettings: pulled.settings
  };
}
