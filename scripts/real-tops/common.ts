/*
 * Vrais tops en local — outils communs (récupération, cache, images, correspondances).
 *
 * STRICTEMENT LOCAL : les données et images des vrais jeux appartiennent à leurs éditeurs. Elles vont dans des dossiers
 * ignorés par git (`.data/real-tops/`, `apps/web/public/art/local/`) et ne doivent jamais être commitées, poussées ni
 * publiées sur l'aperçu public. Aucune clé ni secret : uniquement des API publiques, avec un User-Agent générique,
 * un délai entre requêtes et un cache local.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeedAllowed } from '../../packages/db/src/guards';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT, '.data/real-tops');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
/** Bannières générées à la main (PNG/WebP/JPG nommés `<slug>.png`), converties en `banner.webp` par fetch et seed. */
export const BANNERS_IN_DIR = path.join(DATA_DIR, 'bannieres');
export const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');
export const MISSING_FILE = path.join(DATA_DIR, 'manquants.md');
export const ART_DIR = path.join(ROOT, 'apps/web/public/art/local');
export const artUrl = (slug: string, name: string) => `/art/local/${slug}/${name}.webp`;
export const artFile = (slug: string, name: string) => path.join(ART_DIR, slug, `${name}.webp`);

export const USER_AGENT = 'DevAppStore-dev';

/** Refus absolu en production, et vérification que les dossiers de sortie sont bien ignorés par git. */
export function assertLocalOnly() {
  assertSeedAllowed();
  const gi = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  if (!/^\.data\/?$/m.test(gi) && !/^\.data\/real-tops\/?$/m.test(gi)) throw new Error('.data/real-tops/ doit être ignoré par git (.gitignore).');
  if (!/^apps\/web\/public\/art\/local\/?$/m.test(gi)) throw new Error('apps/web/public/art/local/ doit être ignoré par git (.gitignore).');
}

// ——— Types du catalogue local (.data/real-tops/catalog.json) ———

export type RealItem = {
  productId: string;
  title: string;
  priceCents: number;
  type: 'consumable' | 'non_consumable' | 'auto_renewable' | 'non_renewing';
  period?: 'week' | 'month' | 'year';
  quantity: number;
  /** Illustration : chemin /art/local/… (visuel réel) ou /art/items/… (bibliothèque). */
  imageUrl: string;
  description: string;
  source: 'appstore' | 'steam-dlc' | 'generique';
};

export type RealGame = {
  slug: string;
  platform: 'mobile' | 'pc';
  rank: number;
  sourceId: string;
  storeUrl: string;
  name: string;
  subtitle: string;
  publisher: string;
  category: string;
  description: string;
  storeDescription: string;
  /** Couleur dominante de l'icône (dégradé de la boutique). */
  color: string;
  icon: string | null;
  banner: string | null;
  screenshots: string[];
  items: RealItem[];
  /** Visuels introuvables en ligne (à générer, voir manquants.md). */
  missing: ('icon' | 'banner' | 'screenshots')[];
};

export type RealCatalog = { fetchedAt: string; sources: string[]; games: RealGame[] };

// ——— Réseau poli + cache ———

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;

async function politeFetch(url: string, delayMs: number): Promise<Response> {
  const wait = lastRequest + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; ; attempt++) {
    lastRequest = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9' }, redirect: 'follow' });
    // Limitation de débit ou panne passagère : on patiente (de plus en plus) puis on réessaie, 4 fois au plus.
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(5000 * (attempt + 1) ** 2);
      continue;
    }
    return res;
  }
}

const cachePath = (key: string, ext: string) => path.join(CACHE_DIR, `${createHash('sha1').update(key).digest('hex')}.${ext}`);

