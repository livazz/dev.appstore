import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';

/**
 * Sert @devappstore/sdk au navigateur en modules ES : chaque fichier source TypeScript est transpilé à la volée
 * (les imports du SDK sont déjà en `./x.js`). Pas de bundler nécessaire. `server.ts` (node:crypto) est exclu.
 */
const sdkDir = dirname(createRequire(import.meta.url).resolve('@devappstore/sdk'));
const cache = new Map<string, string>();

const BROWSER_FILES = new Set(['index', 'client', 'sse', 'types']);

export async function sdkModule(file: string): Promise<string | null> {
  const name = file.replace(/\.js$/, '');
  if (!BROWSER_FILES.has(name)) return null;
  const hit = cache.get(name);
  if (hit) return hit;
  const src = await readFile(join(sdkDir, `${name}.ts`), 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, verbatimModuleSyntax: false },
    fileName: `${name}.ts`,
  }).outputText;
  cache.set(name, out);
  return out;
}
