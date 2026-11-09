import type { Currency, StoreItem } from '../types';
import { PERIODS } from './constants';

export function money(v: number, currency: Currency = 'EUR') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(v);
}

export function periodSuffix(item: StoreItem) {
  if (item.type !== 'auto_renewable' && item.type !== 'non_renewing') return '';
  return PERIODS.find((p) => p.value === item.period)?.short ?? '';
}

export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function randomKey(prefix: string, len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return prefix + Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function dateFr(ts: number) {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
