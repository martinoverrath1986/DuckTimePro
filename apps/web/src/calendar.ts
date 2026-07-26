import { byId, MONTH_NAMES } from './dom';
import { state } from './state';
import { calcEntryHours, calcEntryEarnings, entryTypeLabel, getEffectiveEmployerData } from './calc';
import type { Entry } from './types';
import { openDayModal } from './dayModal';
import { openEntryModal } from './entries';

export function updateCalendarFilterOptions(): void {
  const sel = byId<HTMLSelectElement>('calendar-employer-filter');
  const current = state.calendarFilterEmployer;
  sel.innerHTML = '<option value="all">Alle Arbeitgeber</option>';
  state.employers.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.innerText = emp.name;
    sel.appendChild(opt);
  });
  sel.value = state.employers.find(e => e.id === current) ? current : 'all';
}

export function onCalendarFilterChange(): void {
  state.calendarFilterEmployer = byId<HTMLSelectElement>('calendar-employer-filter').value;
  renderCalendar();
}

export function changeMonth(direction: number): void {
  state.currentDate.setMonth(state.currentDate.getMonth() + direction);
  renderCalendar();
}

export function resetToCurrentMonth(): void {
  state.currentDate = new Date();
  renderCalendar();
}

export function renderCalendar(): void {
  const grid = byId('calendar-grid');
  grid.innerHTML = '';

  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  const filterEmp = state.calendarFilterEmployer || 'all';

  byId('calendar-month-year').innerText = `${MONTH_NAMES[month]} ${year}`;

  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();

  let monthHours = 0;
  let monthEarnings = 0;

  const prevDays = new Date(year, month, 0).getDate();
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    grid.appendChild(createDayCell(prevDays - i, true));
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    let dayEntries = state.entries.filter(e => e.date === dateStr);
    if (filterEmp !== 'all') dayEntries = dayEntries.filter(e => e.employerId === filterEmp);

    grid.appendChild(createDayCell(day, false, dateStr, dayEntries));

    dayEntries.forEach(entry => {
      monthHours += calcEntryHours(entry, state.employers);
      monthEarnings += calcEntryEarnings(entry, state.employers);
    });
  }

  byId('calendar-month-summary').innerText = `Gesamt: ${monthHours.toFixed(1)} Std. | ${monthEarnings.toFixed(2)} €`;
}

function createDayCell(dayNum: number, isOtherMonth = false, dateStr = '', entries: Entry[] = []): HTMLElement {
  const cell = document.createElement('div');
  cell.className = `bg-white min-h-[100px] p-2 flex flex-col justify-between transition ${
    isOtherMonth ? 'opacity-40 bg-slate-50' : 'hover:bg-slate-50 cursor-pointer'
  }`;

  const topRow = document.createElement('div');
  topRow.className = 'flex justify-between items-center';
  topRow.innerHTML = `<span class="text-xs font-semibold text-slate-600">${dayNum}</span>`;
  cell.appendChild(topRow);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'space-y-1 overflow-y-auto max-h-[70px]';

  entries.forEach(entry => {
    const snap = getEffectiveEmployerData(entry, state.employers);
    const badge = document.createElement('div');
    let extraClass = 'badge-work';
    let bg = snap ? snap.color : '#cbd5e1';
    let label = snap ? snap.name : 'Job';
    if (entry.type === 'vacation') {
      extraClass = 'badge-vacation';
      bg = '';
      label = `Urlaub (${snap ? snap.name : '?'})`;
    }
    if (entry.type === 'sick') {
      extraClass = 'badge-sick';
      bg = '';
      label = `Krank (${snap ? snap.name : '?'})`;
    }
    badge.className = `text-[10px] px-1.5 py-0.5 rounded font-medium truncate shadow-2xs ${extraClass}`;
    if (bg) badge.style.backgroundColor = bg;
    badge.innerText = entry.type === 'work' ? `${label}: ${entryTypeLabel(entry)}` : label;
    contentDiv.appendChild(badge);
  });
  cell.appendChild(contentDiv);

  if (!isOtherMonth && dateStr) {
    cell.onclick = () => {
      if (entries.length > 0) openDayModal(dateStr, entries);
      else openEntryModal(dateStr);
    };
  }

  return cell;
}
