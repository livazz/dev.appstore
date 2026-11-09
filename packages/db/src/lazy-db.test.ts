import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';

/*
 * Régression « RuntimeError: Aborted() » pendant `next build` : importer @devappstore/db ne doit PAS ouvrir PGlite
 * (les workers de collecte des pages importent tous les modules de route en parallèle).
 */
describe('ouverture paresseuse de db', () => {
  const g = globalThis as { __devAppStoreDb?: unknown };
  const saved = { dir: process.env.DEVAPPSTORE_DATA_DIR, url: process.env.DATABASE_URL, db: g.__devAppStoreDb };
  let dataDir = '';

  afterEach(async () => {
    const opened = g.__devAppStoreDb as { $client?: { close?: () => Promise<void> } } | undefined;
    if (opened && opened !== saved.db) await opened.$client?.close?.();
    g.__devAppStoreDb = saved.db;
    if (saved.dir === undefined) delete process.env.DEVAPPSTORE_DATA_DIR;
    else process.env.DEVAPPSTORE_DATA_DIR = saved.dir;
    if (saved.url !== undefined) process.env.DATABASE_URL = saved.url;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("n'ouvre la base qu'au premier usage, une seule fois par processus", async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'devappstore-lazy-'));
    process.env.DEVAPPSTORE_DATA_DIR = dataDir;
    delete process.env.DATABASE_URL;
    delete g.__devAppStoreDb;
    vi.resetModules();

    const mod = await import('./index');
    expect(existsSync(join(dataDir, 'pglite'))).toBe(false);
    expect(g.__devAppStoreDb).toBeUndefined();

    const res = await mod.db.execute(sql`select 1 as one`);
    expect(res.rows).toEqual([{ one: 1 }]);
    expect(existsSync(join(dataDir, 'pglite'))).toBe(true);
    expect(mod.getDb()).toBe(g.__devAppStoreDb);
  }, 30000);

  it('réutilise une base déjà posée sur globalThis (tests de apps/web)', async () => {
    const fake = { marker: 42, select: function () { return this; } };
    g.__devAppStoreDb = fake;
    vi.resetModules();
    const mod = await import('./index');
    expect((mod.db as unknown as { marker: number }).marker).toBe(42);
    expect((mod.db as unknown as { select: () => unknown }).select()).toBe(fake);
  });
});
