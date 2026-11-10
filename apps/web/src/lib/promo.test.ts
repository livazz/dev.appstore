import { describe, expect, it } from 'vitest';
import {
  activeDiscountPct,
  chargedPriceCents,
  displayedOldPrice,
  formatRemaining,
  isPromoActive,
  isPromoUpcoming,
  pctOff,
  plannedDiscountPct,
} from './promo';

const NOW = new Date('2026-11-10T12:00:00Z').getTime();
const H = 3_600_000;
const D = 24 * H;
const base = { priceCents: 399, oldPriceCents: 499 };

describe('règle de promo', () => {
  it('sans dates : prix barré supérieur = promo permanente', () => {
    expect(isPromoActive(base, NOW)).toBe(true);
    expect(displayedOldPrice(base, NOW)).toBe(499);
    expect(activeDiscountPct(base, NOW)).toBe(20);
  });

  it('pas de promo sans prix barré supérieur au prix', () => {
    for (const oldPriceCents of [null, 399, 299, 0]) {
      const i = { priceCents: 399, oldPriceCents };
      expect(isPromoActive(i, NOW)).toBe(false);
      expect(displayedOldPrice(i, NOW)).toBeNull();
      expect(activeDiscountPct(i, NOW)).toBe(0);
      expect(isPromoUpcoming({ ...i, promoStartsAt: new Date(NOW + D) }, NOW)).toBe(false);
    }
  });

  it('dans la fenêtre : début inclus, fin exclue', () => {
    const i = { ...base, promoStartsAt: new Date(NOW), promoEndsAt: new Date(NOW + D) };
    expect(isPromoActive(i, NOW)).toBe(true);
    expect(isPromoActive(i, NOW + D - 1)).toBe(true);
    expect(isPromoActive(i, NOW + D)).toBe(false);
    expect(isPromoActive(i, NOW - 1)).toBe(false);
  });

  it('hors fenêtre : prix barré masqué, remise nulle, mais le prix facturé ne change pas', () => {
    const futur = { ...base, promoStartsAt: new Date(NOW + 2 * D) };
    const passe = { ...base, promoEndsAt: new Date(NOW - H) };
    for (const i of [futur, passe]) {
      expect(displayedOldPrice(i, NOW)).toBeNull();
      expect(activeDiscountPct(i, NOW)).toBe(0);
      expect(chargedPriceCents(i)).toBe(399);
    }
    expect(chargedPriceCents({ ...base, promoEndsAt: new Date(NOW + D) })).toBe(399);
  });

  it('dates en chaîne ISO acceptées (données sérialisées vers le client)', () => {
    const i = { ...base, promoStartsAt: new Date(NOW - H).toISOString(), promoEndsAt: new Date(NOW + H).toISOString() };
    expect(isPromoActive(i, NOW)).toBe(true);
  });

  it('à venir : début dans le futur, au plus tard dans 14 jours', () => {
    expect(isPromoUpcoming({ ...base, promoStartsAt: new Date(NOW + D) }, NOW)).toBe(true);
    expect(isPromoUpcoming({ ...base, promoStartsAt: new Date(NOW + 14 * D) }, NOW)).toBe(true);
    expect(isPromoUpcoming({ ...base, promoStartsAt: new Date(NOW + 15 * D) }, NOW)).toBe(false);
    expect(isPromoUpcoming({ ...base, promoStartsAt: new Date(NOW - H) }, NOW)).toBe(false);
    expect(isPromoUpcoming(base, NOW)).toBe(false);
    // fenêtre incohérente (fin avant le début)
    expect(isPromoUpcoming({ ...base, promoStartsAt: new Date(NOW + 2 * D), promoEndsAt: new Date(NOW + D) }, NOW)).toBe(false);
    expect(plannedDiscountPct(base)).toBe(20);
  });

  it('remise arrondie à l’entier inférieur', () => {
    expect(pctOff(299, 999)).toBe(70);
    expect(pctOff(3999, 4999)).toBe(20);
    expect(pctOff(100, null)).toBe(0);
  });

  it('durée restante lisible', () => {
    expect(formatRemaining(2 * D + 5 * H + 10 * 60_000)).toBe('2 j 5 h');
    expect(formatRemaining(3 * H + 7 * 60_000)).toBe('3 h 07 min');
    expect(formatRemaining(30_000)).toBe('1 min');
    expect(formatRemaining(0)).toBe('terminée');
  });
});
