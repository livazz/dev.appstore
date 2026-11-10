import { PERIODS } from '@devappstore/core/client';
import type { CardItem } from './ItemCard';

/* Logique pure des boutiques à thème (testable sans next/font). */

/** Rubans mis en avant à partir des mots-clés (les autres mots-clés servent seulement aux sections). */
export const RIBBON_RE = /^(meilleure offre|populaire|nouveau|nouveauté|exclusif|offre unique|best-seller)$/i;

export const isWide = (layout: number) => layout === 3 || layout === 6;

export function discountPct(item: CardItem): number | null {
  if (item.oldPriceCents == null || item.oldPriceCents <= item.priceCents || item.oldPriceCents <= 0) return null;
  const pct = Math.round((1 - item.priceCents / item.oldPriceCents) * 100);
  return pct >= 5 ? pct : null;
}

export function periodSuffix(item: CardItem): string {
  if (item.type !== 'auto_renewable' && item.type !== 'non_renewing') return '';
  return PERIODS.find((p) => p.value === item.period)?.short ?? '';
}

export const fmtQty = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ');

/** Regroupe les articles par leur premier mot-clé, dans l'ordre d'apparition (sans mot-clé : section « Boutique »). */
export function groupSections<T extends { keywords: string[] }>(items: T[]): { key: string; title: string; items: T[] }[] {
  const out = new Map<string, { key: string; title: string; items: T[] }>();
  for (const item of items) {
    const kw = item.keywords.find((k) => !RIBBON_RE.test(k.trim())) ?? 'Boutique';
    const key = kw.trim().toLowerCase();
    if (!out.has(key)) out.set(key, { key, title: kw.trim(), items: [] });
    out.get(key)!.items.push(item);
  }
  return [...out.values()];
}