/** Texte d'une URL, mis en cache `maxAgeH` heures (null si 404 ou erreur). */
export async function cachedText(url: string, opts: { maxAgeH: number; delayMs?: number; refresh?: boolean }): Promise<string | null> {
  const file = cachePath(url, 'txt');
  if (!opts.refresh && existsSync(file) && Date.now() - statSync(file).mtimeMs < opts.maxAgeH * 3600_000) return readFileSync(file, 'utf8');
  try {
    const res = await politeFetch(url, opts.delayMs ?? 1000);
    if (!res.ok) return null;
    const text = await res.text();
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, text);
    return text;
  } catch (e) {
    console.warn(`  ! ${url} : ${(e as Error).message}`);
    return null;
  }
}

export async function cachedJson<T>(url: string, opts: { maxAgeH: number; delayMs?: number; refresh?: boolean }): Promise<T | null> {
  const text = await cachedText(url, opts);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ——— Images (WebP via sharp, comme scripts/optimize-art.mjs) ———

type Sharp = typeof import('sharp').default;
const sharp: Sharp = createRequire(path.join(ROOT, 'apps/web/package.json'))('sharp');

export type ImageKind = 'icon' | 'banner' | 'shot' | 'item';

/** Côté des icônes : affichées à 120 px au plus (240 px sur écran Retina). */
const ICON_SIZE = 256;

/** Réduit sur place une icône déjà téléchargée en plus grand (anciens téléchargements en 512 px). */
export async function ensureIconSize(slug: string): Promise<void> {
  const file = artFile(slug, 'icon');
  if (!existsSync(file)) return;
  const { width = 0 } = await sharp(file).metadata();
  if (width <= ICON_SIZE) return;
  const buf = await sharp(readFileSync(file)).resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' }).webp({ quality: 80, effort: 5 }).toBuffer();
  writeFileSync(file, buf);
}

/**
 * Variante allégée d'une image locale (`/art/local/<slug>/<nom>.webp` → `<variante>.webp`, largeur maximale donnée),
 * pour les cartes de l'accueil. Régénérée seulement si la source est plus récente. Renvoie l'URL de la variante.
 */
export async function lightVariant(url: string, slug: string, name: string, width: number): Promise<string> {
  const src = path.join(ROOT, 'apps/web/public', url);
  const out = artFile(slug, name);
  if (!existsSync(src)) return url;
  if (!existsSync(out) || statSync(out).mtimeMs < statSync(src).mtimeMs) {
    await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: 76, alphaQuality: 85, effort: 5 }).toFile(out);
  }
  return artUrl(slug, name);
}

/** Dimensions d'une image locale (0 × 0 si absente). */
export async function imageSize(url: string): Promise<{ width: number; height: number }> {
  const file = path.join(ROOT, 'apps/web/public', url);
  if (!existsSync(file)) return { width: 0, height: 0 };
  const { width = 0, height = 0 } = await sharp(file).metadata();
  return { width, height };
}

async function toWebp(input: Buffer, out: string, kind: ImageKind) {
  mkdirSync(path.dirname(out), { recursive: true });
  let img = sharp(input, { failOn: 'none' });
  if (kind === 'icon') img = img.resize(ICON_SIZE, ICON_SIZE, { fit: 'cover', position: 'attention' });
  else if (kind === 'banner') img = img.resize({ width: 1600, withoutEnlargement: true });
  else if (kind === 'shot') img = img.resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true });
  else img = img.resize({ width: 512, withoutEnlargement: true });
  await img.webp({ quality: 82, alphaQuality: 90, effort: 4 }).toFile(out);
}

/**
 * Télécharge une image et l'écrit en WebP dans apps/web/public/art/local/<slug>/<nom>.webp.
 * Déjà présente → rien n'est re-téléchargé. Renvoie l'URL publique locale, ou null si introuvable.
 */
export async function downloadImage(url: string | null | undefined, slug: string, name: string, kind: ImageKind): Promise<string | null> {
  if (!url) return null;
  const out = artFile(slug, name);
  if (existsSync(out)) return artUrl(slug, name);
  try {
    const res = await politeFetch(url, 120);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return null;
    await toWebp(Buffer.from(await res.arrayBuffer()), out, kind);
    return artUrl(slug, name);
  } catch (e) {
    console.warn(`  ! image ${url} : ${(e as Error).message}`);
    return null;
  }
}

