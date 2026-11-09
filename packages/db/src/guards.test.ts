import { describe, expect, it } from 'vitest';
import { assertSeedAllowed, describeTarget, isLocalDatabaseUrl, isProductionEnv } from './guards';

describe('garde-fous des scripts de base', () => {
  it('détecte la production (Node ou Vercel)', () => {
    expect(isProductionEnv({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionEnv({ VERCEL_ENV: 'production' })).toBe(true);
    expect(isProductionEnv({ NODE_ENV: 'development', VERCEL_ENV: 'preview' })).toBe(false);
    expect(isProductionEnv({})).toBe(false);
  });

  it('refuse le seed en production, sans échappatoire', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/Seed refusé/);
    expect(() => assertSeedAllowed({ VERCEL_ENV: 'production', DEVAPPSTORE_ALLOW_SEED: '1' })).toThrow(/Seed refusé/);
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('A-06 : hors production, refuse le seed sur une base distante (sauf DEVAPPSTORE_ALLOW_SEED=1)', () => {
    const neon = 'postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/app?sslmode=require';
    expect(() => assertSeedAllowed({ DATABASE_URL: neon })).toThrow(/n'est pas une base locale/);
    expect(() => assertSeedAllowed({ DATABASE_URL: neon })).not.toThrow(/p@/);
    expect(() => assertSeedAllowed({ DATABASE_URL: 'postgres://u:p@10.0.0.5:5432/app' })).toThrow(/Seed refusé/);
    expect(() => assertSeedAllowed({ DATABASE_URL: 'pas une url' })).toThrow(/Seed refusé/);
    expect(() => assertSeedAllowed({ DATABASE_URL: neon, DEVAPPSTORE_ALLOW_SEED: '1' })).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', DATABASE_URL: 'postgres://localhost/app', DEVAPPSTORE_ALLOW_SEED: '1' })).toThrow();
    for (const url of ['postgres://u:p@localhost:5432/app', 'postgres://127.0.0.1/app', 'postgres://[::1]/app', 'postgres://db:5432/app', 'postgres://pg.localhost/app']) {
      expect(isLocalDatabaseUrl(url)).toBe(true);
      expect(() => assertSeedAllowed({ DATABASE_URL: url })).not.toThrow();
    }
    expect(isLocalDatabaseUrl('postgres://localhost.evil.com/app')).toBe(false);
    expect(() => assertSeedAllowed({})).not.toThrow(); // PGlite
  });

  it('décrit la cible sans divulguer les identifiants', () => {
    const d = describeTarget({ DATABASE_URL: 'postgres://admin:s3cret@db.example.com:5432/app' });
    expect(d).toBe('Postgres db.example.com:5432/app');
    expect(d).not.toContain('s3cret');
    expect(d).not.toContain('admin');
    expect(describeTarget({})).toBe('PGlite (.data/pglite)');
    expect(describeTarget({ DATABASE_URL: '::' })).toBe('Postgres (DATABASE_URL illisible)');
  });
});
