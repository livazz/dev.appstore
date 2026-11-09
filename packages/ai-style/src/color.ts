/**
 * Utilitaires couleur purs (aucune dépendance) : parsing tolérant, normalisation en `#rrggbb`,
 * luminance relative et ratio de contraste WCAG 2.x, mélange vers le blanc / noir.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const WHITE = '#ffffff';
export const BLACK = '#000000';
/** Encre quasi noire utilisée par DEFAULT_ITEM_STYLE (plus douce que #000). */
export const INK = '#1d1d1f';

const HEX_RE = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

const NAMED: Record<string, string> = {
  white: WHITE,
  black: BLACK,
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  gold: '#ffd700',
};

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex2 = (n: number) => clamp255(n).toString(16).padStart(2, '0');

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

function channel(v: string): number {
  return v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v);
}

function alpha(v: string | undefined): number {
  if (v === undefined) return 1;
  return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
}

/** Résultat du parsing : couleur opaque, transparente, ou invalide (`null`). */
export type ParsedColor = { kind: 'opaque'; hex: string } | { kind: 'transparent' } | null;

/**
 * Parse une couleur renvoyée par le modèle. Accepte `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (avec ou sans `#`),
 * `rgb()/rgba()`, quelques noms CSS courants et `transparent`/`none`. Une couleur dont l'alpha < 0,1 est
 * considérée transparente ; sinon l'alpha est ignoré (la carte n'utilise que des couleurs opaques).
 */
export function parseColor(input: unknown): ParsedColor {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (s === 'transparent' || s === 'none') return { kind: 'transparent' };
  if (NAMED[s]) return { kind: 'opaque', hex: NAMED[s] };

  const hm = HEX_RE.exec(s);
  if (hm) {
    let h = hm[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 8) {
      const a = parseInt(h.slice(6, 8), 16) / 255;
      if (a < 0.1) return { kind: 'transparent' };
      h = h.slice(0, 6);
    }
    return { kind: 'opaque', hex: `#${h}` };
  }

  const rm = RGB_RE.exec(s);
  if (rm) {
    const [r, g, b] = [channel(rm[1]), channel(rm[2]), channel(rm[3])];
    const a = alpha(rm[4]);
    if ([r, g, b, a].some((n) => !Number.isFinite(n))) return null;
    if (r > 255 || g > 255 || b > 255) return null;
    if (a < 0.1) return { kind: 'transparent' };
    return { kind: 'opaque', hex: rgbToHex({ r, g, b }) };
  }
  return null;
}

/** Normalise en `#rrggbb` minuscule, ou `null` si la valeur n'est pas une couleur opaque valide. */
export function normalizeHex(input: unknown): string | null {
  const p = parseColor(input);
  return p?.kind === 'opaque' ? p.hex : null;
}

export function isHexColor(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-f]{6}$/.test(s);
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex);
  if (!h) throw new Error(`Couleur invalide : ${hex}`);
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

/** Luminance relative WCAG 2.x (0 = noir, 1 = blanc). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Ratio de contraste WCAG entre deux couleurs opaques (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contraste du pire cas d'une couleur de texte posée sur plusieurs fonds (ex. les deux bouts d'un dégradé). */
export function worstContrast(text: string, backgrounds: readonly string[]): number {
  return Math.min(...backgrounds.map((bg) => contrastRatio(text, bg)));
}

/** Mélange linéaire en sRGB : t = 0 → `a`, t = 1 → `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k });
}

/** Assombrit (amount < 0, vers le noir) ou éclaircit (amount > 0, vers le blanc) une couleur. */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, WHITE, amount) : mix(hex, BLACK, -amount);
}
