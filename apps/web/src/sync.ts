// UI-Logik für den Sync-Tab. Zwei Bereiche, mit unterschiedlichen Backends:
// - PIN-Kopplung (Meilenstein M2): auth/pairing.ts (createPairingCode/redeemPairingCode) und
//   auth/identity.ts (ensureIdentity, wird beim App-Start in main.ts aufgerufen).
// - Echter Datenabgleich (Meilenstein M3): syncEngine/engine.ts (runSync – Push+Pull gegen
//   Supabase, siehe dort für Details zur Konfliktlösung).
import { byId } from './dom';
import { createPairingCode, redeemPairingCode, getCurrentUserId } from './auth/pairing';
import { supabase } from './auth/supabaseClient';
import { runSync } from './syncEngine/engine';
import { adapter } from './state';
import { renderCalendar } from './calendar';
import { renderEmployers } from './employers';
import { updateStats } from './stats';

let countdownTimer: number | undefined;

export async function refreshIdentityBadge(): Promise<void> {
  const badge = byId('sync-identity-badge');
  if (!supabase) {
    badge.textContent = 'nicht konfiguriert';
    badge.className = 'text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full align-middle';
    return;
  }
  const uid = await getCurrentUserId();
  if (uid) {
    badge.textContent = `verbunden · ${uid.slice(0, 8)}…`;
    badge.className = 'text-xs font-normal text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full align-middle';
  } else {
    badge.textContent = 'nicht verbunden';
    badge.className = 'text-xs font-normal text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full align-middle';
  }
}

export async function updateLastSyncBadge(): Promise<void> {
  const badge = byId('sync-last-badge');
  const ts = await adapter.getLastPulledAt();
  if (ts) {
    const d = new Date(ts);
    const datePart = d.toLocaleDateString('de-DE');
    const timePart = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    badge.textContent = `zuletzt: ${datePart} ${timePart}`;
    badge.className = 'text-xs font-normal text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full align-middle';
  } else {
    badge.textContent = 'noch nie synchronisiert';
    badge.className = 'text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full align-middle';
  }
}

// Aktualisiert alle Ansichten, die gerade sichtbare Daten aus state.employers/entries/settings
// zeigen könnten – nach einem Sync können sich diese ja durch gepullte Änderungen geändert haben.
function refreshVisibleViews(): void {
  renderCalendar();
  renderEmployers();
  updateStats();
}

function setStatus(message: string, isError = false): void {
  const el = byId('sync-status');
  el.textContent = message;
  el.className = isError ? 'text-xs text-red-600 pt-1' : 'text-xs text-slate-500 pt-1';
}

function setDataSyncStatus(message: string, isError = false): void {
  const el = byId('data-sync-status');
  el.textContent = message;
  el.className = isError ? 'text-xs text-red-600 pt-1' : 'text-xs text-slate-500 pt-1';
}

function startCountdown(expiresAt: string): void {
  const expiryEl = byId('pairing-code-expiry');
  if (countdownTimer) window.clearInterval(countdownTimer);

  const tick = () => {
    const secondsLeft = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
    if (secondsLeft <= 0) {
      expiryEl.textContent = 'PIN abgelaufen – bitte neu erzeugen.';
      window.clearInterval(countdownTimer);
      return;
    }
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    expiryEl.textContent = `Gültig für noch ${m}:${s.toString().padStart(2, '0')} Minuten`;
  };
  tick();
  countdownTimer = window.setInterval(tick, 1000);
}

export async function handleCreatePairingCode(): Promise<void> {
  const button = byId<HTMLButtonElement>('btn-create-pin');
  button.disabled = true;
  setStatus('Erzeuge PIN…');
  try {
    const { code, expiresAt } = await createPairingCode();
    byId('pairing-code-display').classList.remove('hidden');
    byId('pairing-code-value').textContent = code;
    startCountdown(expiresAt);
    setStatus('PIN erzeugt – auf dem zweiten Gerät im Feld unten eingeben.');
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'PIN konnte nicht erzeugt werden.', true);
  } finally {
    button.disabled = false;
  }
}

export async function handleRedeemPairingCode(): Promise<void> {
  const input = byId<HTMLInputElement>('pairing-code-input');
  const code = input.value.trim();
  if (!/^\d{6}$/.test(code)) {
    setStatus('Bitte die 6-stellige PIN vom anderen Gerät eingeben.', true);
    return;
  }
  const button = byId<HTMLButtonElement>('btn-redeem-pin');
  button.disabled = true;
  setStatus('Koppele Gerät…');
  try {
    await redeemPairingCode(code);
    input.value = '';
    await refreshIdentityBadge();
    setStatus('Gerät gekoppelt! Synchronisiere Daten…');
    // Direkt nach der Kopplung synchronisieren, damit das neu gekoppelte Gerät sofort die
    // Daten des anderen Geräts bekommt (und umgekehrt seine eigenen hochlädt).
    try {
      await runSync();
      await updateLastSyncBadge();
      refreshVisibleViews();
      setStatus('Gerät gekoppelt und Daten synchronisiert.');
    } catch (syncErr) {
      setStatus(
        `Gerät gekoppelt, aber die erste Synchronisierung ist fehlgeschlagen: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}. Versuch es über "Jetzt synchronisieren" erneut.`,
        true
      );
    }
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Kopplung fehlgeschlagen.', true);
  } finally {
    button.disabled = false;
  }
}

export async function handleRunSync(): Promise<void> {
  const button = byId<HTMLButtonElement>('btn-run-sync');
  button.disabled = true;
  setDataSyncStatus('Synchronisiere…');
  try {
    const result = await runSync();
    const parts: string[] = [];
    if (result.pushedEmployers > 0 || result.pushedEntries > 0 || result.pushedSettings) {
      parts.push(
        `${result.pushedEmployers} Arbeitgeber & ${result.pushedEntries} Einträge hochgeladen${result.pushedSettings ? ' (inkl. Einstellungen)' : ''}`
      );
    }
    if (result.pulledEmployers > 0 || result.pulledEntries > 0 || result.pulledSettings) {
      parts.push(
        `${result.pulledEmployers} Arbeitgeber & ${result.pulledEntries} Einträge von anderen Geräten übernommen${result.pulledSettings ? ' (inkl. Einstellungen)' : ''}`
      );
    }
    setDataSyncStatus(parts.length > 0 ? parts.join(' · ') : 'Bereits aktuell, nichts zu tun.');
    await updateLastSyncBadge();
    refreshVisibleViews();
  } catch (e) {
    setDataSyncStatus(e instanceof Error ? e.message : 'Synchronisierung fehlgeschlagen.', true);
  } finally {
    button.disabled = false;
  }
}
