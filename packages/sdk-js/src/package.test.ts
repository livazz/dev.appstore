/*
 * Paquet publiable : champs de package.json, build ESM + CJS + .d.ts, contenu de `npm pack`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SDK_VERSION } from './client.js';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('package.json publiable', () => {
  it('version, sideEffects, files, engines', () => {
    expect(pkg.version).toBe(SDK_VERSION);
    expect(pkg.private).toBeUndefined();
    expect(pkg.sideEffects).toBe(false);
    expect(pkg.type).toBe('module');
    expect(pkg.files).toEqual(['dist', 'README.md']);
    expect(pkg.main).toBe('./dist/cjs/index.js');
    expect(pkg.types).toBe('./dist/index.d.ts');
    expect(pkg.dependencies ?? {}).toEqual({}); // aucune dépendance d'exécution
  });

  it('exports : import et require pour « . » et « ./server », types d’abord', () => {
    for (const [sub, file] of [['.', 'index'], ['./server', 'server']] as const) {
      const e = pkg.exports[sub];
      expect(e.import).toEqual({ types: `./dist/${file}.d.ts`, default: `./dist/${file}.js` });
      expect(e.require).toEqual({ types: `./dist/cjs/${file}.d.ts`, default: `./dist/cjs/${file}.js` });
      expect(Object.keys(e.import)[0]).toBe('types');
    }
  });
});

describe('build (scripts/build.mjs)', () => {
  let out: string;
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), 'das-sdk-build-'));
    execFileSync(process.execPath, [join(root, 'scripts/build.mjs'), out], { stdio: 'pipe' });
  }, 60_000);
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('émet ESM, CJS et déclarations, sans les tests', () => {
    for (const f of ['index', 'client', 'sse', 'types', 'server']) {
      for (const ext of ['.js', '.d.ts']) {
        expect(existsSync(join(out, f + ext)), f + ext).toBe(true);
        expect(existsSync(join(out, 'cjs', f + ext)), `cjs/${f}${ext}`).toBe(true);
      }
    }
    expect(existsSync(join(out, 'client.test.js'))).toBe(false);
    expect(JSON.parse(readFileSync(join(out, 'cjs/package.json'), 'utf8'))).toEqual({ type: 'commonjs' });
  });

  it('les deux formats se chargent et exposent la même API', async () => {
    const req = createRequire(join(out, 'cjs', 'x.js'));
    const cjs = req('./index.js');
    const cjsServer = req('./server.js');
    const esm = await import(pathToFileURL(join(out, 'index.js')).href);
    const esmServer = await import(pathToFileURL(join(out, 'server.js')).href);
    expect(Object.keys(cjs).sort()).toEqual(Object.keys(esm).sort());
    expect(Object.keys(cjsServer).sort()).toEqual(Object.keys(esmServer).sort());
    expect(cjs.SDK_VERSION).toBe(SDK_VERSION);
    const header = cjsServer.signWebhookPayload('{}', 'whsec_x', 1_700_000_000);
    expect(esmServer.verifyWebhookSignature('{}', header, 'whsec_x', { now: 1_700_000_000 })).toBe(true);
  });

  it('le bundle navigateur (index) n’importe pas node:crypto', () => {
    for (const f of ['index', 'client', 'sse', 'types']) expect(readFileSync(join(out, `${f}.js`), 'utf8')).not.toMatch(/node:/);
  });
});
