/*
 * npm run real-tops:seed [-- --remove]
 *
 * Charge .data/real-tops/catalog.json (produit par real-tops:fetch) dans la base de DÉVELOPPEMENT : studios réels
 * (`std_real_…`), jeux publiés (`gam_real_…`, plateforme, captures, description du store, thème selon le genre) et
 * articles. Idempotent : relancer met à jour les jeux et articles ; les articles disparus du catalogue sont désactivés.
 * Masque aussi les jeux fictifs publiés (brouillon ; `--keep-fake` pour les garder). `--remove` retire tout (jeux, articles,
 * studios réels et leurs éventuelles commandes de test) et republie les jeux fictifs masqués. Refusé en production.
 * STRICTEMENT LOCAL (voir common.ts) : rien de ceci ne doit être commité ni publié.
 */
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_ITEM_STYLE, SKIN_PALETTES, hashApiKey, type GameTheme, type ItemStyle } from '@devappstore/core';
import { and, eq, like, notInArray, sql } from 'drizzle-orm';
import { db, games, items, studios } from '@devappstore/db';
import { seedPromosSales } from '../../packages/db/src/seed-promos-sales';
import { seedReviews } from '../../packages/db/src/seed-reviews';
import { CATALOG_FILE, artFile, artUrl, assertLocalOnly, importManualBanner, skinFor, slugify, type RealCatalog, type RealGame } from './common';

assertLocalOnly();

const REAL_GAME = 'gam_real_';
const REAL_STUDIO = 'std_real_';
const under = (s: string) => s.replace(/-/g, '_');

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function themeFor(g: RealGame): GameTheme {
  return {
    skin: skinFor(g.category),
    gradient: { enabled: true, c1: shade(g.color, 0.15), c2: shade(g.color, -0.55), style: 'linear' },
    grid: { width: 200, height: 280, margin: 24 },
  };
}

function styleFor(g: RealGame, i: number): ItemStyle {
  return { ...DEFAULT_ITEM_STYLE, ...SKIN_PALETTES[skinFor(g.category)][i % 4]!.style };
}

async function remove() {
  const ids = (await db.select({ id: games.id }).from(games).where(like(games.id, `${REAL_GAME}%`))).map((r) => r.id);
  if (ids.length) {
    // Commandes de test passées en local sur ces jeux (clés étrangères sans cascade) : supprimées avec eux.
    const list = sql.join(ids.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`delete from refund_deliveries where game_id in (${list})`).catch(() => {});
    await db.execute(sql`delete from deliveries where game_id in (${list})`).catch(() => {});
    const orderIds = sql`select id from orders where game_id in (${list})`;
    await db.execute(sql`update loyalty_entries set order_id = null where order_id in (${orderIds})`).catch(() => {});
    await db.execute(sql`update loyalty_redemptions set order_id = null where order_id in (${orderIds})`).catch(() => {});
    await db.execute(sql`delete from orders where game_id in (${list})`).catch(() => {});
  }
  await db.delete(games).where(like(games.id, `${REAL_GAME}%`));
  await db.delete(studios).where(like(studios.id, `${REAL_STUDIO}%`));
  console.log(`Vrais tops retirés de la base : ${ids.length} jeux. (Fichiers : rm -rf .data/real-tops apps/web/public/art/local)`);
}

