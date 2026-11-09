import { DEFAULT_ITEM_STYLE, type ItemStyle } from '@devappstore/core';
import { describe, expect, it } from 'vitest';
import { contrastRatio, isHexColor } from './color';
import { cleanText, effectiveContrast, ensureReadable, normalizeCardStyle, textBackgrounds } from './normalize';
import { DEFAULT_CONTRAST, TITLE_MAX_LENGTH } from './types';

/** Carte « Pass Royal » du prototype (bleu nuit, bordure bleue) telle qu'un modèle la décrirait. */
const NAVY = {
  layout: 3,
  confidence: 0.9,
  title: 'Pass Royal',
  subtitle: 'Récompenses x2 & coffres exclusifs',
  style: {
    bgType: 'linear',
    bg1: '#1b2a5c',
    bg2: '#0b1433',
    titleColor: '#ffffff',
    titleBg: 'transparent',
    titleOutline: false,
    titleShadow: true,
    subtitleColor: '#c9d8ff',
    priceColor: '#ffffff',
    priceBg: '#2f6fe0',
    priceOutline: false,
    priceShadow: false,
    borderWidth: 2,
    borderColor: '#4fa3ff',
    rounded: false,
    shadow: true,
  },
};

const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

/** Invariants que toute sortie doit respecter, quelle que soit l'entrée. */
function expectSafe(style: ItemStyle) {
  for (const k of ['bg1', 'bg2', 'titleColor', 'subtitleColor', 'priceColor', 'priceBg', 'borderColor'] as const) {
    expect(isHexColor(style[k]), `${k}=${style[k]}`).toBe(true);
  }
  expect(style.titleBg === 'transparent' || isHexColor(style.titleBg)).toBe(true);
  expect(['solid', 'linear', 'radial']).toContain(style.bgType);
  expect(Number.isInteger(style.borderWidth)).toBe(true);
  expect(style.borderWidth).toBeGreaterThanOrEqual(0);
  expect(style.borderWidth).toBeLessThanOrEqual(10);
  for (const k of ['titleOutline', 'titleShadow', 'priceOutline', 'priceShadow', 'rounded', 'shadow'] as const) {
    expect(typeof style[k]).toBe('boolean');
  }
  const bgs = textBackgrounds(style);
  expect(effectiveContrast(style.titleColor, bgs.title, style.titleOutline)).toBeGreaterThanOrEqual(DEFAULT_CONTRAST.title);
  expect(effectiveContrast(style.priceColor, bgs.price, style.priceOutline)).toBeGreaterThanOrEqual(DEFAULT_CONTRAST.price);
}

describe('normalizeCardStyle — entrée valide', () => {
  it('conserve une réponse correcte sans avertissement', () => {
    const r = normalizeCardStyle(NAVY);
    expect(r.layout).toBe(3);
    expect(r.style).toEqual(NAVY.style);
    expect(r.title).toBe('Pass Royal');
    expect(r.subtitle).toBe('Récompenses x2 & coffres exclusifs');
    expect(r.confidence).toBe(0.9);
    expect(r.warnings).toEqual([]);
    expect(r.contrast.title).toBeGreaterThan(10);
    expectSafe(r.style);
  });

  it('normalise les formats de couleur et les types tolérés', () => {
    const r = normalizeCardStyle({
      ...NAVY,
      layout: '6',
      style: { ...NAVY.style, bg1: '1B2A5C', borderColor: 'rgb(79,163,255)', rounded: 'true', borderWidth: '3px' },
    });
    expect(r.layout).toBe(6);
    expect(r.style.bg1).toBe('#1b2a5c');
    expect(r.style.borderColor).toBe('#4fa3ff');
    expect(r.style.rounded).toBe(true);
    expect(r.style.borderWidth).toBe(3);
    expect(r.warnings).toEqual([]);
  });

  it('est déterministe et idempotent', () => {
    const a = normalizeCardStyle(NAVY);
    const b = normalizeCardStyle({ ...NAVY, style: a.style, layout: a.layout });
    expect(b.style).toEqual(a.style);
    expect(normalizeCardStyle(NAVY)).toEqual(a);
  });
});

