/*
 * Sûreté et lisibilité du style des boutiques (rendu joueur + aperçu de l'éditeur).
 * Module pur, importable côté client : seulement des imports de types depuis @devappstore/core/client.
 *
 * - Défense en profondeur (D-18, T-UPL-06, CHK-UPL-08) : les couleurs `ItemStyle` / `GameTheme` sont validées par zod
 *   à l'écriture, mais une ligne ancienne, importée ou modifiée à la main pourrait contenir `red, url(https://…)`.
 *   Au rendu, toute valeur qui n'est pas `#rgb` / `#rrggbb` / `transparent` est remplacée par une valeur par défaut :
 *   aucune requête tierce ne peut partir du navigateur du joueur via `background`.
 * - Images (T-UPL-05, CHK-UPL-07) : seuls les uploads Dev AppStore (`/api/uploads/<clé>`), les uploads du stockage
 *   objet (`https://<NEXT_PUBLIC_S3_PUBLIC_URL>/<kind>/<uploadeur>/<id>.webp`) ou, hors production, les `data:image/`
 *   de démo sont rendus ; une URL tierce (pistage d'IP), un autre chemin du site ou `javascript:` est ignoré.
 * - Contraste (WCAG 2.x, 1.4.3) : les boutons de filtre reprennent le style des articles, mais le texte doit rester
 *   lisible (≥ 4,5:1), même si le studio a choisi un titre blanc sur un fond clair.
 */
import type { GameTheme, ItemStyle } from '@devappstore/core/client';
import { isLibraryArt } from '@/lib/art-library';

export const MIN_TEXT_CONTRAST = 4.5;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Couleur CSS sûre : `#rgb`, `#rrggbb`, ou `transparent` si autorisé ; sinon `fallback`. */
export function safeColor(value: unknown, fallback: string, allowTransparent = false): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (HEX_RE.test(v)) return v;
  if (allowTransparent && v === 'transparent') return v;
  return fallback;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

const BG_TYPES = ['solid', 'linear', 'radial'] as const;

/** Style d'article nettoyé pour le rendu (valeurs inconnues → valeurs neutres). */
export function safeItemStyle(st: ItemStyle): ItemStyle {
  return {
    bgType: BG_TYPES.includes(st.bgType) ? st.bgType : 'radial',
    bg1: safeColor(st.bg1, '#ffffff'),
    bg2: safeColor(st.bg2, '#c9c9cf'),
    titleColor: safeColor(st.titleColor, '#1d1d1f'),
    titleBg: safeColor(st.titleBg, 'transparent', true),
    titleOutline: st.titleOutline === true,
    titleShadow: st.titleShadow === true,
    subtitleColor: safeColor(st.subtitleColor, '#5f5f66'),
    priceColor: safeColor(st.priceColor, '#ffffff'),
    priceBg: safeColor(st.priceBg, '#4a4a52', true),
    priceOutline: st.priceOutline === true,
    priceShadow: st.priceShadow === true,
    borderWidth: clampInt(st.borderWidth, 0, 10, 0),
    borderColor: safeColor(st.borderColor, '#1d1d1f'),
    rounded: st.rounded !== false,
    shadow: st.shadow === true,
  };
}

/** Dégradé du panneau nettoyé (couleurs invalides → blanc). */
export function safeGradient(g: GameTheme['gradient']): GameTheme['gradient'] {
  return {
    enabled: g.enabled === true,
    c1: safeColor(g.c1, '#ffffff'),
    c2: safeColor(g.c2, '#ffffff'),
    style: g.style === 'linear' ? 'linear' : 'radial',
  };
}

const RASTER_DATA_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif|svg\+xml)[;,]/i;

/**
 * Clé d'un upload produit par notre stockage : `<kind>/<uploadeur>/<uuid>.webp` — même format que `UPLOAD_KEY_RE`
 * d'`apps/web/src/server/image-upload.ts` (module serveur, non importable ici : sharp). À garder synchronisés.
 */
const UPLOAD_KEY_RE = /^(?:icon|banner|item)\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9-]{1,64}\.webp$/;
const LOCAL_UPLOAD_PREFIX = '/api/uploads/';

