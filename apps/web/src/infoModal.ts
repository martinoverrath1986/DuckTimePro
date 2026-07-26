import { byId } from './dom';

export function openInfoModal(): void {
  byId('info-modal').classList.remove('hidden');
}

export function closeInfoModal(): void {
  byId('info-modal').classList.add('hidden');
}