async function seed() {
  if (!existsSync(CATALOG_FILE)) throw new Error(`${CATALOG_FILE} introuvable : lancez d'abord npm run real-tops:fetch.`);
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) as RealCatalog;
  // Slugs déjà pris par d'autres jeux (catalogue fictif, jeux de studios) : on ne les écrase jamais.
  const taken = new Set(
    (await db.select({ slug: games.slug, id: games.id }).from(games)).filter((r) => !r.id.startsWith(REAL_GAME)).map((r) => r.slug),
  );
  let itemCount = 0;
  let banners = 0;
  for (const g of catalog.games) {
    const studioSlug = `real-${slugify(g.publisher, 40)}`;
    const studioId = `${REAL_STUDIO}${under(studioSlug.slice(5))}`;
    await db.insert(studios).values({ id: studioId, name: g.publisher, slug: studioSlug }).onConflictDoNothing();

    const id = `${REAL_GAME}${under(g.slug)}`;
    const slug = taken.has(g.slug) ? `${g.slug}-vrai` : g.slug;
    // Bannière générée à la main depuis le fetch ? (.data/real-tops/bannieres/<slug>.png)
    const banner = (await importManualBanner(g.slug)) ?? (existsSync(artFile(g.slug, 'banner')) ? artUrl(g.slug, 'banner') : null);
    if (banner) banners++;
    const values = {
      studioId, slug, name: g.name.slice(0, 80), subtitle: g.subtitle.slice(0, 80), publisherName: g.publisher, category: g.category,
      description: g.description, storeDescription: g.storeDescription, platform: g.platform, screenshots: g.screenshots,
      iconUrl: g.icon, bannerUrl: banner, theme: themeFor(g), status: 'live' as const, updatedAt: new Date(),
    };
    await db
      .insert(games)
      .values({
        id, ...values, linkMethods: ['code'],
        // Clés factices de développement, comme seed-catalog.ts (jamais en production : assertSeedAllowed).
        webhookSecret: `whsec_demo_real_${under(g.slug)}`, apiKeyHash: hashApiKey(`das_secret_demo_real_${under(g.slug)}`),
        apiKeyPrefix: 'das_secret_demo', publishableKey: `das_pub_demo_real_${under(g.slug)}`,
      })
      .onConflictDoUpdate({ target: games.id, set: values });

    const itemIds: string[] = [];
    for (const [i, it] of g.items.entries()) {
      const itemId = `itm_real_${under(g.slug)}_${it.productId}`.slice(0, 120);
      itemIds.push(itemId);
      const v = {
        position: i, type: it.type, period: it.period ?? 'month', title: it.title, subtitle: '', description: it.description,
        priceCents: it.priceCents, quantity: it.quantity, keywords: [g.category.toLowerCase(), it.source === 'steam-dlc' ? 'dlc' : 'in-app'],
        models: [{ imageUrl: it.imageUrl, label: it.title }], layout: 1 as const, style: styleFor(g, i), active: true, updatedAt: new Date(),
      };
      await db.insert(items).values({ id: itemId, gameId: id, productId: it.productId, ...v }).onConflictDoUpdate({ target: items.id, set: v });
      itemCount++;
    }
    // Articles qui ne figurent plus dans le catalogue : désactivés (une commande de test peut encore les référencer).
    if (itemIds.length) await db.update(items).set({ active: false }).where(and(eq(items.gameId, id), notInArray(items.id, itemIds)));
  }
  const n = (p: 'mobile' | 'pc') => catalog.games.filter((g) => g.platform === p).length;
  console.log(`Vrais tops chargés : ${n('mobile')} jeux mobiles, ${n('pc')} jeux Steam, ${itemCount} articles, ${banners} bannières.`);
  // Vitrine 100 % vrais jeux : les jeux fictifs publiés (seed, catalogue de démo) passent en brouillon (`--keep-fake` pour les garder).
  if (!process.argv.includes('--keep-fake')) {
    const hidden = await db
      .update(games)
      .set({ status: 'draft' })
      .where(and(eq(games.status, 'live'), sql`${games.id} not like ${`${REAL_GAME}%`}`))
      .returning({ id: games.id });
    if (hidden.length) await db.execute(sql`insert into ${HIDDEN_TABLE} (id) values ${sql.join(hidden.map((h) => sql`(${h.id})`), sql`, `)} on conflict do nothing`);
    console.log(`Jeux fictifs masqués (brouillon) : ${hidden.length}. Pour les rétablir : npm run real-tops:seed -- --remove`);
  }
  // Avis, ventes des classements et promos du jour / à venir : générés pour les jeux publiés, donc aussi les vrais.
  const reviews = await seedReviews();
  const ranks = await seedPromosSales();
  console.log(`Avis : ${reviews.reviews} ajoutés ; classements : ${ranks.orders} ventes sur 30 jours ; promos : ${ranks.livePromos} en cours, ${ranks.upcomingPromos} à venir.`);
}

/** Jeux fictifs masqués par ce script : mémorisés pour que `--remove` ne republie que ceux-là. */
const HIDDEN_TABLE = sql.raw('real_tops_hidden_games');
const ensureHiddenTable = () => db.execute(sql`create table if not exists ${HIDDEN_TABLE} (id text primary key)`);

async function restoreFake() {
  await ensureHiddenTable();
  const rows = await db.execute(sql`update games set status = 'live' where status = 'draft' and id in (select id from ${HIDDEN_TABLE}) returning id`);
  await db.execute(sql`delete from ${HIDDEN_TABLE}`);
  console.log(`Jeux fictifs republiés : ${(rows as { rows?: unknown[] }).rows?.length ?? 0}.`);
}

(process.argv.includes('--remove') ? remove().then(restoreFake) : ensureHiddenTable().then(seed)).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
