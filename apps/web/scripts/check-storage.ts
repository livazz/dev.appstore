/*
 * Vérification manuelle du stockage S3 / R2 (voir docs/deploy-storage.md).
 *
 *   cd apps/web && npm run check:storage            # variables S3_* lues dans l'environnement / .env
 *
 * Étapes : PUT d'un petit PNG → GET signé (contenu identique) → GET anonyme de l'URL publique
 * (accessibilité CDN, Content-Type, Cache-Control) → DELETE → GET signé (404 attendu).
 * Code de sortie non nul au premier échec. Aucune donnée ne reste dans le bucket.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { IMMUTABLE_CACHE_CONTROL, s3StorageFromEnv } from '../src/server/storage-s3';

function loadDotEnv() {
  for (const p of ['.env.local', '.env', '../../.env.local', '../../.env']) {
    const f = resolve(process.cwd(), p);
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

// PNG 1x1 transparent.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let failed = false;
function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}

async function main() {
  loadDotEnv();
  const storage = s3StorageFromEnv();
  const key = `_healthcheck/${Date.now()}-${randomBytes(4).toString('hex')}.png`;
  console.log(`Bucket ${process.env.S3_BUCKET} via ${process.env.S3_ENDPOINT} (région ${process.env.S3_REGION || 'auto'})`);
  console.log(`Clé de test : ${key}\n`);

  const url = await storage.put(key, PNG, 'image/png');
  check(true, 'PUT signé', url);

  const got = await storage.get(key);
  check(!!got && got.buffer.equals(PNG), 'GET signé : contenu identique');
  check(got?.contentType === 'image/png', 'GET signé : Content-Type', got?.contentType);

  try {
    const res = await fetch(url, { cache: 'no-store' });
    check(res.ok, 'URL publique accessible sans authentification', `HTTP ${res.status}`);
    if (res.ok) {
      check(Buffer.from(await res.arrayBuffer()).equals(PNG), 'URL publique : contenu identique');
      check(res.headers.get('content-type') === 'image/png', 'URL publique : Content-Type', res.headers.get('content-type') ?? '');
      const cc = res.headers.get('cache-control') ?? '';
      check(cc.includes('immutable'), 'URL publique : Cache-Control immuable', cc || `(absent, attendu « ${IMMUTABLE_CACHE_CONTROL} »)`);
    }
  } catch (e) {
    check(false, 'URL publique accessible', (e as Error).message);
  }

  await storage.delete(key);
  check(true, 'DELETE signé');
  check((await storage.get(key)) === null, 'GET après suppression : absent (404)');

  console.log(failed ? '\nÉchec : voir docs/deploy-storage.md § Dépannage.' : '\nStockage S3 opérationnel.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`✘ ${(e as Error).message}`);
  console.error('Voir docs/deploy-storage.md § Dépannage.');
  process.exit(1);
});
