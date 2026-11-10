import { describe, expect, it } from 'vitest';
import { rankBySales, rankingWindows, toSalesMap } from './rankings-logic';

const e = (id: string, name = id) => ({ id, name });
const s = (o: Record<string, number>) => new Map(Object.entries(o).map(([k, units]) => [k, { units, revenueCents: units * 100 }]));

describe('rankBySales', () => {
  it('trie par unités vendues, départage par nom puis par identifiant', () => {
    const r = rankBySales([e('a', 'Zèbre'), e('b', 'Âne'), e('c', 'Chat'), e('d', 'âne')], s({ a: 10, b: 5, c: 5, d: 5 }));
    expect(r.map((x) => [x.rank, x.entry.id])).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'd'],
      [4, 'c'],
    ]);
    expect(r[0]).toMatchObject({ units: 10, revenueCents: 1000, trend: 'same', previousRank: null });
  });

  it('ignore les entrées sans vente et respecte la limite', () => {
    const r = rankBySales([e('a'), e('b'), e('c')], s({ a: 1, b: 0, c: 3 }), null, 1);
    expect(r.map((x) => x.entry.id)).toEqual(['c']);
    expect(rankBySales([e('a')], new Map())).toEqual([]);
  });

  it('évolution par rapport au classement précédent', () => {
    const r = rankBySales([e('a'), e('b'), e('c'), e('d')], s({ a: 9, b: 8, c: 7, d: 6 }), s({ a: 1, b: 9, c: 7 }));
    const byId = Object.fromEntries(r.map((x) => [x.entry.id, x]));
    expect(byId.a).toMatchObject({ rank: 1, previousRank: 3, trend: 'up', delta: 2 });
    expect(byId.b).toMatchObject({ rank: 2, previousRank: 1, trend: 'down', delta: -1 });
    expect(byId.c).toMatchObject({ rank: 3, previousRank: 2, trend: 'down', delta: -1 });
    expect(byId.d).toMatchObject({ rank: 4, previousRank: null, trend: 'new', delta: 0 });
  });
});

describe('outils', () => {
  it('fenêtres de 30 jours, comparaison décalée de 7 jours', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    const w = rankingWindows(now);
    expect(w.current.since.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(w.current.until).toEqual(now);
    expect(w.previous.since.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(w.previous.until.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });

  it('toSalesMap convertit les sommes SQL (chaînes ou null)', () => {
    const m = toSalesMap([{ key: 'g', units: '12', revenueCents: null }]);
    expect(m.get('g')).toEqual({ units: 12, revenueCents: 0 });
  });
});
