import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema/index';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = join(pkgDir, 'drizzle');

function lastSnapshot() {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number }[] };
  const idx = String(journal.entries.at(-1)!.idx).padStart(4, '0');
  return JSON.parse(readFileSync(join(migrationsFolder, `meta/${idx}_snapshot.json`), 'utf8'));
}

describe('migrations SQL (packages/db/drizzle)', () => {
  it('la dernière migration correspond au schéma TypeScript (sinon : npm run db:generate -w @devappstore/db)', async () => {
    const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api');
    const statements = await generateMigration(lastSnapshot(), generateDrizzleJson(schema));
    expect(statements).toEqual([]);
  });

  it('une base neuve se migre, et les index uniques gardent l’idempotence de ON CONFLICT (colonnes)', async () => {
    const pg = new PGlite();
    const tdb = drizzle(pg, { schema });
    await migrate(tdb, { migrationsFolder });
    const row = { kind: 'player_welcome' as const, refId: 'u1' };
    await tdb.insert(schema.notificationsSent).values({ id: 'n1', ...row }).onConflictDoNothing();
    const again = await tdb.insert(schema.notificationsSent).values({ id: 'n2', ...row }).onConflictDoNothing().returning();
    expect(again).toEqual([]);
    await expect(tdb.insert(schema.notificationsSent).values({ id: 'n3', ...row })).rejects.toThrow();
    await pg.close();
  }, 60000);

  /*
   * Régression : `drizzle-kit push` relisait les contraintes UNIQUE multi-colonnes dans le désordre et demandait une
   * confirmation (impossible hors terminal) dès que loyalty_entries contenait des lignes. Vrai CLI, sans TTY.
   */
  it('drizzle-kit push sur une base migrée et peuplée ne détecte aucun changement, sans terminal', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'devappstore-push-'));
    try {
      const pg = new PGlite(join(dataDir, 'pglite'));
      const tdb = drizzle(pg, { schema });
      await migrate(tdb, { migrationsFolder });
      await tdb.insert(schema.user).values({ id: 'u1', name: 'U', email: 'u@test' });
      await tdb.insert(schema.loyaltyEntries).values({ id: 'l1', userId: 'u1', delta: 10, reason: 'adjustment', expiresAt: new Date() });
      await tdb.insert(schema.notificationsSent).values({ id: 'n1', kind: 'player_welcome', refId: 'u1' });
      await pg.close();

      const env: NodeJS.ProcessEnv = { ...process.env, DEVAPPSTORE_DATA_DIR: dataDir };
      delete env.DATABASE_URL;
      const res = spawnSync(process.execPath, [join(dirname(createRequire(import.meta.url).resolve('drizzle-kit/api')), 'bin.cjs'), 'push'], {
        cwd: pkgDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 90_000,
      });
      const out = `${res.stdout}\n${res.stderr}`;
      expect(out).not.toMatch(/TTY|Error/);
      expect(res.status).toBe(0);
      expect(out).toContain('No changes detected');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120000);
});
