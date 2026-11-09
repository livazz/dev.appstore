import { describe, expect, it } from 'vitest';
import { bpsToPercentLabel, estimateSavings, keptPercentLabel, netViaStoresCents, parseStoreFeeBps, savingsVsStoreCents } from './savings';

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

describe('commission store configurable (comparatif non trompeur)', () => {
  const OPTIONS = [1500, 3000] as const;

  it('core expose 15 % et 30 %, STORE_FEE_BPS reste exporté pour compatibilité', async () => {
    const core = await import('@wolleen/core');
    expect(core.STORE_FEE_BPS).toBe(3000);
    expect(core.REDUCED_STORE_FEE_BPS).toBe(1500);
    expect([...core.STORE_FEE_OPTIONS_BPS]).toEqual([1500, 3000]);
  });

  it('parseStoreFeeBps : pourcentages ou points de base de la liste, sinon défaut 30 %', () => {
    expect(parseStoreFeeBps('15', OPTIONS, 3000)).toBe(1500);
    expect(parseStoreFeeBps('30', OPTIONS, 3000)).toBe(3000);
    expect(parseStoreFeeBps('1500', OPTIONS, 3000)).toBe(1500);
    expect(parseStoreFeeBps(['15', '30'], OPTIONS, 3000)).toBe(1500);
    for (const bad of [undefined, '', '0', '-15', '20', '99', 'abc', '15abc', 'Infinity', {}]) expect(parseStoreFeeBps(bad, OPTIONS, 3000)).toBe(3000);
  });

  it('gain réel à 15 % : commission store évitée − commission Wolleen réelle, jamais négatif', () => {
    expect(savingsVsStoreCents(10_000, 500, 3000)).toBe(2_500);
    expect(savingsVsStoreCents(10_000, 500, 1500)).toBe(1_000);
    expect(savingsVsStoreCents(10_000, 2_000, 1500)).toBe(0);
    expect(netViaStoresCents(10_000, 1500)).toBe(8_500);
    expect(netViaStoresCents(10_000, 3000)).toBe(7_000);
  });

  it('le calculateur donne un gain deux fois et demie plus faible à 15 % qu’à 30 % (5 % Wolleen)', () => {
    const base = { monthlyRevenueCents: 1_000_000, webSharePct: 100, platformFeeBps: 500 };
    const at30 = estimateSavings({ ...base, storeFeeBps: 3000 }).annualGainCents;
    const at15 = estimateSavings({ ...base, storeFeeBps: 1500 }).annualGainCents;
    expect(at30).toBe(3_000_000);
    expect(at15).toBe(1_200_000);
  });
});

describe('libellés', () => {
  it('formate les points de base en pourcentage', () => {
    expect(bpsToPercentLabel(3000).replace(/\s/g, ' ')).toBe('30 %');
    expect(keptPercentLabel(500).replace(/\s/g, ' ')).toBe('95 %');
  });
});