/** Bannière fournie à la main dans .data/real-tops/bannieres/<slug>.(png|webp|jpg) → banner.webp. */
export async function importManualBanner(slug: string): Promise<string | null> {
  for (const ext of ['png', 'webp', 'jpg', 'jpeg']) {
    const src = path.join(BANNERS_IN_DIR, `${slug}.${ext}`);
    if (!existsSync(src)) continue;
    const out = artFile(slug, 'banner');
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(src).mtimeMs) await toWebp(readFileSync(src), out, 'banner');
    return artUrl(slug, 'banner');
  }
  return null;
}

/** Couleur dominante (hex) d'une image locale, pour le dégradé de la boutique. */
export async function dominantColor(url: string | null): Promise<string> {
  if (!url) return '#4a5bd8';
  try {
    const { dominant } = await sharp(path.join(ROOT, 'apps/web/public', url)).stats();
    return `#${[dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return '#4a5bd8';
  }
}

// ——— Texte ———

export function slugify(s: string, max = 40): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '') || 'jeu';
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML (descriptions Steam) → texte, paragraphes séparés par une ligne vide. */
export function htmlToText(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h[1-6]|li|ul|ol|div)>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ''),
  );
  return tidyParagraphs(text);
}

export function tidyParagraphs(text: string, maxLen = 4000): string {
  const out = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (out.length <= maxLen) return out;
  const cut = out.lastIndexOf('\n\n', maxLen);
  return out.slice(0, cut > maxLen / 2 ? cut : maxLen).trim();
}

/** Résumé court (description de la fiche) : premières phrases, 180 caractères au plus. */
export function shortSummary(text: string, max = 180): string {
  const lines = text.split(/\n+/).map((l) => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
  let out = '';
  for (const l of lines) {
    out = out ? `${out}${/[.!?…:]$/.test(out) ? '' : '.'} ${l}` : l;
    if (out.length >= 80) break;
  }
  if (out.length <= max) return out;
  const cut = out.slice(0, max);
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return dot > 60 ? cut.slice(0, dot + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** « Gossip Harbor : jeu de fusion » → nom « Gossip Harbor », sous-titre « Jeu de fusion ». */
export function splitTitle(full: string): { name: string; subtitle: string } {
  const m = full.match(/^(.{3,}?)\s*(?::|\s[-–—]\s|\|)\s*(.+)$/);
  if (!m) return { name: full.trim(), subtitle: '' };
  const sub = m[2]!.trim();
  return { name: m[1]!.trim(), subtitle: sub.charAt(0).toUpperCase() + sub.slice(1) };
}

/** « 2,49 € » / « 1 299,99 € » → centimes. */
export function parseEuroCents(s: string): number | null {
  const m = s.replace(/[\s  ]/g, '').match(/(\d+(?:[.,]\d{1,2})?)€/);
  if (!m) return null;
  const v = Math.round(parseFloat(m[1]!.replace(',', '.')) * 100);
  return v > 0 ? v : null;
}

// ——— Correspondances catégorie / thème / illustrations ———

/** Genre du store (App Store FR ou Steam FR) → catégorie GAME_CATEGORIES la plus proche. */
export function mapCategory(genres: string[], text = ''): string {
  if (/battle royale/i.test(text)) return 'Battle royale';
  const g = genres.map((x) => x.toLowerCase());
  const has = (...keys: string[]) => g.some((x) => keys.some((k) => x.includes(k)));
  if (has('jeu de rôle', 'jeux de rôle', 'rpg')) return 'RPG';
  if (has('stratégie')) return 'Stratégie';
  if (has('cartes', 'casino', 'plateau')) return 'Cartes';
  if (has('casse-tête', 'mots', 'trivia', 'puzzle')) return 'Puzzle';
  if (has('course')) return 'Course';
  if (has('sport')) return 'Sport';
  if (has('simulation')) return 'Simulation';
  if (has('action', 'arcade', 'massivement multijoueur')) return 'Action';
  if (has('aventure')) return 'Aventure';
  return 'Casual';
}

type Skin = 'arcade' | 'premium' | 'casual' | 'clean';

/** Thème de boutique selon le genre (mêmes familles que STORE_SKINS). */
export function skinFor(category: string): Skin {
  if (['Action', 'Battle royale', 'Sport', 'Course'].includes(category)) return 'arcade';
  if (['RPG', 'Stratégie', 'Cartes', 'Aventure'].includes(category)) return 'premium';
  if (['Puzzle', 'Casual', 'Simulation'].includes(category)) return 'casual';
  return 'clean';
}

const tier = (cents: number) => (cents < 300 ? 0 : cents < 1000 ? 1 : cents < 3000 ? 2 : 3);
const lib = (name: string) => `/art/items/${name}.webp`;

/** Illustration de la bibliothèque la plus proche du nom d'un achat intégré (palier selon le prix). */
export function libraryArtFor(title: string, cents: number): string {
  const t = title.toLowerCase();
  const n = tier(cents);
  const is = (re: RegExp) => re.test(t);
  if (is(/sans pub|pub(licit[ée]s?)?\b|no ads|remove ads/)) return lib('remove-ads');
  if (is(/coffre|chest|caisse|crate|bo[iî]te/)) return lib(['chest-common', 'chest-rare', 'chest-epic', 'chest-legendary'][n]!);
  if (is(/pass\b|passe|battle ?pass|saison/)) return lib(n >= 2 ? 'pass' : 'season-pass');
  if (is(/abonnement|subscription|vip|membre|club|one month|monthly|mensuel|par mois|1 mois/)) return lib(is(/vip/) ? 'vip' : 'subscription-scroll');
  if (is(/gemme|diamant|gem|joyau|rubis/)) return lib(`gems-${n + 1}`);
  if (is(/cristal|crystal|cristaux/)) return lib(`crystals-${n + 1}`);
  if (is(/[ée]nergie|energy/)) return lib('energy');
  if (is(/\bvies?\b|lives?|c[œo]eurs?/)) return lib('lives');
  if (is(/boost|booster/)) return lib('booster-x2');
  if (is(/\bxp\b|exp[ée]rience/)) return lib('xp-boost');
  if (is(/cl[ée]s?\b|key/)) return lib('key');
  if (is(/skin|tenue|costume|apparence/)) return lib('skin');
  if (is(/ticket|billet d|entr[ée]e/)) return lib('ticket');
  if (is(/jetons?|tokens?|d[ée]s\b|dice|tours?\b|spins?/)) return lib('tokens');
  if (is(/[ée]toiles?|stars?/)) return lib('stars');
  if (is(/cartes?|cards?/)) return lib('card-pack');
  if (is(/[ée]lixir|potion/)) return lib('elixir');
  if (is(/bouclier|shield|protection/)) return lib('shield');
  if (is(/cadeau|gift/)) return lib(n >= 2 ? 'gift-big' : 'gift-small');
  if (is(/pi[èe]ces?|\bor\b|gold|coins?|monnaie|cash|dollars?|cr[ée]dits?|argent|billets?|bucks|points?|v-bucks|robux/)) return lib(`gold-${n + 1}`);
  if (is(/d[ée]butant|starter|bienvenue|welcome/)) return lib('starter-pack');
  if (is(/pack|offre|lot|bundle|kit|sac|promo|sp[ée]cial|deal/)) return lib(['starter-pack', 'bundle', 'bundle', 'mega-bundle'][n]!);
  return lib(['gems-1', 'gems-2', 'gems-3', 'gems-4'][n]!);
}

/** Type d'un achat intégré d'après son nom. */
export function itemTypeFor(title: string): { type: RealItem['type']; period?: RealItem['period'] } {
  const t = title.toLowerCase();
  if (/abonnement|subscription|vip|membre|club|mensuel|hebdo|one month|monthly|par mois|1 mois|weekly|annuel|yearly/.test(t)) {
    const period = /semaine|hebdo|weekly|week/.test(t) ? 'week' : /\ban\b|annuel|year/.test(t) ? 'year' : 'month';
    return { type: 'auto_renewable', period };
  }
  if (/sans pub|remove ads|no ads|d[ée]bloqu|unlock|version compl[èe]te/.test(t)) return { type: 'non_consumable' };
  if (/pass\b|passe|saison/.test(t)) return { type: 'non_renewing', period: 'month' };
  return { type: 'consumable' };
}

/** Quantité livrée lue en tête du nom (« 1 200 gemmes », « 1,200 PokéPièces » → 1200), 1 sinon. */
export function quantityFor(title: string): number {
  const m = title.replace(/[\u00a0\u202f]/g, ' ').match(/^(\d{1,3}(?:[ .,]\d{3})+|\d+)\s*[^\d\s]/);
  if (!m) return 1;
  const n = parseInt(m[1]!.replace(/[ .,]/g, ''), 10);
  return n > 0 && n < 10_000_000 ? n : 1;
}

/** Nom d'achat intégré lisible : « Sofi Pack_4.99 » → « Sofi Pack ». */
export function cleanIapTitle(title: string): string {
  const t = title.replace(/_/g, ' ').replace(/\s*\(?\d+[.,]\d{2}\s*(?:€|eur|usd|\$)?\)?$/i, '').replace(/\s+/g, ' ').trim();
  return t.length >= 3 ? t : title.trim();
}

/** Articles génériques plausibles quand le store n'expose pas les achats intégrés. */
export function genericItems(category: string, platform: 'mobile' | 'pc'): RealItem[] {
  const currency: Record<string, [string, string]> = {
    RPG: ['Cristaux', 'crystals'], Stratégie: ['Gemmes', 'gems'], Cartes: ['Pièces', 'gold'], Puzzle: ['Pièces', 'gold'],
    Casual: ['Pièces', 'gold'], Simulation: ['Pièces', 'gold'],
  };
  const [cur, art] = currency[category] ?? ['Gemmes', 'gems'];
  const base: Array<Omit<RealItem, 'productId' | 'source'>> = [
    { title: `Poignée de ${cur.toLowerCase()}`, priceCents: 199, type: 'consumable', quantity: 100, imageUrl: lib(`${art}-1`), description: `100 ${cur.toLowerCase()} à dépenser en jeu.` },
    { title: `Sac de ${cur.toLowerCase()}`, priceCents: 999, type: 'consumable', quantity: 550, imageUrl: lib(`${art}-2`), description: `550 ${cur.toLowerCase()}, dont 10 % offerts.` },
    { title: `Coffre de ${cur.toLowerCase()}`, priceCents: 4999, type: 'consumable', quantity: 3000, imageUrl: lib(`${art}-4`), description: `3 000 ${cur.toLowerCase()}, le meilleur rapport.` },
    { title: 'Pack débutant', priceCents: 499, type: 'non_consumable', quantity: 1, imageUrl: lib('starter-pack'), description: 'Un lot de bienvenue pour bien démarrer (une fois par compte).' },
    { title: platform === 'pc' ? 'Passe de combat' : 'Pass de saison', priceCents: 999, type: 'non_renewing', period: 'month', quantity: 1, imageUrl: lib('season-pass'), description: 'Récompenses exclusives pendant toute la saison.' },
    { title: 'Abonnement VIP', priceCents: 499, type: 'auto_renewable', period: 'month', quantity: 1, imageUrl: lib('vip'), description: 'Bonus quotidiens et avantages VIP, résiliable à tout moment.' },
  ];
  return base.map((b, i) => ({ ...b, productId: `generique_${i + 1}`, source: 'generique' }));
}
