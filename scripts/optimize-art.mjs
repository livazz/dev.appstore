// Convertit les illustrations PNG (source haute définition) en WebP légers pour apps/web/public/art.
// Usage : node scripts/optimize-art.mjs <dossier source contenant items/, icons/, games/, site/>
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
const SRC = path.resolve(process.argv[2] ?? '');
const OUT = path.resolve('apps/web/public/art');
// Largeur max selon le dossier (×2 pour les écrans Retina, au-delà de la taille affichée).
const WIDTH = { items: 512, icons: 128, site: 800, games: 1600 };
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.png')) yield p;
  }
}
let total = 0, n = 0;
for await (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  const top = rel.split(path.sep)[0];
  let width = WIDTH[top] ?? 1024;
  if (rel.endsWith('icon.png')) width = 512;
  if (/site\/(hero|studios-hero)\.png$/.test(rel)) width = 1200;
  const out = path.join(OUT, rel.replace(/\.png$/, '.webp'));
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(file).resize({ width, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toFile(out);
  total += (await stat(out)).size; n++;
}
console.log(`${n} images → ${(total / 1024 / 1024).toFixed(1)} Mo`);
