import { byId } from './dom';
import { state, deleteEntry } from './state';
import { getEffectiveEmployerData, entryTypeLabel } from './calc';
import type { Entry } from './types';
import { renderCalendar } from './calendar';
import { openEditModal, openEntryModal } from './entries';

let currentDayModalDate = '';

export function openDayModal(dateStr: string, entries: Entry[]): void {
  const [y, m, d] = dateStr.split('-');
  byId('day-modal-title').innerText = `Einträge am ${d}.${m}.${y}`;
  const list = byId('day-modal-list');
  list.innerHTML = '';

  entries.forEach(entry => {
    const snap = getEffectiveEmployerData(entry, state.employers);
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between border border-slate-200 rounded-xl px-3 py-2';
    const colorDot = entry.type === 'vacation' ? '#0ea5e9' : entry.type === 'sick' ? '#e11d48' : snap ? snap.color : '#94a3b8';
    const label = snap ? snap.name : 'Unbekannt';
    const typeSuffix = entry.type === 'vacation' ? ' · Urlaub' : entry.type === 'sick' ? ' · Krank' : '';
    row.innerHTML = `
      <div class="flex items-center gap-2 text-sm">
        <span class="w-3 h-3 rounded-full inline-block" style="background-color:${colorDot}"></span>
        <span class="font-medium text-slate-800">${label}${typeSuffix}</span>
        <span class="text-slate-500">${entryTypeLabel(entry)}</span>
      </div>
      <div class="flex items-center gap-3 text-slate-400">
        <button class="hover:text-slate-700"><i class="fa-solid fa-pen"></i></button>
        <button class="hover:text-rose-600"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    const buttons = row.querySelectorAll('button');
    const editBtn = buttons[0];
    const delBtn = buttons[1];
    editBtn.onclick = () => {
      closeDayModal();
      openEditModal(entry);
    };
    delBtn.onclick = async () => {
      if (confirm('Diesen Eintrag wirklich löschen?')) {
        await deleteEntry(entry.id);
        renderCalendar();
        const remaining = state.entries.filter(e => e.date === dateStr);
        if (remaining.length > 0) openDayModal(dateStr, remaining);
        else closeDayModal();
      }
    };
    list.appendChild(row);
  });

  currentDayModalDate = dateStr;
  byId('day-modal').classList.remove('hidden');
}

export function closeDayModal(): void {
  byId('day-modal').classList.add('hidden');
}

export function addEntryFromDayModal(): void {
  const dateStr = currentDayModalDate;
  closeDayModal();
  openEntryModal(dateStr);
}
