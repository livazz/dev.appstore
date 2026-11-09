import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Sert @devappstore/sdk au navigateur en modules ES : ce sont les fichiers du paquet construit (`dist/*.js`, ESM,
 * imports déjà en `./x.js`), exactement ceux qui seront publiés sur npm. Pas de bundler nécessaire.
 * `server.js` (node:crypto) est exclu. Le SDK est construit avant `dev`, `start`, `test` et `typecheck`
 * (scripts `pre*` de ce paquet : `npm run build -w @devappstore/sdk`).
 */
const sdkDist = join(dirname(createRequire(import.meta.url).resolve('@devappstore/sdk/package.json')), 'dist');
const cache = new Map<string, string>();

const BROWSER_FILES = new Set(['index', 'client', 'sse', 'types']);

export async function sdkModule(file: string): Promise<string | null> {
  const name = file.replace(/\.js$/, '');
  if (!BROWSER_FILES.has(name)) return null;
  const hit = cache.get(name);
  if (hit) return hit;
  const out = await readFile(join(sdkDist, `${name}.js`), 'utf8');
  cache.set(name, out);
  return out;
}
