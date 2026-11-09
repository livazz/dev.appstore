import type { Period } from '@devappstore/core';

/** `subscriptionPeriod` App Store Connect → `Period` Dev AppStore (null si non représentable). */
export function applePeriod(value: string | undefined | null): Period | null {
  switch (value) {
    case 'ONE_WEEK':
      return 'week';
    case 'ONE_MONTH':
      return 'month';
    case 'ONE_YEAR':
      return 'year';
    default:
      return null; // TWO_MONTHS, THREE_MONTHS, SIX_MONTHS
  }
}

/** Durée ISO 8601 Google Play (`P1W`, `P7D`, `P1M`, `P1Y`, `P12M`…) → `Period` Dev AppStore (null si non représentable). */
export function isoPeriod(value: string | undefined | null): Period | null {
  if (!value) return null;
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(value.trim().toUpperCase());
  if (!m || m[0] === 'P') return null;
  const [y, mo, w, d] = m.slice(1).map((x) => Number(x ?? 0)) as [number, number, number, number];
  const days = d + w * 7;
  if (y === 0 && mo === 0 && days === 7) return 'week';
  if (y === 0 && mo === 1 && days === 0) return 'month';
  if (((y === 1 && mo === 0) || (y === 0 && mo === 12)) && days === 0) return 'year';
  return null;
}
