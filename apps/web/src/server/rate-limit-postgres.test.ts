/*
 * Vague 6 « realtime » — magasin du limiteur partagé entre instances (RATE_LIMIT_STORE=postgres).
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Après fusion, la table sera aussi exportée par '@devappstore/db/schema' (schema/index.ts).
import * as ratelimit from '../../../../packages/db/src/schema/ratelimit';
import { MemoryRateLimitStore, PostgresRateLimitStore, createRateLimitStore, type SqlExecutor } from './rate-limit';

let db: SqlExecutor;

beforeAll(async () => {
  const { pushSchema } = await import('drizzle-kit/api');
  const tdb = drizzle(new PGlite(), { schema: ratelimit });
  const { apply } = await pushSchema(ratelimit, tdb as never);
  await apply();
  db = tdb as unknown as SqlExecutor;
}, 60_000);

const count = async () => {
  const res = (await db.execute(
    (await import('drizzle-orm')).sql`select coalesce(sum(count), 0)::int as n, count(*)::int as rows from rate_limit_counters`,
  )) as { rows: { n: number; rows: number }[] };
  return res.rows[0]!;
};

const rule = { max: 10, windowMs: 60_000 };
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % 60_000); // début de fenêtre

describe('PostgresRateLimitStore', () => {
  let store: PostgresRateLimitStore;
  beforeEach(async () => {
    store = new PostgresRateLimitStore({ db, fallback: null });
    await store.reset();
  });

  it('se comporte comme le magasin mémoire (même séquence de décisions)', async () => {
    const mem = new MemoryRateLimitStore();
    const times = [0, 1_000, 2_000, 30_000, 59_000, 60_500, 61_000, 90_000, 119_000, 125_000, 200_000];
    for (const dt of times)
      for (let i = 0; i < 4; i++) {
        const now = T0 + dt + i;
        expect(await store.hit('k', rule, now)).toEqual(await mem.hit('k', rule, now));
      }
  });

  it('atomique sous concurrence : jamais plus de max requêtes acceptées', async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => store.hit('burst', rule, T0 + 5_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    const denied = results.find((r) => !r.allowed);
    expect(denied).toMatchObject({ allowed: false });
    expect((denied as { retryAfterS: number }).retryAfterS).toBeGreaterThanOrEqual(1);
    expect((await count()).n).toBe(10); // les refus n'incrémentent pas
  });

  it('deux instances (deux magasins) partagent le même compteur', async () => {
    const a = new PostgresRateLimitStore({ db, fallback: null });
    const b = new PostgresRateLimitStore({ db, fallback: null });
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).hit('shared', rule, T0 + 1_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    // Une mémoire par instance aurait laissé passer 2 × 10 requêtes.
  });

  it('fenêtre glissante : la fenêtre précédente compte au prorata', async () => {
    for (let i = 0; i < 10; i++) expect((await store.hit('slide', rule, T0 + 50_000)).allowed).toBe(true);
    expect((await store.hit('slide', rule, T0 + 50_001)).allowed).toBe(false);
    // Milieu de la fenêtre suivante : 10 × 0,5 = 5 → 5 places.
    const mid = T0 + 90_000;
    const r = await Promise.all(Array.from({ length: 8 }, () => store.hit('slide', rule, mid)));
    expect(r.filter((x) => x.allowed)).toHaveLength(5);
  });

  it('purge les compteurs expirés, au plus une fois par intervalle', async () => {
    const manual = new PostgresRateLimitStore({ db, fallback: null, purgeEveryMs: Number.MAX_SAFE_INTEGER });
    await manual.hit('vieux', rule, T0);
    await manual.hit('recent', rule, T0 + 10 * 60_000);
    expect((await count()).rows).toBe(2);
    expect(await manual.purgeExpired(T0 + 10 * 60_000)).toBe(1);
    expect((await count()).rows).toBe(1);

    // Purge automatique en arrière-plan : au premier hit, puis pas avant purgeEveryMs.
    await store.reset();
    const auto = new PostgresRateLimitStore({ db, fallback: null, purgeEveryMs: 60_000 });
    await auto.hit('a', rule, T0); // purge (rien à purger)
    await auto.hit('b', rule, T0 + 3 * 60_000); // purge : « a » a expiré
    await new Promise((r) => setTimeout(r, 20));
    expect((await count()).rows).toBe(1);
    await auto.hit('c', rule, T0 + 6 * 60_000);
    await auto.hit('d', rule, T0 + 6 * 60_000 + 30_000); // < 60 s depuis la dernière purge : pas de purge
    await new Promise((r) => setTimeout(r, 20));
    expect((await count()).rows).toBe(2); // « b » purgé au hit « c », « c » et « d » restent
  });

  it('base injoignable : repli en mémoire (limite par instance)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = new PostgresRateLimitStore({ db: { execute: async () => Promise.reject(new Error('down')) } });
    const r = await Promise.all(Array.from({ length: 12 }, () => broken.hit('x', rule, T0)));
    expect(r.filter((x) => x.allowed)).toHaveLength(10);
    expect(err).toHaveBeenCalledTimes(1);
    const strict = new PostgresRateLimitStore({ db: { execute: async () => Promise.reject(new Error('down')) }, fallback: null });
    await expect(strict.hit('x', rule, T0)).rejects.toThrow('down');
    err.mockRestore();
  });
});

describe('createRateLimitStore', () => {
  it('mémoire par défaut, Postgres avec RATE_LIMIT_STORE=postgres', () => {
    expect(createRateLimitStore({})).toBeInstanceOf(MemoryRateLimitStore);
    expect(createRateLimitStore({ RATE_LIMIT_STORE: 'postgres' })).toBeInstanceOf(PostgresRateLimitStore);
    expect(() => createRateLimitStore({ RATE_LIMIT_STORE: 'redis' })).toThrow(/inconnu/);
  });
});
