import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* Revue de sécurité 2026-11 : configuration du dépôt (CI, docker-compose de développement). */

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (p: string) => readFileSync(`${root}${p}`, 'utf8');

describe('C-10 : workflow CI', () => {
  const ci = read('.github/workflows/ci.yml');

  it('GITHUB_TOKEN en lecture seule, jamais pull_request_target', () => {
    expect(ci).toMatch(/^permissions:\n\s+contents: read$/m);
    expect(ci).not.toContain('pull_request_target');
    expect(ci).not.toMatch(/:\s*write\b/);
  });

  it('toutes les actions sont épinglées par SHA de commit (40 caractères hexadécimaux)', () => {
    const uses = [...ci.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });
});

describe('C-11 : docker-compose de développement', () => {
  it('chaque port publié est lié à 127.0.0.1', () => {
    const compose = read('docker-compose.yml');
    const ports = [...compose.matchAll(/^\s+-\s+"([^"]*:\d+)"\s*$/gm)].map((m) => m[1]!).filter((p) => /^\S*\d+:\d+$/.test(p));
    expect(ports.length).toBeGreaterThan(0);
    for (const p of ports) expect(p, p).toMatch(/^127\.0\.0\.1:\d+:\d+$/);
  });
});
