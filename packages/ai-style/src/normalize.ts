/**
 * Post-traitement PUR de la réponse du modèle (aucun appel réseau, aucune dépendance à zod).
 *
 * 1. Validation champ par champ avec repli sûr sur DEFAULT_ITEM_STYLE / DEFAULT_LAYOUT.
 * 2. Normalisation (couleurs `#rrggbb`, borderWidth entier 0–10, layout 1–6, textes nettoyés).
 * 3. Contraste minimal texte/fond calculé (WCAG) et correction si illisible.
 *
 * Cette fonction accepte n'importe quelle entrée (`unknown`) : elle ne lève jamais d'exception.
 */
import { DEFAULT_ITEM_STYLE, type BgType, type ItemStyle, type LayoutId } from '@devappstore/core';
import { BLACK, INK, WHITE, contrastRatio, mix, normalizeHex, parseColor, shade, worstContrast } from './color';
import {
  DEFAULT_CONTRAST,
  DEFAULT_LAYOUT,
  MIN_LAYOUT_CONFIDENCE,
  SUBTITLE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type CardStyleSuggestion,
  type ContrastThresholds,
  type NormalizeOptions,
  type StyleWarning,
} from './types';

export const BORDER_WIDTH_MIN = 0;
export const BORDER_WIDTH_MAX = 10;

const BG_TYPES: readonly BgType[] = ['solid', 'linear', 'radial'];
const LAYOUTS: readonly LayoutId[] = [1, 2, 3, 4, 5, 6];

/** Couleurs qui doivent être un hex opaque. `titleBg` est traité à part (accepte `transparent`). */
const OPAQUE_COLOR_KEYS = ['bg1', 'bg2', 'titleColor', 'subtitleColor', 'priceColor', 'priceBg', 'borderColor'] as const;
const BOOLEAN_KEYS = ['titleOutline', 'titleShadow', 'priceOutline', 'priceShadow', 'rounded', 'shadow'] as const;

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Validateurs élémentaires
// ---------------------------------------------------------------------------

export function parseLayout(v: unknown): LayoutId | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && LAYOUTS.includes(n as LayoutId) ? (n as LayoutId) : null;
}

export function parseBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 'oui' || s === 'yes') return true;
    if (s === 'false' || s === 'non' || s === 'no') return false;
  }
  return null;
}

/** Accepte un nombre ou une chaîne (« 2 », « 2px ») ; renvoie NaN si illisible. */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v);
  return NaN;
}

