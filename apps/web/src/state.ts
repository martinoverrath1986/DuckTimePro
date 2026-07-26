import type { AppState, Employer, Entry, Settings } from './types';
import { getStorageAdapter } from './storage';

// Exportiert (statt privat), damit syncEngine/engine.ts dieselbe Adapter-Instanz benutzt statt
// über getStorageAdapter() eine zweite, unabhängige anzulegen.
export const adapter = getStorageAdapter();

export const state: AppState = {
  currentDate: new Date(),
  statsDate: new Date(),
  calendarFilterEmployer: 'all',
  employers: [],
  entries: [],
  settings: { minijobLimit: 603, updatedAt: '', dirty: false }
};

export async function loadState(): Promise<void> {
  await adapter.init();
  await refreshState();
}

// Liest employers/entries/settings frisch aus dem Adapter, OHNE adapter.init() erneut
// aufzurufen (das würde u.a. die einmalige localStorage-Migration erneut prüfen). Wird von der
// Sync-Engine (syncEngine/engine.ts) nach einem Push/Pull aufgerufen, damit die UI die evtl. vom
// Server gepullten Änderungen sofort sieht.
export async function refreshState(): Promise<void> {
  state.employers = await adapter.getEmployers();
  state.entries = await adapter.getEntries();
  state.settings = await adapter.getSettings();
}

export async function saveEmployer(e: Employer): Promise<void> {
  await adapter.upsertEmployer(e);
  state.employers = await adapter.getEmployers();
}

export async function deleteEmployer(id: string): Promise<void> {
  await adapter.softDeleteEmployer(id);
  state.employers = await adapter.getEmployers();
}

export async function saveEntry(e: Entry): Promise<void> {
  await adapter.upsertEntry(e);
  state.entries = await adapter.getEntries();
}

export async function deleteEntry(id: string): Promise<void> {
  await adapter.softDeleteEntry(id);
  state.entries = await adapter.getEntries();
}

export async function saveSettings(s: Settings): Promise<void> {
  await adapter.setSettings(s);
  state.settings = await adapter.getSettings();
}
