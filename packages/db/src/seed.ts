/* Données de démo : `npm run db:push && npm run db:seed` (idempotent). */
import { DEFAULT_ITEM_STYLE, hashApiKey, type ItemStyle } from '@wolleen/core';
import { db, games, items, studios, studioMembers, user } from './index';
import * as A from './demo-assets';

/** Clés de développement connues — utilisées par apps/demo-game. Jamais en production. */
export const DEMO_KEYS = {
  crystal: { apiKey: 'wk_test_demo_crystal_clash', webhookSecret: 'whsec_demo_crystal_clash' },
  farm: { apiKey: 'wk_test_demo_pixel_farm', webhookSecret: 'whsec_demo_pixel_farm' },
};

const lavender: ItemStyle = { ...DEFAULT_ITEM_STYLE, bg1: '#eef0ff', bg2: '#9fb0f0', titleColor: '#ffffff', titleOutline: true, titleShadow: true, subtitleColor: '#2d3a6b', priceBg: 'transparent', priceOutline: true, priceShadow: true, borderWidth: 3, borderColor: '#141826' };
const gold: ItemStyle = { ...DEFAULT_ITEM_STYLE, bgType: 'linear', bg1: '#fff4cc', bg2: '#ffd46b', titleColor: '#ffffff', titleBg: '#f59f1c', subtitleColor: '#6b4a00', priceBg: '#5cc31f', priceShadow: true, borderWidth: 0 };
const navy: ItemStyle = { ...DEFAULT_ITEM_STYLE, bg1: '#3b5cc4', bg2: '#101c4a', titleColor: '#ffffff', subtitleColor: '#c7d3ff', priceBg: '#0b1433', borderColor: '#4fa3ff', rounded: false };
const farm: ItemStyle = { ...DEFAULT_ITEM_STYLE, bgType: 'linear', bg1: '#ffffff', bg2: '#e2f7d4', titleColor: '#ffffff', titleBg: '#4caf50', subtitleColor: '#2e5e1f', priceBg: '#f9a825', borderWidth: 0 };

/** Utilisateurs de démo (sans mot de passe : la tâche « auth » ajoute les identifiants). */
export const DEMO_USERS = {
  dev: { id: 'usr_demo_dev', name: 'Développeur Démo', email: 'dev@wolleen.test' },
  player: { id: 'usr_demo_player', name: 'Joueur Démo', email: 'joueur@wolleen.test' },
};

