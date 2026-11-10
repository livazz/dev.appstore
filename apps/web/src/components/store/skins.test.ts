import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, SKIN_PALETTES, STORE_SKINS } from '@devappstore/core';
import { themeSchema, itemStyleSchema } from '@/server/studio-logic';
import { groupSections } from './skin-logic';

describe('thèmes de boutique', () => {
  it('le thème par défaut des nouveaux jeux est « arcade » et passe la validation', () => {
    expect(DEFAULT_THEME.skin).toBe('arcade');
    expect(themeSchema.safeParse(DEFAULT_THEME).success).toBe(true);
  });

  it('un thème sans `skin` (jeux existants) reste valide ; un thème inconnu est refusé', () => {
    const { skin: _skin, ...legacy } = DEFAULT_THEME;
    expect(themeSchema.safeParse(legacy).success).toBe(true);
    expect(themeSchema.safeParse({ ...DEFAULT_THEME, skin: 'neon' }).success).toBe(false);
  });

  it('chaque thème du sélecteur (hors classique) a 4 palettes de couleurs valides', () => {
    for (const { value } of STORE_SKINS) {
      if (value === 'classic') continue;
      const palettes = SKIN_PALETTES[value];
      expect(palettes).toHaveLength(4);
      for (const p of palettes) {
        const style = { ...itemStyleSchema.parse({ bgType: 'radial', bg1: '#ffffff', bg2: '#000000', titleColor: '#000000', titleBg: 'transparent', titleOutline: false, titleShadow: false, subtitleColor: '#000000', priceColor: '#ffffff', priceBg: '#000000', priceOutline: false, priceShadow: false, borderWidth: 0, borderColor: '#000000', rounded: true, shadow: false }), ...p.style };
        expect(itemStyleSchema.safeParse(style).success).toBe(true);
      }
    }
  });
});

describe('groupSections', () => {
  const it_ = (title: string, keywords: string[]) => ({ title, keywords });

  it('regroupe par premier mot-clé, dans l’ordre d’apparition, sans tenir compte de la casse', () => {
    const s = groupSections([it_('a', ['Gemmes']), it_('b', ['Or']), it_('c', ['gemmes', 'Monnaie'])]);
    expect(s.map((x) => x.title)).toEqual(['Gemmes', 'Or']);
    expect(s[0]!.items.map((i) => i.title)).toEqual(['a', 'c']);
  });

  it('ignore les mots-clés de ruban pour choisir la section, et range les articles sans mot-clé dans « Boutique »', () => {
    const s = groupSections([it_('a', ['Meilleure offre', 'Gemmes']), it_('b', []), it_('c', ['Offre unique'])]);
    expect(s.map((x) => x.title)).toEqual(['Gemmes', 'Boutique']);
    expect(s[1]!.items.map((i) => i.title)).toEqual(['b', 'c']);
  });
});