/**
 * Les `data:image/…` (visuels de démo du seed) ne sont rendues qu'en dehors de la production (revue 2026-11, C-04) :
 * en production, toute image passe par le pipeline d'upload (ré-encodage WebP, rattachement au studio).
 * `process.env.NODE_ENV` est figé au build : même décision côté serveur et côté client (pas d'écart d'hydratation).
 */
export function dataImagesAllowed(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production';
}

/**
 * Base publique du stockage objet (S3 / R2) visible du navigateur, normalisée comme `s3PublicBase()` (sans `/` final,
 * sans identifiants, requête ni fragment) mais en **https uniquement** ; null si absente ou invalide.
 *
 * Lue dans `NEXT_PUBLIC_S3_PUBLIC_URL` (même valeur que `S3_PUBLIC_URL`) : ce module est aussi rendu côté client, où
 * seules les variables `NEXT_PUBLIC_*` existent (injectées au build) — le serveur et le client acceptent ainsi les
 * mêmes URL (pas d'écart d'hydratation). Sans elle, les images S3 ne sont pas affichées.
 */
export function publicS3Base(raw: string | undefined = process.env.NEXT_PUBLIC_S3_PUBLIC_URL): string | null {
  const v = raw?.trim().replace(/\/+$/, '');
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * URL d'image affichable : upload servi par Dev AppStore (`/api/uploads/<kind>/<uploadeur>/<id>.webp` exactement),
 * upload du stockage objet (`<base S3 publique>/<kind>/<uploadeur>/<id>.webp`, https, cf. `publicS3Base`) ou, hors
 * production, `data:image/` (visuels de démo du seed ; un SVG dans `<img>` n'exécute pas de script). Sinon `null`.
 * Aucun autre chemin du site (revue 2026-11, C-06 : une `<img>` ne doit pas déclencher de GET arbitraire) ni hôte tiers
 * (pistage d'IP, T-UPL-05).
 *
 * `s3Base` : base publique du stockage (défaut : `NEXT_PUBLIC_S3_PUBLIC_URL`) ; `null` pour refuser toute URL absolue.
 * `allowData` : accepter les `data:image/` (défaut : hors production).
 */
export function safeImageUrl(url: unknown, s3Base: string | null = publicS3Base(), allowData: boolean = dataImagesAllowed()): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u || u.length > 600_000) return null;
  if (isLibraryArt(u)) return u;
  if (u.startsWith(LOCAL_UPLOAD_PREFIX)) return UPLOAD_KEY_RE.test(u.slice(LOCAL_UPLOAD_PREFIX.length)) ? u : null;
  if (RASTER_DATA_RE.test(u)) return allowData ? u : null;
  const base = s3Base ? publicS3Base(s3Base) : null;
  if (base && u.length <= 1024 && u.startsWith(`${base}/`) && UPLOAD_KEY_RE.test(u.slice(base.length + 1))) return u;
  return null;
}

/** Origine (`https://hôte[:port]`) de la base S3 publique, pour la directive CSP `img-src` ; null si absente. */
export function publicS3Origin(raw: string | undefined = process.env.NEXT_PUBLIC_S3_PUBLIC_URL): string | null {
  const base = publicS3Base(raw);
  return base ? new URL(base).origin : null;
}

/* ------------------------------------------------------------------ */
/* Contraste WCAG                                                       */
/* ------------------------------------------------------------------ */

type Rgb = [number, number, number];

export function parseHex(color: string): Rgb | null {
  const v = color.trim();
  if (!HEX_RE.test(v)) return null;
  const h = v.length === 4 ? [...v.slice(1)].map((c) => c + c).join('') : v.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** Luminance relative WCAG 2.x d'une couleur `#rrggbb` (null si non opaque / invalide). */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG (1 à 21) ; 1 si une des couleurs est invalide. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return 1;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contraste le plus faible d'un texte sur un fond composé de plusieurs couleurs (arrêts d'un dégradé). */
export function minContrast(fg: string, stops: string[]): number {
  return stops.length ? Math.min(...stops.map((s) => contrastRatio(fg, s))) : 1;
}

export const INK = '#1d1d1f';
export const WHITE = '#ffffff';
export const BLACK = '#000000';

/**
 * Encre (quasi noir), noir ou blanc, selon ce qui contraste le mieux avec tous les arrêts.
 * Sur une couleur unie, noir ou blanc atteint toujours au moins 4,58:1 (gris moyen #777 : noir 4,69, blanc 4,48).
 */
export function bestTextColor(stops: string[]): string {
  const ink = minContrast(INK, stops);
  const white = minContrast(WHITE, stops);
  // L'encre de marque reste préférée dès qu'elle est lisible et au moins aussi contrastée que le blanc.
  if (ink >= MIN_TEXT_CONTRAST && ink >= white) return INK;
  const black = minContrast(BLACK, stops);
  return black >= white ? BLACK : WHITE;
}

/* ------------------------------------------------------------------ */
/* Boutons de filtre de la boutique                                     */
/* ------------------------------------------------------------------ */

export interface FilterColors {
  background: string;
  color: string;
  /** Les effets de texte du titre (contour/ombre) ne sont gardés que si la couleur du titre est conservée. */
  keepTextEffects: boolean;
  /** Contraste calculé du texte sur le fond (pire cas pour un dégradé). */
  contrast: number;
}

/** Fond CSS d'une carte article ; les couleurs sont filtrées par `safeColor` (jamais de `url(…)`). */
export function cardBackground(raw: Pick<ItemStyle, 'bgType' | 'bg1' | 'bg2'>) {
  const bg1 = safeColor(raw.bg1, '#ffffff');
  const bg2 = safeColor(raw.bg2, '#c9c9cf');
  if (raw.bgType === 'solid') return bg1;
  if (raw.bgType === 'linear') return `linear-gradient(180deg, ${bg1}, ${bg2})`;
  return `radial-gradient(circle at 50% 40%, ${bg1} 0%, ${bg2} 85%)`;
}

/** Fond CSS du panneau boutique (dégradé du thème du jeu), couleurs filtrées. */
export function panelBackground(raw: GameTheme['gradient']) {
  const g = safeGradient(raw);
  if (!g.enabled) return '#ffffff';
  return g.style === 'linear' ? `linear-gradient(180deg, ${g.c1} 0%, ${g.c2} 100%)` : `radial-gradient(ellipse at 50% 0%, ${g.c1} 0%, ${g.c2} 75%)`;
}

/**
 * Couleurs du filtre actif, « même style que les articles » (style du 1er article), avec un contraste ≥ 4,5:1 garanti.
 * Candidats, dans l'ordre : bandeau de titre (titleBg + titleColor), fond de carte + titleColor, pastille de prix.
 * Si aucun n'est lisible, on garde le fond du premier candidat et on remplace le texte par encre/blanc ;
 * si un dégradé contient à la fois du très clair et du très foncé, on se replie sur sa couleur la plus lisible, unie.
 */
export function activeFilterColors(raw: ItemStyle): FilterColors {
  const st = safeItemStyle(raw);
  const cardStops = st.bgType === 'solid' ? [st.bg1] : [st.bg1, st.bg2];
  const candidates: { background: string; stops: string[]; color: string; effects: boolean }[] = [];
  if (st.titleBg !== 'transparent') candidates.push({ background: st.titleBg, stops: [st.titleBg], color: st.titleColor, effects: true });
  candidates.push({ background: cardBackground(st), stops: cardStops, color: st.titleColor, effects: true });
  if (st.priceBg !== 'transparent') candidates.push({ background: st.priceBg, stops: [st.priceBg], color: st.priceColor, effects: false });

  for (const c of candidates) {
    const contrast = minContrast(c.color, c.stops);
    if (contrast >= MIN_TEXT_CONTRAST) return { background: c.background, color: c.color, keepTextEffects: c.effects, contrast };
  }

  const first = candidates[0];
  const color = bestTextColor(first.stops);
  const contrast = minContrast(color, first.stops);
  if (contrast >= MIN_TEXT_CONTRAST) return { background: first.background, color, keepTextEffects: false, contrast };

  // Dégradé clair → foncé : aucune couleur de texte ne convient partout. Fond uni = l'arrêt le plus lisible.
  let best = { background: first.stops[0], color: bestTextColor([first.stops[0]]), contrast: 0 };
  for (const stop of first.stops) {
    const fg = bestTextColor([stop]);
    const ratio = contrastRatio(fg, stop);
    if (ratio > best.contrast) best = { background: stop, color: fg, contrast: ratio };
  }
  return { ...best, keepTextEffects: false };
}
