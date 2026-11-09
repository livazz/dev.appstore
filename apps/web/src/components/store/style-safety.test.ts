import { describe, expect, it } from 'vitest';
import { DEFAULT_ITEM_STYLE, type ItemStyle } from '@wolleen/core/client';
import {
  activeFilterColors,
  cardBackground,
  contrastRatio,
  MIN_TEXT_CONTRAST,
  minContrast,
  panelBackground,
  safeColor,
  safeImageUrl,
  safeItemStyle,
} from './style-safety';

// Styles du seed de démo (packages/db/src/seed.ts).
const farm: ItemStyle = { ...DEFAULT_ITEM_STYLE, bgType: 'linear', bg1: '#ffffff', bg2: '#e2f7d4', titleColor: '#ffffff', titleBg: '#4caf50', subtitleColor: '#2e5e1f', priceBg: '#f9a825', borderWidth: 0 };
const lavender: ItemStyle = { ...DEFAULT_ITEM_STYLE, bg1: '#eef0ff', bg2: '#9fb0f0', titleColor: '#ffffff', titleOutline: true, titleShadow: true, subtitleColor: '#2d3a6b', priceBg: 'transparent', priceOutline: true, priceShadow: true, borderWidth: 3, borderColor: '#141826' };
const navy: ItemStyle = { ...DEFAULT_ITEM_STYLE, bg1: '#3b5cc4', bg2: '#101c4a', titleColor: '#ffffff', subtitleColor: '#c7d3ff', priceBg: '#0b1433', borderColor: '#4fa3ff', rounded: false };

describe('contraste WCAG', () => {
  it('calcule les rapports de référence', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('red', '#000')).toBe(1);
  });
});

describe('activeFilterColors — filtre actif « Tout »', () => {
  it('régression Pixel Farm : titre blanc sur fond clair → texte lisible (≥ 4,5:1)', () => {
    // Avant : fond = dégradé de carte (#ffffff → #e2f7d4), texte = #ffffff → contraste 1:1.
    expect(minContrast(farm.titleColor, [farm.bg1, farm.bg2])).toBeLessThan(1.2);
    const c = activeFilterColors(farm);
    expect(c.contrast).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrastRatio(c.color, c.background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    // Même style que les articles : le bandeau de titre vert est conservé.
    expect(c.background).toBe('#4caf50');
  });

  it('lavande (titre blanc contouré sur fond clair) → texte foncé sur le fond de carte', () => {
    const c = activeFilterColors(lavender);
    expect(c.background).toBe(cardBackground(lavender));
    expect(minContrast(c.color, [lavender.bg1, lavender.bg2])).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(c.keepTextEffects).toBe(false);
  });

  it('garde la couleur et les effets du studio quand ils sont déjà lisibles', () => {
    const c = activeFilterColors(navy);
    expect(c).toMatchObject({ background: cardBackground(navy), color: '#ffffff', keepTextEffects: true });
  });

  it('dégradé noir → blanc : repli sur un fond uni lisible', () => {
    const c = activeFilterColors({ ...DEFAULT_ITEM_STYLE, bgType: 'linear', bg1: '#000000', bg2: '#ffffff', titleColor: '#777777', titleBg: 'transparent', priceBg: 'transparent' });
    expect(c.background).toMatch(/^#/);
    expect(contrastRatio(c.color, c.background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('≥ 4,5:1 pour toute combinaison de couleurs (balayage)', () => {
    const palette = ['#ffffff', '#000000', '#777777', '#4caf50', '#f9a825', '#ffd43b', '#4aa8f0', '#e2f7d4', '#101c4a', '#c0c0c0'];
    for (const bg1 of palette)
      for (const bg2 of palette)
        for (const titleColor of palette)
          for (const bgType of ['solid', 'linear', 'radial'] as const) {
            const c = activeFilterColors({ ...DEFAULT_ITEM_STYLE, bgType, bg1, bg2, titleColor, titleBg: 'transparent', priceBg: 'transparent' });
            const stops = c.background.startsWith('#') ? [c.background] : bgType === 'solid' ? [bg1] : [bg1, bg2];
            expect(minContrast(c.color, stops)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
          }
  });
});

describe('D-18 / CHK-UPL-08 — couleurs revalidées au rendu (défense en profondeur)', () => {
  const evil = 'red, url(https://pistage.tld/x)';

  it('safeColor n’accepte que #rgb, #rrggbb et transparent (si autorisé)', () => {
    expect(safeColor('#a1B2c3', '#000')).toBe('#a1B2c3');
    expect(safeColor('#abc', '#000')).toBe('#abc');
    expect(safeColor(evil, '#000')).toBe('#000');
    expect(safeColor('transparent', '#000')).toBe('#000');
    expect(safeColor('transparent', '#000', true)).toBe('transparent');
    expect(safeColor('#fff;background:url(x)', '#000')).toBe('#000');
    expect(safeColor(undefined, '#000')).toBe('#000');
  });

  it('cardBackground / panelBackground ne contiennent jamais url(…) même si la base est corrompue', () => {
    const st = { ...DEFAULT_ITEM_STYLE, bg1: evil, bg2: evil, bgType: 'linear' as const };
    expect(cardBackground(st)).not.toMatch(/url\(/i);
    expect(cardBackground({ ...st, bgType: 'solid' })).toBe('#ffffff');
    expect(panelBackground({ enabled: true, c1: evil, c2: `#fff), url(https://pistage.tld/y`, style: 'linear' })).not.toMatch(/url\(/i);
  });

  it('safeItemStyle nettoie toutes les couleurs et borne borderWidth', () => {
    const st = safeItemStyle({
      ...DEFAULT_ITEM_STYLE,
      titleColor: evil,
      titleBg: evil,
      subtitleColor: evil,
      priceColor: evil,
      priceBg: evil,
      borderColor: evil,
      borderWidth: 9999,
      bgType: 'x' as never,
    });
    expect(JSON.stringify(st)).not.toMatch(/url\(/i);
    expect(st.borderWidth).toBe(10);
    expect(st.bgType).toBe('radial');
  });
});

describe('T-UPL-05 / CHK-UPL-07 — images tierces non rendues aux joueurs', () => {
  it('accepte les uploads Wolleen et les data:image du seed', () => {
    expect(safeImageUrl('/api/uploads/icon/abc.webp')).toBe('/api/uploads/icon/abc.webp');
    expect(safeImageUrl('data:image/svg+xml;utf8,<svg/>')).toBe('data:image/svg+xml;utf8,<svg/>');
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('refuse les URL tierces, protocol-relative, javascript: et data: non image', () => {
    for (const u of [
      'https://pistage.tld/x.png',
      'http://169.254.169.254/x',
      '//pistage.tld/x.png',
      '/\\pistage.tld/x.png',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      ' ',
      null,
      undefined,
    ])
      expect(safeImageUrl(u)).toBeNull();
  });
});