describe('normalizeCardStyle — garde-fous', () => {
  it('remplace une entrée illisible par le style par défaut', () => {
    for (const raw of [null, undefined, 'texte', 42, [], { layout: 2 }]) {
      const r = normalizeCardStyle(raw);
      expect(r.style).toEqual(DEFAULT_ITEM_STYLE);
      expect(codes(r)).toContain('invalid_payload');
      expectSafe(r.style);
    }
  });

  it('applique les valeurs par défaut quand le modèle hésite (null)', () => {
    const style = Object.fromEntries(Object.keys(NAVY.style).map((k) => [k, null]));
    const r = normalizeCardStyle({ layout: null, confidence: 0.2, title: null, subtitle: null, style });
    expect(r.layout).toBe(4);
    expect(r.style).toEqual(DEFAULT_ITEM_STYLE);
    expect(r.title).toBeNull();
    expect(r.subtitle).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it('retombe sur le layout 4 si invalide ou si la confiance est faible', () => {
    expect(normalizeCardStyle({ ...NAVY, layout: 7 }).layout).toBe(4);
    expect(codes(normalizeCardStyle({ ...NAVY, layout: 7 }))).toContain('invalid_layout');
    expect(normalizeCardStyle({ ...NAVY, layout: 2.5 }).layout).toBe(4);
    const low = normalizeCardStyle({ ...NAVY, confidence: 0.1 });
    expect(low.layout).toBe(4);
    expect(codes(low)).toContain('low_confidence_layout');
    // Le style reste exploité même si la mise en page est incertaine.
    expect(low.style.bg1).toBe('#1b2a5c');
    expect(normalizeCardStyle({ ...NAVY, confidence: 0.1 }, { fallbackLayout: 2 }).layout).toBe(2);
  });

  it('borne la confiance à [0, 1]', () => {
    expect(normalizeCardStyle({ ...NAVY, confidence: 3 }).confidence).toBe(1);
    expect(normalizeCardStyle({ ...NAVY, confidence: -1 }).confidence).toBe(0);
    expect(normalizeCardStyle({ ...NAVY, confidence: 'beaucoup' }).confidence).toBeNull();
  });

  it('rejette les couleurs hexadécimales invalides champ par champ', () => {
    const r = normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, borderColor: '#zzzzzz', priceBg: 'transparent' } });
    expect(r.style.borderColor).toBe(DEFAULT_ITEM_STYLE.borderColor);
    expect(r.style.priceBg).toBe(DEFAULT_ITEM_STYLE.priceBg);
    expect(r.warnings.filter((w) => w.code === 'invalid_color').map((w) => w.field)).toEqual(['style.priceBg', 'style.borderColor']);
    expect(r.style.bg1).toBe('#1b2a5c');
  });

  it('accepte un bandeau de titre transparent ou coloré, refuse le reste', () => {
    expect(normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, titleBg: 'none' } }).style.titleBg).toBe('transparent');
    expect(normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, titleBg: '#4CAF50' } }).style.titleBg).toBe('#4caf50');
    const r = normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, titleBg: 'vert' } });
    expect(r.style.titleBg).toBe('transparent');
    expect(codes(r)).toContain('invalid_color');
  });

  it('borne borderWidth entre 0 et 10 (entier)', () => {
    const w = (borderWidth: unknown) => normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, borderWidth } });
    expect(w(25).style.borderWidth).toBe(10);
    expect(codes(w(25))).toContain('border_width_clamped');
    expect(w(-3).style.borderWidth).toBe(0);
    expect(w(2.6).style.borderWidth).toBe(3);
    expect(w(0).style.borderWidth).toBe(0);
    expect(w('épais').style.borderWidth).toBe(DEFAULT_ITEM_STYLE.borderWidth);
    expect(codes(w('épais'))).toContain('invalid_border_width');
    expect(w(Infinity).style.borderWidth).toBe(DEFAULT_ITEM_STYLE.borderWidth);
  });

  it('rejette bgType et booléens invalides', () => {
    const r = normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, bgType: 'conic', rounded: 'peut-être' } });
    expect(r.style.bgType).toBe(DEFAULT_ITEM_STYLE.bgType);
    expect(r.style.rounded).toBe(DEFAULT_ITEM_STYLE.rounded);
    expect(codes(r)).toEqual(expect.arrayContaining(['invalid_bg_type', 'invalid_boolean']));
  });

  it('déduit bg2 de bg1 pour un dégradé quand bg2 manque', () => {
    const r = normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, bg1: '#f9a825', bg2: null, bgType: 'radial' } });
    expect(r.style.bg1).toBe('#f9a825');
    expect(r.style.bg2).not.toBe(DEFAULT_ITEM_STYLE.bg2);
    expect(isHexColor(r.style.bg2)).toBe(true);
    expect(codes(r)).toContain('derived_bg2');
  });
});

