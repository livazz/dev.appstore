import { Cinzel, Fredoka, Lilita_One } from 'next/font/google';
import type { StoreSkin } from '@devappstore/core/client';

/* Polices d'affichage des thèmes de boutique (auto-hébergées par next/font : aucune requête vers Google au runtime). */
const lilita = Lilita_One({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-skin' });
const cinzel = Cinzel({ weight: ['600', '800'], subsets: ['latin'], display: 'swap', variable: '--font-skin' });
const fredoka = Fredoka({ weight: ['500', '600', '700'], subsets: ['latin'], display: 'swap', variable: '--font-skin' });

/** Classe qui définit `--font-skin` pour le thème (l'épuré garde la police du site). */
export function skinFontClass(skin: StoreSkin): string {
  if (skin === 'arcade') return lilita.variable;
  if (skin === 'premium') return cinzel.variable;
  if (skin === 'casual') return fredoka.variable;
  return '';
}
