import { describe, expect, it } from 'vitest';
import { decimalToCents, microsToCents, moneyToCents, suggestWebPrice, toCurrency } from './pricing';
import { applePeriod, isoPeriod } from './periods';

describe('suggestWebPrice', () => {
  it('applique la remise puis arrondit au palier inférieur', () => {
    expect(suggestWebPrice(999, 2000)).toBe(799); // 7,99 exactement un palier
    expect(suggestWebPrice(499, 2000)).toBe(399);
    expect(suggestWebPrice(199, 2000)).toBe(149); // 1,59 → 1,49
    expect(suggestWebPrice(1999, 1500)).toBe(1699); // 16,99 → 16,99
    expect(suggestWebPrice(1000, 0)).toBe(999);
    expect(suggestWebPrice(9999, 0)).toBe(9999);
  });

  it('utilise 20 % de remise par défaut', () => {
    expect(suggestWebPrice(999)).toBe(799);
  });

  it("ne descend jamais à 99,99 pour un article plus cher que le dernier palier", () => {
    expect(suggestWebPrice(14999, 2000)).toBe(11999);
    expect(suggestWebPrice(10999, 500)).toBe(10399);
    expect(suggestWebPrice(10100, 0)).toBe(10099);
  });

  it('retourne null sous le plus petit palier ou pour un prix nul', () => {
    expect(suggestWebPrice(49, 2000)).toBeNull();
    expect(suggestWebPrice(0, 2000)).toBeNull();
  });

  it('refuse une remise hors bornes', () => {
    expect(() => suggestWebPrice(999, 10_000)).toThrow(RangeError);
    expect(() => suggestWebPrice(999, -1)).toThrow(RangeError);
  });
});

describe('conversions de montants', () => {
  it('chaînes décimales Apple → centimes', () => {
    expect(decimalToCents('0.99')).toBe(99);
    expect(decimalToCents('4.9')).toBe(490);
    expect(decimalToCents('10')).toBe(1000);
    expect(decimalToCents('1,99')).toBe(199);
    expect(decimalToCents('0.995')).toBe(100);
    expect(decimalToCents('abc')).toBeNull();
    expect(decimalToCents(undefined)).toBeNull();
  });

  it('google.type.Money et micros → centimes', () => {
    expect(moneyToCents({ currencyCode: 'EUR', units: '4', nanos: 990_000_000 })).toBe(499);
    expect(moneyToCents({ units: '0', nanos: 500_000_000 })).toBe(50);
    expect(moneyToCents({ units: '12' })).toBe(1200);
    expect(microsToCents('990000')).toBe(99);
    expect(microsToCents('39990000')).toBe(3999);
  });

  it('devises gérées', () => {
    expect(toCurrency('eur')).toBe('EUR');
    expect(toCurrency('JPY')).toBeNull();
  });
});

describe('périodes', () => {
  it('App Store', () => {
    expect(applePeriod('ONE_WEEK')).toBe('week');
    expect(applePeriod('ONE_MONTH')).toBe('month');
    expect(applePeriod('ONE_YEAR')).toBe('year');
    expect(applePeriod('THREE_MONTHS')).toBeNull();
  });

  it('ISO 8601 Google Play', () => {
    expect(isoPeriod('P1W')).toBe('week');
    expect(isoPeriod('P7D')).toBe('week');
    expect(isoPeriod('P1M')).toBe('month');
    expect(isoPeriod('P1Y')).toBe('year');
    expect(isoPeriod('P12M')).toBe('year');
    expect(isoPeriod('P3M')).toBeNull();
    expect(isoPeriod('P6M')).toBeNull();
    expect(isoPeriod('P')).toBeNull();
    expect(isoPeriod(undefined)).toBeNull();
  });
});
