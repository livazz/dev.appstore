import { describe, expect, it } from 'vitest';
import { demoKeys, parseDemoKeys, parseDemoPassword } from './demo-data';

describe('données de démo lues dans packages/db/src/seed.ts', () => {
  it('le seed réel expose les clés des deux jeux', () => {
    const k = demoKeys();
    expect(k.crystal.apiKey).toMatch(/^wk_test_/);
    expect(k.farm.apiKey).toMatch(/^wk_test_/);
    expect(k.crystal.webhookSecret).toMatch(/^whsec_/);
  });

  it('parse un bloc DEMO_KEYS', () => {
    const src = `export const DEMO_KEYS = {\n  crystal: { apiKey: 'a1', webhookSecret: 'w1' },\n  farm: { apiKey: "a2", webhookSecret: "w2" },\n};`;
    expect(parseDemoKeys(src)).toEqual({ crystal: { apiKey: 'a1', webhookSecret: 'w1' }, farm: { apiKey: 'a2', webhookSecret: 'w2' } });
  });

  it('échoue clairement si DEMO_KEYS disparaît', () => {
    expect(() => parseDemoKeys('export const AUTRE = 1;')).toThrow(/DEMO_KEYS introuvable/);
  });

  it('mot de passe de démo : DEMO_PASSWORD du seed, sinon demo1234', () => {
    expect(parseDemoPassword(`export const DEMO_PASSWORD = 'secret99';`)).toBe('secret99');
    expect(parseDemoPassword('')).toBe('demo1234');
  });
});
