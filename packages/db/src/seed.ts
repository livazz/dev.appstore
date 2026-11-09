/* Données de démo : `npm run db:push && npm run db:seed` (idempotent). */
import { DEFAULT_ITEM_STYLE, hashApiKey, type ItemStyle } from '@wolleen/core';
import { hashPassword } from 'better-auth/crypto';
import { account, and, db, eq, games, items, studios, studioMembers, user } from './index';
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

/** Utilisateurs de démo — mot de passe `DEMO_PASSWORD` (compte Better Auth « credential »). */
export const DEMO_USERS = {
  dev: { id: 'usr_demo_dev', name: 'Développeur Démo', email: 'dev@wolleen.test' },
  player: { id: 'usr_demo_player', name: 'Joueur Démo', email: 'joueur@wolleen.test' },
};

/** Mot de passe des comptes de démo. Jamais en production. */
export const DEMO_PASSWORD = 'demo1234';

/**
 * Donne aux utilisateurs de démo un identifiant e-mail + mot de passe Better Auth (ligne `account` provider « credential »,
 * mot de passe haché par Better Auth). Idempotent : un compte credential existant n'est pas modifié.
 */
async function seedDemoCredentials() {
  for (const u of Object.values(DEMO_USERS)) {
    const existing = await db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, u.id), eq(account.providerId, 'credential')))
      .limit(1);
    if (existing.length) continue;
    await db
      .insert(account)
      .values({ id: `acc_${u.id.slice(4)}_credential`, accountId: u.id, providerId: 'credential', userId: u.id, password: await hashPassword(DEMO_PASSWORD) })
      .onConflictDoNothing();
  }
}

async function main() {
  for (const u of Object.values(DEMO_USERS)) await db.insert(user).values({ ...u, emailVerified: true }).onConflictDoNothing();
  await seedDemoCredentials();
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
  console.log(`Seed OK : 1 studio, ${gameRows.length} jeux, ${rows.length} articles — comptes de démo : ${Object.values(DEMO_USERS).map((u) => u.email).join(', ')} / ${DEMO_PASSWORD}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
