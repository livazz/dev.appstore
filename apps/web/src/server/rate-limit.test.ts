import { describe, expect, it } from 'vitest';
import { MemoryConcurrencyLimiter, MemoryRateLimitStore, getRateLimitStore, setRateLimitStore } from './rate-limit';

const rule = { max: 5, windowMs: 60_000 };
const T = 1_800_000_000_000; // multiple de 60 000 : début de fenêtre

describe('MemoryRateLimitStore (fenêtre glissante)', () => {
  it('accepte jusqu’à max puis refuse avec Retry-After', async () => {
    const s = new MemoryRateLimitStore();
    for (let i = 0; i < 5; i++) expect((await s.hit('k', rule, T + i)).allowed).toBe(true);
    const d = await s.hit('k', rule, T + 10);
    expect(d.allowed).toBe(false);
    // Fenêtre suivante : les 5 hits « pèsent » encore 5 × (1 − e/w) ; il faut e ≥ w × (1 − 4/5) = 12 s.
    if (!d.allowed) expect(d.retryAfterS).toBe(60 + 12);
  });

  it('les clés sont indépendantes ; un refus n’est pas compté', async () => {
    const s = new MemoryRateLimitStore();
    for (let i = 0; i < 5; i++) await s.hit('a', rule, T);
    for (let i = 0; i < 10; i++) expect((await s.hit('a', rule, T + 1)).allowed).toBe(false);
    expect((await s.hit('b', rule, T + 1)).allowed).toBe(true);
    // Les refus n'ont pas prolongé le blocage : au bon moment, une place se libère.
    expect((await s.hit('a', rule, T + 60_000 + 12_001)).allowed).toBe(true);
  });

  it('pas de rafale au changement de fenêtre (contrairement à une fenêtre fixe)', async () => {
    const s = new MemoryRateLimitStore();
    for (let i = 0; i < 5; i++) await s.hit('k', rule, T + 59_000);
    // Juste après le changement de fenêtre, la précédente compte encore presque entièrement.
    expect((await s.hit('k', rule, T + 60_500)).allowed).toBe(false);
    // À mi-fenêtre, il reste 5 × 0,5 = 2,5 → 2 places.
    expect((await s.hit('k', rule, T + 90_000)).allowed).toBe(true);
    expect((await s.hit('k', rule, T + 90_000)).allowed).toBe(true);
    expect((await s.hit('k', rule, T + 90_000)).allowed).toBe(false);
    // Deux fenêtres plus tard, tout est oublié.
    for (let i = 0; i < 5; i++) expect((await s.hit('k', rule, T + 240_000)).allowed).toBe(true);
  });

  it('indique les places restantes', async () => {
    const s = new MemoryRateLimitStore();
    expect(await s.hit('k', rule, T)).toEqual({ allowed: true, remaining: 4 });
    expect(await s.hit('k', rule, T)).toEqual({ allowed: true, remaining: 3 });
  });

  it('mémoire bornée : les clés les moins récemment utilisées sont évincées', async () => {
    const s = new MemoryRateLimitStore(3);
    for (const k of ['a', 'b', 'c', 'd']) await s.hit(k, rule, T);
    expect(s.size).toBe(3);
  });

  it('atomique : 50 requêtes concurrentes, exactement max acceptées', async () => {
    const s = new MemoryRateLimitStore();
    const r = await Promise.all(Array.from({ length: 50 }, () => s.hit('k', rule, T)));
    expect(r.filter((d) => d.allowed)).toHaveLength(5);
  });

  it('magasin partagé remplaçable (Redis plus tard)', async () => {
    const custom = new MemoryRateLimitStore();
    const before = getRateLimitStore();
    setRateLimitStore(custom);
    expect(getRateLimitStore()).toBe(custom);
    setRateLimitStore(before);
  });
});

describe('MemoryConcurrencyLimiter (flux simultanés)', () => {
  it('réserve toutes les clés ou aucune, libération idempotente', () => {
    const c = new MemoryConcurrencyLimiter();
    const slots = (p: string) => [
      { key: `player:${p}`, max: 2 },
      { key: 'key:g', max: 3 },
    ];
    const r1 = c.acquire(slots('p1'))!;
    const r2 = c.acquire(slots('p1'))!;
    expect(c.acquire(slots('p1'))).toBeNull(); // plafond joueur
    expect(c.active('key:g')).toBe(2); // le refus n'a rien réservé
    const r3 = c.acquire(slots('p2'))!;
    expect(c.acquire(slots('p3'))).toBeNull(); // plafond clé
    expect(c.active('player:p3')).toBe(0);
    r1();
    r1();
    expect(c.active('player:p1')).toBe(1);
    expect(c.active('key:g')).toBe(2);
    r2();
    r3();
    expect(c.active('key:g')).toBe(0);
  });
});
