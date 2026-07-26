import { byId, MONTH_NAMES } from './dom';
import { state } from './state';
import { computeEmployerStats } from './calc';

export function changeStatsMonth(direction: number): void {
  state.statsDate.setMonth(state.statsDate.getMonth() + direction);
  updateStats();
}

export function updateStats(): void {
  const year = state.statsDate.getFullYear();
  const month = state.statsDate.getMonth();
  byId('stats-month-label').innerText = `${MONTH_NAMES[month]} ${year}`;

  let totalHours = 0;
  let totalEarnings = 0;
  let totalOvertime = 0;
  const container = byId('stats-employer-cards');
  container.innerHTML = '';

  if (state.employers.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-500">Noch keine Arbeitgeber angelegt.</p>';
  }

  state.employers.forEach(emp => {
    const s = computeEmployerStats(emp, state.entries, year, month);
    totalHours += s.hours;
    totalEarnings += s.earnings;
    totalOvertime += s.overtime;

    const minijobLimit = state.settings.minijobLimit || 603;
    const pct = emp.isMinijob ? Math.min(999, (s.earnings / minijobLimit) * 100) : 0;
    let barColor = 'bg-emerald-500';
    if (pct >= 100) barColor = 'bg-rose-600';
    else if (pct >= 85) barColor = 'bg-amber-500';

    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4';
    card.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="w-3.5 h-3.5 rounded-full inline-block" style="background-color:${emp.color}"></span>
          <h4 class="font-bold text-slate-900">${emp.name}</h4>
          ${emp.isMinijob ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Minijob</span>' : ''}
        </div>
        ${emp.wageType === 'salary' ? `<span class="text-xs text-slate-500">Festgehalt: ${(emp.monthlySalary || 0).toFixed(2)} €/Monat</span>` : ''}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div><p class="text-xs text-slate-500">Ist-Stunden</p><p class="text-lg font-bold text-slate-900">${s.hours.toFixed(1)} h</p></div>
        <div><p class="text-xs text-slate-500">Soll-Stunden</p><p class="text-lg font-bold text-slate-900">${s.targetHours.toFixed(1)} h</p></div>
        <div><p class="text-xs text-slate-500">Überstunden</p><p class="text-lg font-bold ${s.overtime >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${s.overtime >= 0 ? '+' : ''}${s.overtime.toFixed(1)} h</p></div>
        <div><p class="text-xs text-slate-500">Verdienst</p><p class="text-lg font-bold text-duck-600">${s.earnings.toFixed(2)} €</p></div>
        <div><p class="text-xs text-slate-500">Resturlaub / Krank (Jahr)</p><p class="text-sm font-semibold text-slate-900">${s.vacationLeft.toFixed(1)} Tage <span class="text-rose-600">· ${s.sickDays.toFixed(1)} krank</span></p></div>
      </div>
      ${
        emp.isMinijob
          ? `<div>
        <div class="flex justify-between text-xs text-slate-500 mb-1">
          <span>Minijob-Grenze</span>
          <span>${s.earnings.toFixed(2)} € von ${minijobLimit.toFixed(0)} € (${pct.toFixed(0)}%)</span>
        </div>
        <div class="progress-track"><div class="progress-fill ${barColor}" style="width:${Math.min(100, pct)}%"></div></div>
        ${pct >= 100 ? '<p class="text-xs text-rose-600 mt-1">Grenze diesen Monat überschritten – im echten Jahr max. 2x erlaubt.</p>' : pct >= 85 ? '<p class="text-xs text-amber-600 mt-1">Nähert sich der Grenze.</p>' : ''}
      </div>`
          : ''
      }
    `;
    container.appendChild(card);
  });

  byId('stat-overall-hours').innerText = `${totalHours.toFixed(1)} h`;
  byId('stat-overall-earnings').innerText = `${totalEarnings.toFixed(2)} €`;
  byId('stat-total-entries').innerText = String(state.entries.length);
  const overallOvertimeEl = byId('stat-overall-overtime');
  overallOvertimeEl.innerText = `${totalOvertime >= 0 ? '+' : ''}${totalOvertime.toFixed(1)} h`;
  overallOvertimeEl.className = `text-xl font-bold mt-0.5 ${totalOvertime >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
}
