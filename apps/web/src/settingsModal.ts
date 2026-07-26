import { byId } from './dom';
import { state, saveSettings as persistSettings } from './state';
import { updateStats } from './stats';

export function openSettingsModal(): void {
  byId<HTMLInputElement>('settings-minijob-limit').value = String(state.settings.minijobLimit || 603);
  byId('settings-modal').classList.remove('hidden');
}

export function closeSettingsModal(): void {
  byId('settings-modal').classList.add('hidden');
}

export async function handleSaveSettings(e: Event): Promise<void> {
  e.preventDefault();
  const minijobLimit = parseFloat(byId<HTMLInputElement>('settings-minijob-limit').value) || 603;
  await persistSettings({ ...state.settings, minijobLimit });
  closeSettingsModal();
  updateStats();
}
