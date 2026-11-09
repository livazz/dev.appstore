/*
 * Prépare la base PGlite isolée des tests (e2e/.data) : remise à zéro, `db:push`, `db:seed`.
 *
 * Ordre Playwright : les webServer démarrent AVANT le globalSetup. Ce n'est pas un problème ici : Next.js (dev) ne
 * compile une route — et n'ouvre donc la base — qu'à la première requête, et la sonde de disponibilité du
 * webServer vise /favicon.ico qui ne touche pas la base. Aucun test ne s'exécute avant la fin de ce setup.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { DATA_DIR, REPO_ROOT, REUSE_SERVER, webServerEnv } from './support/env';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export default async function globalSetup() {
  if (REUSE_SERVER) {
    console.log('[e2e] E2E_REUSE_SERVER=1 : base laissée telle quelle (le serveur existant la tient ouverte).');
    return;
  }
  if (process.env.E2E_KEEP_DATA !== '1') rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });

  const env = { ...process.env, ...webServerEnv() };
  for (const script of ['db:push', 'db:seed']) {
    console.log(`[e2e] npm run ${script} (WOLLEEN_DATA_DIR=${DATA_DIR})`);
    execFileSync(npm, ['run', script], { cwd: REPO_ROOT, env, stdio: 'inherit' });
  }
}
