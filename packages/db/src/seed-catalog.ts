/* Seed du catalogue de faux jeux (catalog-data.ts) : studios, jeux et articles. Idempotent (onConflictDoNothing). */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_ITEM_STYLE, SKIN_PALETTES, hashApiKey, type GameTheme, type ItemStyle, type LayoutId } from '@devappstore/core';
import { db, games, items, studios } from './index';
import { CATALOG_GAMES, CATALOG_STUDIOS, type CatalogGame } from './catalog-data';

/** Dossier apps/web/public, trouvé en remontant depuis le dossier courant (le seed tourne dans packages/db). */
function publicDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const p = path.join(dir, 'apps/web/public');
    if (existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  return null;
}

export const catalogGameId = (slug: string) => `gam_${slug.replace(/-/g, '_')}`;

export function catalogTheme(g: CatalogGame, index: number): GameTheme {
  return {
    skin: g.skin,
    gradient: { enabled: !!g.gradient, c1: g.colors.c1, c2: g.colors.c2, style: g.gradient ?? 'linear' },
    grid: { width: g.cardWidth ?? 185 + (index % 4) * 10, height: 280, margin: 24 },
  };
}

export function catalogItemStyle(g: CatalogGame, i: number): ItemStyle {
  const [bg1, bg2] = g.colors.cards[i % g.colors.cards.length]!;
  if (g.skin === 'classic') {
    return { ...DEFAULT_ITEM_STYLE, bg1, bg2, titleColor: '#ffffff', titleOutline: true, titleShadow: true, subtitleColor: '#26304f', priceBg: 'transparent', priceOutline: true, priceShadow: true, borderWidth: 3, borderColor: '#141826' };
  }
  return { ...DEFAULT_ITEM_STYLE, ...SKIN_PALETTES[g.skin][i % 4]!.style, bg1, bg2 };
}

export async function seedCatalog() {
  const pub = publicDir();
  const ownArt = (slug: string, name: string) => {
    const url = `/art/games/${slug}/${name}.webp`;
    return pub && existsSync(path.join(pub, url)) ? url : null;
  };
  for (const s of CATALOG_STUDIOS) await db.insert(studios).values(s).onConflictDoNothing();
  let itemCount = 0;
  for (const [index, g] of CATALOG_GAMES.entries()) {
    const id = catalogGameId(g.slug);
    const studio = CATALOG_STUDIOS.find((s) => s.id === g.studio)!;
    await db
      .insert(games)
      .values({
        id, studioId: studio.id, slug: g.slug, name: g.name, subtitle: g.subtitle, publisherName: studio.name, category: g.category,
        description: g.description, iconUrl: `/art/games/${g.slug}/icon.webp`, bannerUrl: `/art/games/${g.slug}/banner.webp`,
        theme: catalogTheme(g, index), status: 'live', linkMethods: ['code'],
        webhookSecret: `whsec_demo_${g.slug}`, apiKeyHash: hashApiKey(`das_secret_demo_${g.slug}`), apiKeyPrefix: 'das_secret_demo',
        publishableKey: `das_pub_demo_${g.slug}`,
      })
      .onConflictDoNothing();
    for (const [i, it] of g.items.entries()) {
      const imageUrl = (it.own && ownArt(g.slug, it.own.name)) || `/art/items/${it.art}.webp`;
      await db
        .insert(items)
        .values({
          id: `itm_${id.slice(4)}_${it.productId}`, gameId: id, position: i, productId: it.productId, type: it.type ?? 'consumable',
          title: it.title, subtitle: it.subtitle ?? '', priceCents: it.price, oldPriceCents: it.old ?? null, quantity: it.qty ?? 1,
          keywords: it.keywords, models: [{ imageUrl, label: it.title }], layout: (it.layout ?? 1) as LayoutId, style: catalogItemStyle(g, i),
        })
        .onConflictDoNothing();
      itemCount++;
    }
  }
  return { studios: CATALOG_STUDIOS.length, games: CATALOG_GAMES.length, items: itemCount };
}
