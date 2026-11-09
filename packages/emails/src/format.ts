import { formatMoney, type Currency } from '@wolleen/core';

export { formatMoney };

export type DateInput = Date | string | number;

export function toDate(d: DateInput): Date {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) throw new Error(`Date invalide : ${String(d)}`);
  return date;
}

/** « 9 novembre 2026 à 14:32:05 » dans le fuseau donné. */
export function formatDateTime(d: DateInput, timeZone = 'Europe/Paris'): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'medium', timeZone }).format(toDate(d));
}

/** « 9 novembre 2026 ». */
export function formatDate(d: DateInput, timeZone = 'Europe/Paris'): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone }).format(toDate(d));
}

/** Horodatage de preuve, UTC, ISO 8601 à la milliseconde. */
export function isoTimestamp(d: DateInput): string {
  return toDate(d).toISOString();
}

export function money(cents: number, currency: Currency = 'EUR') {
  return formatMoney(cents, currency);
}

export function percent(ratio: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(ratio);
}

export function plural(n: number, one: string, many: string) {
  return `${new Intl.NumberFormat('fr-FR').format(n)} ${Math.abs(n) >= 2 ? many : one}`;
}
