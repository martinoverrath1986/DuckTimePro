import { byId } from './dom';
import { state, saveEmployer as persistEmployer, deleteEmployer as removeEmployer } from './state';
import type { Employer, WageType } from './types';

export function renderEmployers(): void {
  const list = byId('employer-list');
  list.innerHTML = '';
  state.employers.forEach(emp => {
    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-3';
    const wageInfo =
      emp.wageType === 'salary'
        ? `Festgehalt: <span class="font-semibold text-slate-900">${(emp.monthlySalary || 0).toFixed(2)} €/Monat</span>`
        : `Stundenlohn: <span class="font-semibold text-slate-900">${(emp.wage || 0).toFixed(2)} €/h</span>`;
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="w-4 h-4 rounded-full inline-block" style="background-color: ${emp.color}"></span>
            <h3 class="font-bold text-slate-900">${emp.name}</h3>
            ${emp.isMinijob ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Minijob</span>' : ''}
          </div>
          <p class="text-sm text-slate-600">${wageInfo}</p>
          <p class="text-xs text-slate-500">Soll: ${emp.weeklyTargetHours} Std./Woche · Urlaub: ${emp.vacationDaysPerYear} Tage/Jahr</p>
        </div>
        <div class="flex items-center gap-3 text-slate-400 shrink-0">
          <button class="hover:text-slate-700" title="Bearbeiten"><i class="fa-solid fa-pen"></i></button>
          <button class="hover:text-rose-600" title="Löschen"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
    const buttons = card.querySelectorAll('button');
    buttons[0].onclick = () => openEmployerModal(emp.id);
    buttons[1].onclick = () => handleDeleteEmployer(emp.id);
    list.appendChild(card);
  });
}

export function setWageType(type: WageType): void {
  byId<HTMLInputElement>('employer-wagetype').value = type;
  document.querySelectorAll<HTMLButtonElement>('.wage-type-btn').forEach(btn => {
    if (btn.dataset.wagetype === type) {
      btn.className = 'wage-type-btn px-2 py-2 rounded-xl text-sm font-medium border-2 border-duck-500 bg-duck-50 text-duck-700';
    } else {
      btn.className = 'wage-type-btn px-2 py-2 rounded-xl text-sm font-medium border border-slate-300 text-slate-600';
    }
  });

  const hourlyField = byId('employer-hourly-field');
  const salaryField = byId('employer-salary-field');
  const wageInput = byId<HTMLInputElement>('employer-wage');
  const salaryInput = byId<HTMLInputElement>('employer-salary');

  if (type === 'hourly') {
    hourlyField.classList.remove('hidden');
    salaryField.classList.add('hidden');
    wageInput.required = true;
    salaryInput.required = false;
  } else {
    hourlyField.classList.add('hidden');
    salaryField.classList.remove('hidden');
    wageInput.required = false;
    salaryInput.required = true;
  }
}

export function openEmployerModal(empId: string | null = null): void {
  (byId('employer-form') as HTMLFormElement).reset();
  if (empId) {
    const emp = state.employers.find(e => e.id === empId);
    if (!emp) return;
    byId('employer-modal-title').innerText = 'Arbeitgeber bearbeiten';
    byId<HTMLInputElement>('employer-id').value = emp.id;
    byId<HTMLInputElement>('employer-name').value = emp.name;
    byId<HTMLInputElement>('employer-wage').value = String(emp.wage || '');
    byId<HTMLInputElement>('employer-salary').value = String(emp.monthlySalary || '');
    byId<HTMLInputElement>('employer-target-hours').value = String(emp.weeklyTargetHours);
    byId<HTMLInputElement>('employer-vacation-days').value = String(emp.vacationDaysPerYear);
    byId<HTMLInputElement>('employer-is-minijob').checked = !!emp.isMinijob;
    byId<HTMLInputElement>('employer-color').value = emp.color;
    setWageType(emp.wageType || 'hourly');
  } else {
    byId('employer-modal-title').innerText = 'Arbeitgeber hinzufügen';
    byId<HTMLInputElement>('employer-id').value = '';
    setWageType('hourly');
  }
  byId('employer-modal').classList.remove('hidden');
}

export function closeEmployerModal(): void {
  byId('employer-modal').classList.add('hidden');
}

export async function handleSaveEmployer(e: Event): Promise<void> {
  e.preventDefault();
  const id = byId<HTMLInputElement>('employer-id').value;
  const wageType = byId<HTMLInputElement>('employer-wagetype').value as WageType;

  const empData: Employer = {
    id: id || crypto.randomUUID(),
    name: byId<HTMLInputElement>('employer-name').value,
    wageType,
    wage: wageType === 'hourly' ? parseFloat(byId<HTMLInputElement>('employer-wage').value) || 0 : 0,
    monthlySalary: wageType === 'salary' ? parseFloat(byId<HTMLInputElement>('employer-salary').value) || 0 : 0,
    weeklyTargetHours: parseFloat(byId<HTMLInputElement>('employer-target-hours').value) || 40,
    vacationDaysPerYear: parseInt(byId<HTMLInputElement>('employer-vacation-days').value, 10) || 20,
    isMinijob: byId<HTMLInputElement>('employer-is-minijob').checked,
    color: byId<HTMLInputElement>('employer-color').value,
    updatedAt: '',
    deletedAt: null,
    dirty: false
  };

  await persistEmployer(empData);
  closeEmployerModal();
  renderEmployers();
}

async function handleDeleteEmployer(id: string): Promise<void> {
  if (confirm('Arbeitgeber löschen? Zugehörige Einträge bleiben bestehen (dank gespeicherter Schnappschüsse bleiben Lohn/Stunden dort weiterhin korrekt sichtbar).')) {
    await removeEmployer(id);
    renderEmployers();
  }
}
