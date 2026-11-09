import type { Currency } from './types';
import { STORE_FEE_BPS } from './constants';

export function formatMoney(cents: number, currency: Currency = 'EUR', locale = 'fr-FR') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/** Commission arrondie au centime le plus proche. */
export function feeCents(amountCents: number, bps: number) {
  return Math.round((amountCents * bps) / 10_000);
}

/** Ce que le studio gagne en plus par rapport à une vente via les stores. */
export function savingsVsStores(amountCents: number, platformFeeBps: number) {
  return feeCents(amountCents, STORE_FEE_BPS) - feeCents(amountCents, platformFeeBps);
}