async function main() {
  for (const u of Object.values(DEMO_USERS)) await db.insert(user).values({ ...u, emailVerified: true }).onConflictDoNothing();
  await db.insert(studios).values({ id: 'std_nova', name: 'Nova Games', slug: 'nova-games' }).onConflictDoNothing();

  await db.insert(studioMembers).values({ studioId: 'std_nova', userId: DEMO_USERS.dev.id, role: 'owner' }).onConflictDoNothing();

  const gameRows = [
    {
      id: 'gam_crystal', studioId: 'std_nova', slug: 'crystal-clash', name: 'Crystal Clash', subtitle: 'Batailles PvP épiques en temps réel',
      publisherName: 'Nova Games', category: 'Stratégie', description: 'Construisez votre deck et affrontez des joueurs du monde entier.',
      iconUrl: A.ICON_CRYSTAL, bannerUrl: A.BANNER_CRYSTAL,
      theme: { gradient: { enabled: true, c1: '#026ab3', c2: '#ffffff', style: 'linear' as const }, grid: { width: 205, height: 300, margin: 25 } },
      status: 'live' as const, linkMethods: ['code', 'id_confirm'] as ('code' | 'id_confirm')[],
      playerLookupUrl: 'http://localhost:4100/wolleen/players/{player_id}', webhookUrl: 'http://localhost:4100/wolleen/webhook',
      webhookSecret: DEMO_KEYS.crystal.webhookSecret, apiKeyHash: hashApiKey(DEMO_KEYS.crystal.apiKey), apiKeyPrefix: 'wk_test_demo',
    },
    {
      id: 'gam_farm', studioId: 'std_nova', slug: 'pixel-farm', name: 'Pixel Farm', subtitle: 'Cultivez, récoltez, échangez',
      publisherName: 'Nova Games', category: 'Simulation', description: 'La ferme la plus mignonne du mobile.',
      iconUrl: A.ICON_FARM, bannerUrl: A.BANNER_FARM,
      theme: { gradient: { enabled: true, c1: '#8fd16a', c2: '#ffffff', style: 'radial' as const }, grid: { width: 200, height: 260, margin: 24 } },
      status: 'live' as const, linkMethods: ['code'] as 'code'[],
      webhookSecret: DEMO_KEYS.farm.webhookSecret, apiKeyHash: hashApiKey(DEMO_KEYS.farm.apiKey), apiKeyPrefix: 'wk_test_demo',
    },
  ];
  for (const g of gameRows) await db.insert(games).values(g).onConflictDoNothing();

  const it = (gameId: string, position: number, v: Omit<typeof items.$inferInsert, 'id' | 'gameId' | 'position' | 'style'> & { style?: ItemStyle }) => ({
    id: `itm_${gameId.slice(4)}_${v.productId}`, gameId, position, style: lavender, ...v,
  });
  const rows = [
    it('gam_crystal', 0, { productId: 'gems_1200', title: 'Sac de gemmes', priceCents: 799, oldPriceCents: 1099, quantity: 1200, keywords: ['Gemmes', 'Monnaie'], models: [{ imageUrl: A.ART_GEM_POUCH, label: '1 200 gemmes' }], layout: 4 }),
    it('gam_crystal', 1, { productId: 'gems_6500', title: 'Coffre de gemmes', subtitle: '+15 % offerts', priceCents: 3999, oldPriceCents: 4999, quantity: 6500, keywords: ['Gemmes', 'Monnaie', 'Meilleure offre'], models: [{ imageUrl: A.ART_GEM_CHEST, label: '6 500 gemmes' }], layout: 1 }),
    it('gam_crystal', 2, { productId: 'gold_10000', title: "Pile d'or", subtitle: '10 000 pièces', priceCents: 499, oldPriceCents: 599, quantity: 10000, keywords: ['Or', 'Monnaie'], models: [{ imageUrl: A.ART_GOLD, label: '10 000 or' }], layout: 2, style: gold }),
    it('gam_crystal', 3, { productId: 'pass_royal_monthly', type: 'auto_renewable', title: 'Pass Royal', subtitle: 'Récompenses x2 & coffres exclusifs', priceCents: 499, oldPriceCents: 599, keywords: ['Abonnement'], models: [{ imageUrl: A.ART_PASS, label: 'Pass' }], layout: 3, style: navy }),
    it('gam_crystal', 4, { productId: 'starter_pack', type: 'non_consumable', title: 'Pack débutant', subtitle: 'Une seule fois', priceCents: 299, oldPriceCents: 999, keywords: ['Packs', 'Meilleure offre'], models: [{ imageUrl: A.ART_STARTER, label: 'Pack' }], layout: 6, style: gold }),
    it('gam_farm', 0, { productId: 'seeds_50', title: 'Sachet de graines', subtitle: '50 graines rares', priceCents: 199, quantity: 50, keywords: ['Graines'], models: [{ imageUrl: A.ART_SEEDS, label: 'Graines' }], layout: 2, style: farm }),
    it('gam_farm', 1, { productId: 'coins_10000', title: 'Bourse de pièces', priceCents: 499, oldPriceCents: 699, quantity: 10000, keywords: ['Monnaie'], models: [{ imageUrl: A.ART_GOLD, label: 'Pièces' }], layout: 2, style: farm }),
  ];
  for (const r of rows) await db.insert(items).values(r).onConflictDoNothing();
  console.log(`Seed OK : 1 studio, ${gameRows.length} jeux, ${rows.length} articles`);
  await seedDemoSales();
}

/*
 * Tâche « analytics » : ~90 jours de commandes payées + livraisons pour gam_crystal et gam_farm,
 * achetées par usr_demo_player (player_id #2PP8QL9). Générateur pseudo-aléatoire déterministe ;
 * identifiants fixes + onConflictDoNothing → relancer le seed ne crée pas de doublon.
 */