describe('normalizeCardStyle — contraste minimal', () => {
  const light = { ...NAVY.style, bgType: 'solid', bg1: '#ffffff', bg2: '#ffffff' };

  it('assombrit légèrement un titre un peu trop clair en conservant sa teinte', () => {
    const r = normalizeCardStyle({ ...NAVY, style: { ...light, titleColor: '#a0a0a0', subtitleColor: '#5f5f66', priceBg: '#2f6fe0' } });
    expect(contrastRatio(r.style.titleColor, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(r.style.titleColor).not.toBe('#a0a0a0');
    expect(contrastRatio(r.style.titleColor, '#a0a0a0')).toBeLessThan(1.3); // changement discret
    expect(r.style.titleOutline).toBe(false);
    expect(codes(r)).toContain('contrast_fixed');
    expectSafe(r.style);
  });

  it('active le contour pour un titre pastel illisible sur fond blanc', () => {
    const r = normalizeCardStyle({ ...NAVY, style: { ...light, titleColor: '#ffe9a8', subtitleColor: '#5f5f66', priceBg: '#2f6fe0' } });
    expect(r.style.titleColor).toBe('#ffe9a8');
    expect(r.style.titleOutline).toBe(true);
    expect(codes(r)).toContain('outline_enabled');
    expectSafe(r.style);
  });

  it('accepte un texte clair avec contour noir (style cartoon) sans le modifier', () => {
    const r = normalizeCardStyle({ ...NAVY, style: { ...light, titleColor: '#ffffff', titleOutline: true, subtitleColor: '#333333' } });
    expect(r.style.titleColor).toBe('#ffffff');
    expect(r.warnings).toEqual([]);
  });

  it('mesure le titre sur son bandeau quand il y en a un', () => {
    const r = normalizeCardStyle({ ...NAVY, style: { ...light, titleBg: '#2e7d32', titleColor: '#ffffff', subtitleColor: '#2e5e1f' } });
    expect(r.style.titleColor).toBe('#ffffff');
    expect(r.contrast.title).toBeCloseTo(contrastRatio('#ffffff', '#2e7d32'), 1);
  });

  it('préfère activer le contour plutôt que dénaturer la couleur (blanc sur bandeau vert clair)', () => {
    // Blanc sur #4caf50 ≈ 2,8:1 : il faudrait noircir le texte de 70 % ; le contour garde le blanc.
    const r = normalizeCardStyle({ ...NAVY, style: { ...light, titleBg: '#4caf50', titleColor: '#ffffff', subtitleColor: '#2e5e1f' } });
    expect(r.style.titleColor).toBe('#ffffff');
    expect(r.style.titleOutline).toBe(true);
    expect(r.warnings.find((w) => w.code === 'outline_enabled')?.message).toMatch(/contour noir activé/);
  });

  it('ne retouche pas une paire texte/fond issue du style par défaut', () => {
    // #5f5f66 sur le dégradé par défaut est légèrement sous 4,5:1 : c'est un choix produit, pas une erreur du modèle.
    const r = normalizeCardStyle({ ...NAVY, style: { priceBg: '#2f6fe0' } });
    expect(r.style.subtitleColor).toBe(DEFAULT_ITEM_STYLE.subtitleColor);
    expect(r.warnings).toEqual([]);
    // Mais si le modèle change le fond, le sous-titre par défaut est vérifié.
    const dark = normalizeCardStyle({ ...NAVY, style: { bgType: 'solid', bg1: '#202020' } });
    expect(dark.style.subtitleColor).not.toBe(DEFAULT_ITEM_STYLE.subtitleColor);
    expect(dark.contrast.subtitle).toBeGreaterThanOrEqual(4.5);
  });

  it('corrige le texte du prix illisible sur sa pastille', () => {
    const r = normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, priceBg: '#f9a825', priceColor: '#ffd54f' } });
    expect(effectiveContrast(r.style.priceColor, ['#f9a825'], r.style.priceOutline)).toBeGreaterThanOrEqual(3);
    expect(r.warnings.map((w) => w.field)).toContain('style.priceColor');
    const dark = normalizeCardStyle({ ...NAVY, style: { ...NAVY.style, priceBg: '#f9a825', priceColor: '#c77800' } });
    expect(contrastRatio(dark.style.priceColor, '#f9a825')).toBeGreaterThanOrEqual(3);
    expect(dark.style.priceOutline).toBe(false);
  });

  it('active le contour quand aucune couleur ne suffit (dégradé blanc → noir)', () => {
    const r = normalizeCardStyle({
      ...NAVY,
      style: { ...NAVY.style, bgType: 'linear', bg1: '#ffffff', bg2: '#000000', titleColor: '#808080', subtitleColor: '#808080' },
    });
    expect(r.style.titleOutline).toBe(true);
    expect(r.style.titleColor).toBe('#808080');
    expect(codes(r)).toContain('outline_enabled');
    // Le sous-titre n'a pas d'option contour : meilleure couleur possible + avertissement explicite.
    const sub = r.warnings.find((w) => w.field === 'style.subtitleColor');
    expect(sub?.message).toMatch(/sous le seuil/);
    expectSafe(r.style);
  });

  it('respecte des seuils personnalisés', () => {
    const style = { ...light, titleColor: '#949494', subtitleColor: '#333333' };
    expect(normalizeCardStyle({ ...NAVY, style }).style.titleColor).toBe('#949494'); // 3,0:1 ≥ 3
    const strict = normalizeCardStyle({ ...NAVY, style }, { contrast: { title: 7 } });
    expect(contrastRatio(strict.style.titleColor, '#ffffff')).toBeGreaterThanOrEqual(7);
  });
});

