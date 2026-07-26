import { byId } from './dom';
import { state, saveEntry as persistEntry, deleteEntry } from './state';
import { findOverlaps, getEffectiveEmployerData } from './calc';
import type { Entry, EntryType } from './types';
import { renderCalendar } from './calendar';

export function updateEmployerDropdown(): void {
  const select = byId<HTMLSelectElement>('entry-employer');
  select.innerHTML = '';
  state.employers.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    const wageInfo = emp.wageType === 'salary' ? `${(emp.monthlySalary || 0).toFixed(2)} €/Monat` : `${(emp.wage || 0).toFixed(2)} €/h`;
    opt.innerText = `${emp.name} (${wageInfo})${emp.isMinijob ? ' · Minijob' : ''}`;
    select.appendChild(opt);
  });

  const expSelect = byId<HTMLSelectElement>('export-employer-select');
  expSelect.innerHTML = '<option value="all">Alle Arbeitgeber</option>';
  state.employers.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.innerText = emp.name;
    expSelect.appendChild(opt);
  });
}

export function setEntryType(type: EntryType): void {
  byId<HTMLInputElement>('entry-type').value = type;
  document.querySelectorAll<HTMLButtonElement>('.entry-type-btn').forEach(btn => {
    if (btn.dataset.type === type) {
      btn.className = 'entry-type-btn px-2 py-2 rounded-xl text-sm font-medium border-2 border-duck-500 bg-duck-50 text-duck-700';
    } else {
      btn.className = 'entry-type-btn px-2 py-2 rounded-xl text-sm font-medium border border-slate-300 text-slate-600';
    }
  });

  const workFields = byId('entry-work-fields');
  const absenceFields = byId('entry-absence-fields');
  const startInput = byId<HTMLInputElement>('entry-start');
  const endInput = byId<HTMLInputElement>('entry-end');

  if (type === 'work') {
    workFields.classList.remove('hidden');
    absenceFields.classList.add('hidden');
    startInput.required = true;
    endInput.required = true;
  } else {
    workFields.classList.add('hidden');
    absenceFields.classList.remove('hidden');
    startInput.required = false;
    endInput.required = false;
  }
}

export function openEntryModal(dateStr = ''): void {
  updateEmployerDropdown();
  byId<HTMLInputElement>('entry-id').value = '';
  (byId('entry-form') as HTMLFormElement).reset();
  byId('modal-title').innerText = 'Neuer Eintrag';
  byId('delete-entry-btn').classList.add('hidden');
  setEntryType('work');

  byId<HTMLInputElement>('entry-date').value = dateStr || new Date().toISOString().split('T')[0];
  byId('entry-modal').classList.remove('hidden');
}

export function openEditModal(entry: Entry): void {
  updateEmployerDropdown();
  byId<HTMLInputElement>('entry-id').value = entry.id;
  byId<HTMLSelectElement>('entry-employer').value = entry.employerId;
  byId<HTMLInputElement>('entry-date').value = entry.date;
  byId<HTMLInputElement>('entry-start').value = entry.start || '';
  byId<HTMLInputElement>('entry-end').value = entry.end || '';
  byId<HTMLInputElement>('entry-break').value = String(entry.break || 0);
  byId<HTMLTextAreaElement>('entry-note').value = entry.note || '';
  byId<HTMLSelectElement>('entry-duration').value = entry.duration || 'full';
  byId('modal-title').innerText = 'Eintrag bearbeiten';
  byId('delete-entry-btn').classList.remove('hidden');
  setEntryType(entry.type || 'work');
  byId('entry-modal').classList.remove('hidden');
}

export function closeEntryModal(): void {
  byId('entry-modal').classList.add('hidden');
}

export async function handleSaveEntry(e: Event): Promise<void> {
  e.preventDefault();
  const id = byId<HTMLInputElement>('entry-id').value;
  const type = byId<HTMLInputElement>('entry-type').value as EntryType;
  const employerId = byId<HTMLSelectElement>('entry-employer').value;

  const entryData: Entry = {
    id: id || crypto.randomUUID(),
    type,
    employerId,
    date: byId<HTMLInputElement>('entry-date').value,
    start: type === 'work' ? byId<HTMLInputElement>('entry-start').value : '',
    end: type === 'work' ? byId<HTMLInputElement>('entry-end').value : '',
    break: type === 'work' ? Number(byId<HTMLInputElement>('entry-break').value) : 0,
    duration: type !== 'work' ? (byId<HTMLSelectElement>('entry-duration').value as 'full' | 'half') : '',
    note: byId<HTMLTextAreaElement>('entry-note').value,
    snapshot: null,
    updatedAt: '',
    deletedAt: null,
    dirty: false
  };

  if (type === 'work' && entryData.start && entryData.end && entryData.end <= entryData.start) {
    alert('Die "Bis"-Zeit muss nach der "Von"-Zeit liegen.');
    return;
  }

  // Feedback-Punkt 7: Überschneidungs-Warnung
  const overlaps = findOverlaps(entryData, state.entries);
  if (overlaps.length > 0) {
    const details = overlaps
      .map(o => `${getEffectiveEmployerData(o, state.employers)?.name ?? 'Unbekannt'} (${o.start}-${o.end})`)
      .join(', ');
    const proceed = confirm(`Achtung: Dieser Eintrag überschneidet sich zeitlich mit: ${details}.\n\nTrotzdem speichern?`);
    if (!proceed) return;
  }

  // Feedback-Punkt 4: Lohn/Soll-Stunden als Schnappschuss einfrieren
  const emp = state.employers.find(em => em.id === employerId);
  entryData.snapshot = emp
    ? {
        name: emp.name, color: emp.color, wageType: emp.wageType, wage: emp.wage,
        monthlySalary: emp.monthlySalary, weeklyTargetHours: emp.weeklyTargetHours,
        vacationDaysPerYear: emp.vacationDaysPerYear, isMinijob: emp.isMinijob
      }
    : null;

  await persistEntry(entryData);
  closeEntryModal();
  renderCalendar();
}

export async function handleDeleteCurrentEntry(): Promise<void> {
  const id = byId<HTMLInputElement>('entry-id').value;
  if (id && confirm('Möchtest du diesen Eintrag wirklich löschen?')) {
    await deleteEntry(id);
    closeEntryModal();
    renderCalendar();
  }
}
