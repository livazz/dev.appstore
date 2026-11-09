import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_KEYS, loadConfig } from './config';

describe('config', () => {
  it('reprend les clés de démo du seed (packages/db/src/seed.ts)', () => {
    const seed = readFileSync(new URL('../../../packages/db/src/seed.ts', import.meta.url), 'utf8');
    for (const k of Object.values(DEMO_KEYS)) {
      expect(seed).toContain(`apiKey: '${k.apiKey}'`);
      expect(seed).toContain(`publishableKey: '${k.publishableKey}'`);
      expect(seed).toContain(`webhookSecret: '${k.webhookSecret}'`);
    }
  });

  it('lit le port et DEVAPPSTORE_URL depuis l’environnement', () => {
    const c = loadConfig({ PORT: '4200', DEVAPPSTORE_URL: 'https://devappstore.example/' });
    expect(c.port).toBe(4200);
    expect(c.devAppStoreUrl).toBe('https://devappstore.example');
    expect(loadConfig({}).port).toBe(4100);
    expect(loadConfig({}).devAppStoreUrl).toBe('http://localhost:3000');
  });
});
