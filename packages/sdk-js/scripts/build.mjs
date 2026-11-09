/*
 * Construit le paquet publiable @devappstore/sdk dans dist/ (aucune dépendance en plus de TypeScript) :
 *   dist/*.js + *.d.ts       ESM (import)
 *   dist/cjs/*.js + *.d.ts   CommonJS (require), avec dist/cjs/package.json { "type": "commonjs" }
 * Usage : node scripts/build.mjs [dossier de sortie, défaut dist]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, process.argv[2] ?? 'dist');
const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin', 'tsc');

rmSync(outDir, { recursive: true, force: true });
const run = (project, out) => execFileSync(process.execPath, [tsc, '-p', join(root, project), '--outDir', out], { cwd: root, stdio: 'inherit' });
run('tsconfig.build.json', outDir);
run('tsconfig.build.cjs.json', join(outDir, 'cjs'));
mkdirSync(join(outDir, 'cjs'), { recursive: true });
writeFileSync(join(outDir, 'cjs', 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');