describe('ensureReadable', () => {
  it('choisit le plus petit ajustement', () => {
    const r = ensureReadable('#7a7a7a', ['#ffffff'], 4.5);
    expect(r.fix).toBe('color');
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
    // Assombri légèrement, pas noirci.
    expect(contrastRatio(r.color, '#ffffff')).toBeLessThan(8);
  });
});

describe('cleanText', () => {
  it('nettoie espaces, guillemets et valeurs vides', () => {
    expect(cleanText('  « Coffre   de\n gemmes »  ', 40).text).toBe('Coffre de gemmes');
    expect(cleanText('"Pack débutant"', 40).text).toBe('Pack débutant');
    expect(cleanText('   ', 40).text).toBeNull();
    expect(cleanText('null', 40).text).toBeNull();
    expect(cleanText(12, 40).text).toBeNull();
  });

  it('tronque proprement les textes trop longs', () => {
    const r = cleanText('Méga coffre légendaire des héros du royaume oublié', TITLE_MAX_LENGTH);
    expect(r.truncated).toBe(true);
    expect(Array.from(r.text!).length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    expect(r.text!.endsWith('…')).toBe(true);
  });

  it('supprime un sous-titre identique au titre', () => {
    expect(normalizeCardStyle({ ...NAVY, subtitle: 'pass royal' }).subtitle).toBeNull();
  });
});

describe('normalizeCardStyle — robustesse (entrées aléatoires)', () => {
  it('ne lève jamais et produit toujours un style sûr', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const values: unknown[] = [
      null, undefined, true, false, 0, -5, 3, 11, 99, NaN, '', 'x', '#fff', '#123456', '#ABCDEF80', 'transparent',
      'rgb(1,2,3)', 'radial', 'solid', 'linear', {}, [], '7', '2',
    ];
    for (let i = 0; i < 500; i++) {
      const style = Object.fromEntries(Object.keys(NAVY.style).map((k) => [k, rnd() < 0.5 ? pick(values) : `#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0')}`]));
      const r = normalizeCardStyle({ layout: pick(values), confidence: pick(values), title: pick(values), subtitle: pick(values), style });
      expect([1, 2, 3, 4, 5, 6]).toContain(r.layout);
      expectSafe(r.style);
    }
  });
});
