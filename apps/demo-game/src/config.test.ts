import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_KEYS, loadConfig } from './config';

describe('config', () => {
  it('reprend les clés de démo du seed (packages/db/src/seed.ts)', () => {
    const seed = readFileSync(new URL('../../../packages/db/src/seed.ts', import.meta.url), 'utf8');
    for (const k of Object.values(DEMO_KEYS)) {
      expect(seed).toContain(`apiKey: '${k.apiKey}'`);
      expect(seed).toContain(`webhookSecret: '${k.webhookSecret}'`);
    }
  });

  it('lit le port et WOLLEEN_URL depuis l’environnement', () => {
    const c = loadConfig({ PORT: '4200', WOLLEEN_URL: 'https://wolleen.example/' });
    expect(c.port).toBe(4200);
    expect(c.wolleenUrl).toBe('https://wolleen.example');
    expect(loadConfig({}).port).toBe(4100);
    expect(loadConfig({}).wolleenUrl).toBe('http://localhost:3000');
  });
});
