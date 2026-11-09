import { describe, expect, it } from 'vitest';
import { contrastRatio, isHexColor, mix, normalizeHex, parseColor, relativeLuminance, shade, worstContrast } from './color';

describe('parseColor / normalizeHex', () => {
  it('normalise les formes hexadécimales en #rrggbb minuscule', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('abc')).toBe('#aabbcc');
    expect(normalizeHex('#1D1D1F')).toBe('#1d1d1f');
    expect(normalizeHex('  #4fa3ff ')).toBe('#4fa3ff');
    expect(normalizeHex('#4fa3ffcc')).toBe('#4fa3ff');
    expect(normalizeHex('#fffa')).toBe('#ffffff');
  });

  it('accepte rgb()/rgba() et quelques noms', () => {
    expect(normalizeHex('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(normalizeHex('rgba(0,0,0,0.5)')).toBe('#000000');
    expect(normalizeHex('rgb(100%, 0%, 0%)')).toBe('#ff0000');
    expect(normalizeHex('White')).toBe('#ffffff');
  });

  it('reconnaît la transparence', () => {
    expect(parseColor('transparent')).toEqual({ kind: 'transparent' });
    expect(parseColor('none')).toEqual({ kind: 'transparent' });
    expect(parseColor('#00000000')).toEqual({ kind: 'transparent' });
    expect(parseColor('rgba(10,10,10,0)')).toEqual({ kind: 'transparent' });
    expect(normalizeHex('transparent')).toBeNull();
  });

  it('rejette les valeurs invalides', () => {
    for (const v of ['', '#12', '#12345', '#ggg', 'rgb(300,0,0)', 'bleu nuit', 42, null, undefined, {}, '#1234567']) {
      expect(parseColor(v)).toBeNull();
    }
  });

  it('isHexColor ne valide que la forme normalisée', () => {
    expect(isHexColor('#a1b2c3')).toBe(true);
    expect(isHexColor('#A1B2C3')).toBe(false);
    expect(isHexColor('#abc')).toBe(false);
  });
});

describe('contraste WCAG', () => {
  it('donne les valeurs de référence', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // #767676 est le gris le plus clair qui passe 4,5:1 sur blanc.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('est symétrique et prend le pire cas sur plusieurs fonds', () => {
    expect(contrastRatio('#4fa3ff', '#0b1433')).toBeCloseTo(contrastRatio('#0b1433', '#4fa3ff'), 10);
    expect(worstContrast('#000000', ['#ffffff', '#333333'])).toBeCloseTo(contrastRatio('#000000', '#333333'), 10);
  });
});

describe('mix / shade', () => {
  it('interpole en sRGB', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 1)).toBe('#ffffff');
  });
});
