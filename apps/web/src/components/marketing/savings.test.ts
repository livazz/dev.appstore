import { describe, expect, it } from 'vitest';
import { bpsToPercentLabel, estimateSavings, keptPercentLabel } from './savings';

const FEES = { storeFeeBps: 3000, platformFeeBps: 500 };

describe('estimateSavings', () => {
  it('calcule le gain annuel sur la part basculée (30 % stores vs 5 % Wolleen)', () => {
    const r = estimateSavings({ monthlyRevenueCents: 2_000_000, webSharePct: 30, storeFeeBps: 3000, platformFeeBps: 500 });
    expect(r.annualWebCents).toBe(7_200_000);
    expect(r.annualStoreFeeCents).toBe(2_160_000);
    expect(r.annualPlatformFeeCents).toBe(360_000);
    expect(r.annualGainCents).toBe(1_800_000);
  });

  it('borne les entrées invalides', () => {
    expect(estimateSavings({ monthlyRevenueCents: -5, webSharePct: 50, ...FEES }).annualGainCents).toBe(0);
    expect(estimateSavings({ monthlyRevenueCents: Number.NaN, webSharePct: 50, ...FEES }).annualGainCents).toBe(0);
    expect(estimateSavings({ monthlyRevenueCents: 100_00, webSharePct: 150, ...FEES }).annualWebCents).toBe(120_000);
  });
});

describe('cohérence avec @wolleen/core', () => {
  it('utilise les mêmes arrondis que feeCents / savingsVsStores', async () => {
    const core = await import('@wolleen/core');
    for (const cents of [0, 1, 99, 12_345, 2_000_000]) {
      const r = estimateSavings({
        monthlyRevenueCents: cents,
        webSharePct: 100,
        storeFeeBps: core.STORE_FEE_BPS,
        platformFeeBps: core.DEFAULT_PLATFORM_FEE_BPS,
      });
      expect(r.annualStoreFeeCents).toBe(core.feeCents(cents * 12, core.STORE_FEE_BPS));
      expect(r.annualGainCents).toBe(core.savingsVsStores(cents * 12, core.DEFAULT_PLATFORM_FEE_BPS));
    }
  });
});

describe('libellés', () => {
  it('formate les points de base en pourcentage', () => {
    expect(bpsToPercentLabel(3000).replace(/\s/g, ' ')).toBe('30 %');
    expect(keptPercentLabel(500).replace(/\s/g, ' ')).toBe('95 %');
  });
});