async function seedDemoSales() {
  const { DEFAULT_PLATFORM_FEE_BPS, feeCents } = await import('@wolleen/core');
  const { deliveries, gameLinks, orders } = await import('./index');
  const PLAYER_ID = '#2PP8QL9';
  const DAYS = 90;

  // mulberry32
  let state = 0x57011ee9;
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(list: { v: T; w: number }[]) => {
    let r = rand() * list.reduce((s, e) => s + e.w, 0);
    for (const e of list) if ((r -= e.w) < 0) return e.v;
    return list[list.length - 1].v;
  };

  for (const gameId of ['gam_crystal', 'gam_farm']) {
    await db
      .insert(gameLinks)
      .values({ id: `lnk_demo_${gameId.slice(4)}`, userId: DEMO_USERS.player.id, gameId, playerId: PLAYER_ID, playerName: 'Joueur Démo', method: 'code', verified: 1 })
      .onConflictDoNothing();
  }

  const catalog = await db.select().from(items);
  const plan = [
    { gameId: 'gam_crystal', perDay: 4, weights: { gems_1200: 5, gems_6500: 1.2, gold_10000: 4, pass_royal_monthly: 1.5, starter_pack: 0.6 } as Record<string, number> },
    { gameId: 'gam_farm', perDay: 2, weights: { seeds_50: 5, coins_10000: 3 } as Record<string, number> },
  ];

  const now = Date.now();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const orderRows: (typeof orders.$inferInsert)[] = [];
  const deliveryRows: (typeof deliveries.$inferInsert)[] = [];

  for (const g of plan) {
    const choices = catalog.filter((i) => i.gameId === g.gameId && g.weights[i.productId]).map((i) => ({ v: i, w: g.weights[i.productId] }));
    for (let back = DAYS - 1; back >= 0; back--) {
      const dayStart = today.getTime() - back * 86_400_000;
      const weekday = new Date(dayStart).getUTCDay();
      const trend = 0.7 + 0.6 * ((DAYS - back) / DAYS); // croissance progressive
      const weekend = weekday === 0 || weekday === 6 ? 1.5 : 1;
      const n = Math.floor(g.perDay * trend * weekend * (0.4 + rand() * 1.2));
      for (let k = 0; k < n; k++) {
        const item = pick(choices);
        const quantity = item.type === 'consumable' && rand() < 0.12 ? 2 : 1;
        const paidAt = new Date(dayStart + Math.floor((0.25 + rand() * 0.74) * 86_400_000));
        const r = rand();
        if (paidAt.getTime() > now) continue;
        const id = `ord_demo_${g.gameId.slice(4)}_${String(back).padStart(2, '0')}_${k}`;
        const amountCents = item.priceCents * quantity;
        const ageH = (now - paidAt.getTime()) / 3_600_000;
        const status = ageH < 0.2 ? 'pending' : r < 0.015 ? 'failed' : ageH < 3 || r < 0.06 ? 'delivered' : 'acknowledged';
        const deliveredAt = status === 'delivered' || status === 'acknowledged' ? new Date(paidAt.getTime() + 2_000) : null;
        orderRows.push({
          id, userId: DEMO_USERS.player.id, gameId: g.gameId, itemId: item.id, productId: item.productId, itemTitle: item.title,
          playerId: PLAYER_ID, quantity, amountCents, platformFeeCents: feeCents(amountCents, DEFAULT_PLATFORM_FEE_BPS),
          currency: 'EUR', status: 'paid', createdAt: new Date(paidAt.getTime() - 45_000), paidAt,
        });
        deliveryRows.push({
          id: `dlv_demo_${id.slice(9)}`, orderId: id, gameId: g.gameId, playerId: PLAYER_ID, status,
          attempts: status === 'failed' ? 8 : 1, lastError: status === 'failed' ? 'HTTP 500 du serveur du jeu' : null,
          deliveredAt, acknowledgedAt: status === 'acknowledged' ? new Date(paidAt.getTime() + 5_000) : null,
          createdAt: paidAt,
          payload: {
            event: 'purchase.completed', delivery_id: `dlv_demo_${id.slice(9)}`, order_id: id, game_id: g.gameId, player_id: PLAYER_ID,
            product_id: item.productId, item_type: item.type, quantity, amount_cents: amountCents, currency: 'EUR', created_at: paidAt.toISOString(),
          },
        });
      }
    }
  }

  for (let i = 0; i < orderRows.length; i += 200) await db.insert(orders).values(orderRows.slice(i, i + 200)).onConflictDoNothing();
  for (let i = 0; i < deliveryRows.length; i += 200) await db.insert(deliveries).values(deliveryRows.slice(i, i + 200)).onConflictDoNothing();
  console.log(`Seed ventes de démo : ${orderRows.length} commandes payées (gam_crystal, gam_farm) pour ${PLAYER_ID}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
