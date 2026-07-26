// Einstiegspunkt der App. Bindet alle Module zusammen und hängt die Funktionen, die im HTML
// per onclick="..."/onsubmit="..." referenziert werden, bewusst 1:1 unter denselben Namen an
// `window` – damit bleibt das (im Chat bereits getestete) HTML-Markup aus dem Prototyp nahezu
// unverändert, nur das eingebettete <script> wurde in diese Module aufgeteilt.

import './styles/tailwind.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

import { registerPwaAssets } from './pwa';
import { loadState } from './state';
import {
  renderCalendar, changeMonth, resetToCurrentMonth, onCalendarFilterChange,
  updateCalendarFilterOptions
} from './calendar';
import { closeDayModal, addEntryFromDayModal } from './dayModal';
import {
  openEntryModal, closeEntryModal, setEntryType, handleSaveEntry,
  handleDeleteCurrentEntry, updateEmployerDropdown
} from './entries';
import {
  renderEmployers, openEmployerModal, closeEmployerModal, setWageType, handleSaveEmployer
} from './employers';
import { changeStatsMonth, updateStats } from './stats';
import { exportToExcel, exportJSON, importJSON } from './export';
import {
  handleCreatePairingCode, handleRedeemPairingCode, handleRunSync,
  refreshIdentityBadge, updateLastSyncBadge
} from './sync';
import { ensureIdentity } from './auth/identity';
import { runSync } from './syncEngine/engine';
import { openSettingsModal, closeSettingsModal, handleSaveSettings } from './settingsModal';
import { openInfoModal, closeInfoModal } from './infoModal';

type TabId = 'calendar' | 'employers' | 'stats' | 'sync';
const TABS: TabId[] = ['calendar', 'employers', 'stats', 'sync'];

function switchTab(tabId: TabId): void {
  TABS.forEach(t => {
    document.getElementById(`view-${t}`)!.classList.add('hidden');
    document.getElementById(`tab-${t}`)!.className =
      'py-4 px-1 border-b-2 font-medium text-sm border-transparent text-slate-500 hover:text-slate-700 flex items-center gap-2 whitespace-nowrap';
  });
  document.getElementById(`view-${tabId}`)!.classList.remove('hidden');
  document.getElementById(`tab-${tabId}`)!.className =
    'py-4 px-1 border-b-2 font-medium text-sm border-duck-500 text-duck-600 flex items-center gap-2 whitespace-nowrap';

  if (tabId === 'calendar') {
    updateCalendarFilterOptions();
    renderCalendar();
  }
  if (tabId === 'employers') renderEmployers();
  if (tabId === 'stats') {
    updateEmployerDropdown();
    updateStats();
  }
}

// --- Globale Anbindung für die onclick-/onsubmit-Attribute im HTML ---
Object.assign(window, {
  switchTab,
  changeMonth,
  resetToCurrentMonth,
  onCalendarFilterChange,
  closeDayModal,
  addEntryFromDayModal,
  openModal: openEntryModal,
  closeModal: closeEntryModal,
  setEntryType,
  saveEntry: handleSaveEntry,
  deleteCurrentEntry: handleDeleteCurrentEntry,
  openEmployerModal,
  closeEmployerModal,
  setWageType,
  saveEmployer: handleSaveEmployer,
  changeStatsMonth,
  exportToExcel,
  exportJSON,
  importJSON,
  handleCreatePairingCode,
  handleRedeemPairingCode,
  handleRunSync,
  openSettingsModal,
  closeSettingsModal,
  saveSettings: handleSaveSettings,
  openInfoModal,
  closeInfoModal
});

async function bootstrap(): Promise<void> {
  registerPwaAssets();
  await loadState();
  setEntryType('work');
  updateCalendarFilterOptions();
  renderCalendar();

  // Cloud-Identität + anschließenden Auto-Sync im Hintergrund anstoßen. Die erste Bildschirm-
  // Darstellung oben ist davon unabhängig (rein lokale Daten) – die App muss auch ganz ohne
  // Internetverbindung/Supabase-Konfiguration sofort nutzbar sein. Deshalb hier bewusst kein
  // "await bootstrap()" von außen, das auf diesen Teil warten würde.
  const identityStatus = await ensureIdentity().catch(err => {
    console.error('DuckTime: ensureIdentity() fehlgeschlagen', err);
    return 'error' as const;
  });
  await refreshIdentityBadge();

  if (identityStatus === 'ready') {
    try {
      await runSync();
      await updateLastSyncBadge();
      updateCalendarFilterOptions();
      renderCalendar();
      renderEmployers();
      updateStats();
    } catch (err) {
      console.error('DuckTime: Automatischer Sync beim Start fehlgeschlagen', err);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch(err => console.error('DuckTime: Fehler beim Start', err));
});
