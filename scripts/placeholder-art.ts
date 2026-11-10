/*
 * Visuels PROVISOIRES des faux jeux (packages/db/src/catalog-data.ts) : icône (dégradé + objet de la bibliothèque) et
 * bannière (nom du jeu en logo typographique), en attendant les illustrations générées. N'écrase jamais un fichier
 * existant (sauf --force) : une vraie illustration déposée via scripts/optimize-art.mjs reste en place.
 * Usage : npx tsx scripts/placeholder-art.ts [--force]
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CATALOG_GAMES, type CatalogGame } from '../packages/db/src/catalog-data';

const sharp = createRequire(import.meta.url)('sharp') as typeof import('sharp');
const OUT = path.resolve('apps/web/public/art/games');
const force = process.argv.includes('--force');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/’/g, '&#8217;');

const LOGO: Record<CatalogGame['skin'], { font: string; fill: string; stroke: string; weight: number; upper: boolean }> = {
  arcade: { font: "'Arial Black', 'Helvetica Neue', sans-serif", fill: '#ffffff', stroke: '#111827', weight: 900, upper: true },
  premium: { font: "'Didot', 'Georgia', serif", fill: '#f3d58a', stroke: '#1a1206', weight: 700, upper: true },
  casual: { font: "'Arial Rounded MT Bold', 'Avenir Next', sans-serif", fill: '#ffffff', stroke: '#6b3d1f', weight: 800, upper: false },
  clean: { font: "'Helvetica Neue', 'Avenir Next', sans-serif", fill: '#111111', stroke: 'none', weight: 700, upper: false },
  classic: { font: "'Courier New', monospace", fill: '#ffd43b', stroke: '#1b1b1b', weight: 700, upper: true },
};

async function icon(g: CatalogGame, file: string) {
  const [a, b] = g.colors.cards[0]!;
  const S = 512;
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs><radialGradient id="g" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/><circle cx="${S / 2}" cy="${S / 2}" r="${S * 0.36}" fill="#ffffff" fill-opacity="0.18"/></svg>`,
  );
  const art = await sharp(path.resolve(`apps/web/public/art/items/${g.iconArt}.webp`)).resize(Math.round(S * 0.74)).png().toBuffer();
  await sharp(bg).composite([{ input: art, gravity: 'center' }]).webp({ quality: 82 }).toFile(file);
}

async function banner(g: CatalogGame, file: string) {
  const W = 1600, H = 667;
  const st = LOGO[g.skin];
  const name = st.upper ? g.name.toUpperCase() : g.name;
  const size = Math.min(230, Math.round((W * 0.82) / (name.length * 0.72)));
  const strokeW = st.stroke === 'none' ? 0 : Math.round(size * 0.12);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="50%" y="${H / 2 + size * 0.36 + 6}" text-anchor="middle" font-family="${st.font}" font-weight="${st.weight}" font-size="${size}" fill="#000" fill-opacity="0.28">${esc(name)}</text>
    <text x="50%" y="${H / 2 + size * 0.36}" text-anchor="middle" font-family="${st.font}" font-weight="${st.weight}" font-size="${size}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${strokeW}" paint-order="stroke" stroke-linejoin="round">${esc(name)}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 85, alphaQuality: 90 }).toFile(file);
}

async function main() {
let n = 0;
for (const g of CATALOG_GAMES) {
  const dir = path.join(OUT, g.slug);
  mkdirSync(dir, { recursive: true });
  const ic = path.join(dir, 'icon.webp');
  const bn = path.join(dir, 'banner.webp');
  if (force || !existsSync(ic)) (await icon(g, ic), n++);
  if (force || !existsSync(bn)) (await banner(g, bn), n++);
}
  console.log(`${n} visuels provisoires écrits dans ${path.relative(process.cwd(), OUT)}`);
}

void main();
