import { describe, expect, it } from 'vitest';
import { assertSeedAllowed, describeTarget, isProductionEnv } from './guards';

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

  it('décrit la cible sans divulguer les identifiants', () => {
    const d = describeTarget({ DATABASE_URL: 'postgres://admin:s3cret@db.example.com:5432/app' });
    expect(d).toBe('Postgres db.example.com:5432/app');
    expect(d).not.toContain('s3cret');
    expect(d).not.toContain('admin');
    expect(describeTarget({})).toBe('PGlite (.data/pglite)');
    expect(describeTarget({ DATABASE_URL: '::' })).toBe('Postgres (DATABASE_URL illisible)');
  });
});