export function parseConfidence(v: unknown): number | null {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

/** Nettoie un texte lu sur l'image : espaces, caractères de contrôle, guillemets englobants, longueur. */
export function cleanText(v: unknown, max: number): { text: string | null; truncated: boolean } {
  if (typeof v !== 'string') return { text: null, truncated: false };
  let s = v
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^["'\u00ab\u201c\u201d\u2018\u2019]+\s*|\s*["'\u00bb\u201c\u201d\u2018\u2019]+$/g, '').trim();
  if (!s || /^(null|none|n\/a|aucun)$/i.test(s)) return { text: null, truncated: false };
  const chars = Array.from(s);
  if (chars.length <= max) return { text: s, truncated: false };
  let cut = chars.slice(0, max - 1).join('');
  const sp = cut.lastIndexOf(' ');
  if (sp >= max * 0.6) cut = cut.slice(0, sp);
  return { text: `${cut.trimEnd()}…`, truncated: true };
}

// ---------------------------------------------------------------------------
// Contraste
// ---------------------------------------------------------------------------

/**
 * Fonds effectifs de la carte sous les textes, d'après le rendu d'`ItemCard` :
 * - `linear` (180deg, bg1 en haut → bg2 en bas) : les textes peuvent être n'importe où → extrémités + milieu
 *   (la luminance d'un mélange sRGB n'est pas forcément monotone) ;
 * - `radial` (`circle at 50% 40%`, bg1 0 % → bg2 85 %) : les textes, centrés, restent à moins de ~75 % du
 *   chemin vers bg2 (le coin le plus lointain, où bg2 est pur, n'est jamais sous un texte) → bg1, 50 %, 75 %.
 */
export function cardBackgrounds(style: Pick<ItemStyle, 'bgType' | 'bg1' | 'bg2'>): string[] {
  if (style.bgType === 'solid') return [style.bg1];
  if (style.bgType === 'radial') return [style.bg1, mix(style.bg1, style.bg2, 0.5), mix(style.bg1, style.bg2, 0.75)];
  return [style.bg1, mix(style.bg1, style.bg2, 0.5), style.bg2];
}

/** Fonds effectifs derrière chaque texte, tels que rendus par `ItemCard`. */
export function textBackgrounds(style: ItemStyle): { title: string[]; subtitle: string[]; price: string[] } {
  const card = cardBackgrounds(style);
  const titleBg = normalizeHex(style.titleBg);
  return { title: titleBg ? [titleBg] : card, subtitle: card, price: [style.priceBg] };
}

/**
 * Contraste effectif d'un texte : pire cas sur ses fonds, ou contraste avec le contour noir
 * de 1 px si `outline` est actif (le contour sépare alors le texte du fond, quel qu'il soit).
 */
export function effectiveContrast(text: string, backgrounds: readonly string[], outline = false): number {
  const onBg = worstContrast(text, backgrounds);
  return outline ? Math.max(onBg, contrastRatio(text, BLACK)) : onBg;
}

export interface ReadableResult {
  color: string;
  outline: boolean;
  ratio: number;
  /** none = inchangé ; color = teinte ajustée ; outline = contour activé ; best_effort = seuil inatteignable. */
  fix: 'none' | 'color' | 'outline' | 'best_effort';
}

/** Au-delà de ce mélange vers le blanc / noir, la teinte d'origine est jugée dénaturée. */
export const MAX_SUBTLE_SHIFT = 0.35;

/**
 * Garantit un contraste minimal en modifiant le moins possible l'apparence du texte, dans cet ordre :
 * 1. léger mélange vers le blanc ou le noir (≤ MAX_SUBTLE_SHIFT, teinte conservée) ;
 * 2. si `allowOutline` : activer le contour noir en gardant la couleur d'origine (rendu « cartoon » des jeux) ;
 * 3. mélange plus fort, jusqu'au blanc / noir pur ;
 * 4. si `allowOutline` : blanc + contour noir ; sinon la meilleure couleur pure (best effort, seuil non atteint).
 */
export function ensureReadable(
  text: string,
  backgrounds: readonly string[],
  min: number,
  opts: { outline?: boolean; allowOutline?: boolean } = {},
): ReadableResult {
  const outline = opts.outline ?? false;
  const initial = effectiveContrast(text, backgrounds, outline);
  if (initial >= min) return { color: text, outline, ratio: initial, fix: 'none' };

  let best: { color: string; t: number } | null = null;
  for (const target of [WHITE, BLACK]) {
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      const c = mix(text, target, t);
      if (effectiveContrast(c, backgrounds, outline) >= min) {
        if (!best || t < best.t) best = { color: c, t };
        break;
      }
    }
  }
  const colorFix = (c: string): ReadableResult => ({ color: c, outline, ratio: effectiveContrast(c, backgrounds, outline), fix: 'color' });
  if (best && best.t <= MAX_SUBTLE_SHIFT) return colorFix(best.color);

  if (opts.allowOutline && !outline) {
    const withOutline = effectiveContrast(text, backgrounds, true);
    if (withOutline >= min) return { color: text, outline: true, ratio: withOutline, fix: 'outline' };
  }
  if (best) return colorFix(best.color);

  if (opts.allowOutline) {
    return { color: WHITE, outline: true, ratio: effectiveContrast(WHITE, backgrounds, true), fix: 'outline' };
  }
  const pure = worstContrast(WHITE, backgrounds) >= worstContrast(INK, backgrounds) ? WHITE : INK;
  return { color: pure, outline, ratio: effectiveContrast(pure, backgrounds, outline), fix: 'best_effort' };
}

// ---------------------------------------------------------------------------
// Normalisation principale
// ---------------------------------------------------------------------------

/**
 * Transforme la sortie brute du modèle en suggestion sûre `{ layout, style, title, subtitle }`.
 * Fonction pure et déterministe : même entrée → même sortie.
 */
export function normalizeCardStyle(raw: unknown, options: NormalizeOptions = {}): CardStyleSuggestion {
  const fallback = options.fallbackStyle ?? DEFAULT_ITEM_STYLE;
  const fallbackLayout = options.fallbackLayout ?? DEFAULT_LAYOUT;
  const thresholds: ContrastThresholds = { ...DEFAULT_CONTRAST, ...options.contrast };
  const minConfidence = options.minLayoutConfidence ?? MIN_LAYOUT_CONFIDENCE;
  const warnings: StyleWarning[] = [];
  const warn = (code: StyleWarning['code'], field: string, message: string) => warnings.push({ code, field, message });

  const root: Rec = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) warn('invalid_payload', '', 'Réponse du modèle illisible : style par défaut appliqué.');
  const rs: Rec = isRecord(root.style) ? root.style : {};
  if (isRecord(raw) && !isRecord(root.style)) warn('invalid_payload', 'style', 'Aucun style fourni : style par défaut appliqué.');

  // --- Confiance et layout -------------------------------------------------
  const confidence = parseConfidence(root.confidence);
  let layout = parseLayout(root.layout);
  if (layout === null) {
    if (root.layout !== null && root.layout !== undefined) {
      warn('invalid_layout', 'layout', `Mise en page « ${String(root.layout)} » invalide : mise en page ${fallbackLayout} utilisée.`);
    }
    layout = fallbackLayout;
  } else if (confidence !== null && confidence < minConfidence) {
    warn('low_confidence_layout', 'layout', `Analyse peu sûre : mise en page ${fallbackLayout} conservée par défaut.`);
    layout = fallbackLayout;
  }

  // --- Style ---------------------------------------------------------------
  const style: ItemStyle = { ...fallback };
  const present = (k: string) => rs[k] !== undefined && rs[k] !== null;

  if (present('bgType')) {
    const bt = typeof rs.bgType === 'string' ? (rs.bgType.trim().toLowerCase() as BgType) : null;
    if (bt && BG_TYPES.includes(bt)) style.bgType = bt;
    else warn('invalid_bg_type', 'style.bgType', 'Type de fond invalide : valeur par défaut utilisée.');
  }

  for (const k of OPAQUE_COLOR_KEYS) {
    if (!present(k)) continue;
    const hex = normalizeHex(rs[k]);
    if (hex) style[k] = hex;
    else warn('invalid_color', `style.${k}`, `Couleur « ${String(rs[k])} » invalide : valeur par défaut utilisée.`);
  }
  if (present('titleBg')) {
    const p = parseColor(rs.titleBg);
    if (p?.kind === 'opaque') style.titleBg = p.hex;
    else if (p?.kind === 'transparent') style.titleBg = 'transparent';
    else warn('invalid_color', 'style.titleBg', `Couleur « ${String(rs.titleBg)} » invalide : bandeau de titre transparent.`);
  }
  // Repli sûr : si seul bg1 est fiable pour un dégradé, bg2 est dérivé de bg1 plutôt que d'un gris sans rapport.
  if (style.bgType !== 'solid' && normalizeHex(rs.bg1) && !normalizeHex(rs.bg2)) {
    style.bg2 = shade(style.bg1, -0.22);
    warn('derived_bg2', 'style.bg2', 'Seconde couleur du dégradé déduite de la première.');
  }

  for (const k of BOOLEAN_KEYS) {
    if (!present(k)) continue;
    const b = parseBoolean(rs[k]);
    if (b !== null) style[k] = b;
    else warn('invalid_boolean', `style.${k}`, `Valeur « ${String(rs[k])} » invalide pour ${k} : valeur par défaut utilisée.`);
  }

  if (present('borderWidth')) {
    const n = toNumber(rs.borderWidth);
    if (!Number.isFinite(n)) {
      warn('invalid_border_width', 'style.borderWidth', 'Épaisseur de bordure invalide : valeur par défaut utilisée.');
    } else {
      const clamped = Math.max(BORDER_WIDTH_MIN, Math.min(BORDER_WIDTH_MAX, Math.round(n)));
      if (clamped !== Math.round(n)) {
        warn('border_width_clamped', 'style.borderWidth', `Épaisseur de bordure ramenée à ${clamped} px (bornes ${BORDER_WIDTH_MIN}–${BORDER_WIDTH_MAX}).`);
      }
      style.borderWidth = clamped;
    }
  }

  // --- Contraste -----------------------------------------------------------
  // Une paire texte/fond entièrement issue du style de repli (choix produit) n'est jamais retouchée :
  // on ne corrige que ce que le modèle a proposé.
  const bgs = textBackgrounds(style);
  const card = ['bgType', 'bg1', 'bg2'] as const;
  const untouched = (keys: readonly (keyof ItemStyle)[]) => keys.every((k) => style[k] === fallback[k]);
  const readable = (keys: readonly (keyof ItemStyle)[], ...args: Parameters<typeof ensureReadable>): ReadableResult =>
    untouched(keys)
      ? { color: args[0], outline: args[3]?.outline ?? false, ratio: effectiveContrast(args[0], args[1], args[3]?.outline), fix: 'none' }
      : ensureReadable(...args);

  const title = readable(['titleColor', 'titleBg', 'titleOutline', ...card], style.titleColor, bgs.title, thresholds.title, {
    outline: style.titleOutline,
    allowOutline: true,
  });
  const subtitle = readable(['subtitleColor', ...card], style.subtitleColor, bgs.subtitle, thresholds.subtitle);
  const price = readable(['priceColor', 'priceBg', 'priceOutline'], style.priceColor, bgs.price, thresholds.price, {
    outline: style.priceOutline,
    allowOutline: true,
  });

  const report = (field: 'titleColor' | 'subtitleColor' | 'priceColor', label: string, r: ReadableResult, min: number) => {
    if (r.fix === 'none') return;
    if (r.fix === 'outline') {
      const how = r.color === style[field] ? 'contour noir activé' : 'texte blanc avec contour noir';
      warn('outline_enabled', `style.${field}`, `${label} peu lisible sur son fond : ${how}.`);
    } else if (r.fix === 'best_effort') {
      warn('contrast_fixed', `style.${field}`, `${label} : contraste ${r.ratio.toFixed(1)}:1 sous le seuil ${min}:1 malgré la correction, vérifiez le fond.`);
    } else {
      warn('contrast_fixed', `style.${field}`, `${label} ajusté pour atteindre un contraste de ${r.ratio.toFixed(1)}:1.`);
    }
  };
  report('titleColor', 'Titre', title, thresholds.title);
  report('subtitleColor', 'Sous-titre', subtitle, thresholds.subtitle);
  report('priceColor', 'Prix', price, thresholds.price);

  style.titleColor = title.color;
  style.titleOutline = title.outline;
  style.subtitleColor = subtitle.color;
  style.priceColor = price.color;
  style.priceOutline = price.outline;

  // --- Textes --------------------------------------------------------------
  const t = cleanText(root.title, TITLE_MAX_LENGTH);
  if (t.truncated) warn('text_truncated', 'title', `Titre raccourci à ${TITLE_MAX_LENGTH} caractères.`);
  const st = cleanText(root.subtitle, SUBTITLE_MAX_LENGTH);
  if (st.truncated) warn('text_truncated', 'subtitle', `Sous-titre raccourci à ${SUBTITLE_MAX_LENGTH} caractères.`);
  const subtitleText = st.text && t.text && st.text.toLowerCase() === t.text.toLowerCase() ? null : st.text;

  return {
    layout,
    style,
    title: t.text,
    subtitle: subtitleText,
    confidence,
    contrast: {
      title: round2(title.ratio),
      subtitle: round2(subtitle.ratio),
      price: round2(price.ratio),
    },
    warnings,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
