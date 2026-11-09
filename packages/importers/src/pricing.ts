import { PRICE_TIERS_CENTS, type Currency } from '@wolleen/core';

/** Devises acceptées par Wolleen (miroir de `Currency` de @wolleen/core). */
export const SUPPORTED_CURRENCIES: readonly Currency[] = ['EUR', 'USD', 'GBP'];

export function toCurrency(code: string | undefined | null): Currency | null {
  if (!code) return null;
  const up = code.toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(up) ? (up as Currency) : null;
}

/**
 * Remise web suggérée par défaut (20 %) : le studio paie ~5 % au lieu de 30 %,
 * il peut donc rétrocéder une partie de l'économie au joueur et gagner quand même plus.
 */
export const DEFAULT_WEB_DISCOUNT_BPS = 2000;

/**
 * Propose un prix web à partir du prix store : applique la remise `discountBps` (points de base)
 * puis arrondit au palier `PRICE_TIERS_CENTS` inférieur le plus proche (jamais au-dessus du prix remisé).
 *
 * - Au-delà du palier le plus élevé, arrondit à « X,99 » inférieur (ex. 149,99 → 119,99 avec 20 %).
 * - Retourne `null` si le prix remisé est sous le plus petit palier (aucun palier ne convient).
 */
export function suggestWebPrice(priceCents: number, discountBps: number = DEFAULT_WEB_DISCOUNT_BPS): number | null {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
  if (!Number.isFinite(discountBps) || discountBps < 0 || discountBps >= 10_000) {
    throw new RangeError(`discountBps doit être compris entre 0 et 9999 (reçu : ${discountBps})`);
  }
  const target = Math.floor((priceCents * (10_000 - discountBps)) / 10_000);
  const tiers = PRICE_TIERS_CENTS;
  const top = tiers[tiers.length - 1]!;
  if (target > top) {
    const ninetyNine = Math.floor((target + 1) / 100) * 100 - 1;
    return Math.max(ninetyNine, top);
  }
  let best: number | null = null;
  for (const tier of tiers) {
    if (tier <= target) best = tier;
    else break;
  }
  return best;
}

/** « 4.99 » (chaîne décimale Apple) → 499. Gère aussi « 5 », « 0.5 », « 1,99 ». */
export function decimalToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(',', '.');
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const units = Number(m[1]);
  const frac = (m[2] ?? '').padEnd(3, '0');
  // arrondi au centime le plus proche sur la 3e décimale
  const cents = Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  return units * 100 + cents;
}

/** google.type.Money `{ units: "4", nanos: 990000000 }` → 499. */
export function moneyToCents(money: { currencyCode?: string; units?: string | number; nanos?: number } | null | undefined): number | null {
  if (!money) return null;
  const units = Number(money.units ?? 0);
  const nanos = Number(money.nanos ?? 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  return Math.round(units * 100 + nanos / 10_000_000);
}

/** Prix Google en micro-unités `"4990000"` → 499. */
export function microsToCents(micros: string | number | null | undefined): number | null {
  if (micros === null || micros === undefined || micros === '') return null;
  const n = Number(micros);
  if (!Number.isFinite(n)) return null;
  return Math.round(n / 10_000);
}
