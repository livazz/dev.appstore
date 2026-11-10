/* Données de démo : `npm run db:push && npm run db:seed` (idempotent). */
import { DEFAULT_ITEM_STYLE, SKIN_PALETTES, hashApiKey, type ItemStyle } from '@devappstore/core';
import { hashPassword } from 'better-auth/crypto';
import { account, and, db, eq, games, isNull, items, platformAdmins, studios, studioMembers, user } from './index';
/** Illustration de la bibliothèque de la plateforme (apps/web/public/art/items, cf. apps/web/src/lib/art-library.ts). */
const art = (name: string) => `/art/items/${name}.webp`;
import { seedLoyalty } from './seed-loyalty';
import { seedCatalog } from './seed-catalog';
import { seedReviews } from './seed-reviews';
import { seedPromosSales } from './seed-promos-sales';
import { assertSeedAllowed } from './guards';

/** Clés de développement connues — utilisées par apps/demo-game. Jamais en production. */
export const DEMO_KEYS = {
  // apiKey = clé SECRÈTE au format actuel `das_secret_…` (serveur du studio) ; publishableKey = clé PUBLIQUE `das_pub_…`
  // (SDK embarqué dans le client du jeu).
  crystal: { apiKey: 'das_secret_demo_crystal_clash', publishableKey: 'das_pub_demo_crystal_clash', webhookSecret: 'whsec_demo_crystal_clash' },
  farm: { apiKey: 'das_secret_demo_pixel_farm', publishableKey: 'das_pub_demo_pixel_farm', webhookSecret: 'whsec_demo_pixel_farm' },
};

/** Présentations longues des deux jeux de démo (paragraphes séparés par une ligne vide). */
const STORE_DESCRIPTIONS = {
  gam_crystal:
    "Crystal Clash est un jeu de stratégie en temps réel où chaque partie se joue en trois minutes chrono. Composez un deck de huit cartes parmi plus de cent héros, sorts et bâtiments, puis déployez-les au bon moment pour faire tomber les tours de cristal adverses.\n\nAffrontez des joueurs du monde entier en duel classé, grimpez les arènes saison après saison et rejoignez un clan pour échanger des cartes, préparer des tactiques et participer aux guerres de clans hebdomadaires.\n\nDes événements spéciaux renouvelés chaque semaine (tirage aléatoire, double élixir, défis de héros) gardent le jeu frais. Crystal Clash est gratuit : les gemmes, l’or et le Pass Royal accélèrent votre progression sans jamais bloquer la victoire.",
  gam_farm:
    "Pixel Farm vous confie une petite parcelle en friche à transformer en ferme florissante. Plantez, arrosez et récoltez des dizaines de cultures en pixel art, des carottes classiques aux citrouilles géantes de l’automne.\n\nÉlevez poules, vaches et moutons, fabriquez confitures et fromages dans vos ateliers, puis vendez vos produits au marché du village ou échangez-les avec vos voisins pour décrocher les ingrédients rares.\n\nAu fil des saisons, la météo change, de nouvelles graines apparaissent et des fêtes de village récompensent les plus beaux potagers. Un jeu tranquille, à jouer cinq minutes ou une heure, sans chronomètre ni pression.",
};

/** Anciennes clés secrètes de démo (`das_test_…`) : une base déjà initialisée avec elles passe aux clés actuelles. */
const LEGACY_DEMO_API_KEYS = { crystal: 'das_test_demo_crystal_clash', farm: 'das_test_demo_pixel_farm' } as const;
const DEMO_API_KEY_PREFIX = 'das_secret_demo';

/** Superadmin du back-office /admin (table platform_admins) : le compte de démo développeur. */
export const DEMO_PLATFORM_ADMIN = { email: 'dev@devappstore.test', role: 'superadmin' } as const;

const lavender: ItemStyle = { ...DEFAULT_ITEM_STYLE, bg1: '#eef0ff', bg2: '#9fb0f0', titleColor: '#ffffff', titleOutline: true, titleShadow: true, subtitleColor: '#2d3a6b', priceBg: 'transparent', priceOutline: true, priceShadow: true, borderWidth: 3, borderColor: '#141826' };
/** Palettes des thèmes (Crystal Clash : arcade, Pixel Farm : casual). */
const skinStyle = (skin: keyof typeof SKIN_PALETTES, i: number): ItemStyle => ({ ...DEFAULT_ITEM_STYLE, ...SKIN_PALETTES[skin][i]!.style });
const sky = skinStyle('arcade', 0), epic = skinStyle('arcade', 1), goldA = skinStyle('arcade', 2), ruby = skinStyle('arcade', 3);
const mint = skinStyle('casual', 0), honey = skinStyle('casual', 2);

/** Utilisateurs de démo — mot de passe `DEMO_PASSWORD` (compte Better Auth « credential »). */
export const DEMO_USERS = {
  dev: { id: 'usr_demo_dev', name: 'Développeur Démo', email: 'dev@devappstore.test' },
  player: { id: 'usr_demo_player', name: 'Joueur Démo', email: 'joueur@devappstore.test' },
  /** Administrateur de la plateforme seul (sans studio), pour tester le back-office comme l'équipe Dev AppStore. */
  admin: { id: 'usr_demo_admin', name: 'Admin Démo', email: 'admin@devappstore.test' },
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
  assertSeedAllowed();
  for (const u of Object.values(DEMO_USERS)) await db.insert(user).values({ ...u, emailVerified: true }).onConflictDoNothing();
  await seedDemoCredentials();
  await db.insert(studios).values({ id: 'std_nova', name: 'Nova Games', slug: 'nova-games' }).onConflictDoNothing();

  await db.insert(studioMembers).values({ studioId: 'std_nova', userId: DEMO_USERS.dev.id, role: 'owner' }).onConflictDoNothing();

  const gameRows = [
    {
      id: 'gam_crystal', studioId: 'std_nova', slug: 'crystal-clash', name: 'Crystal Clash', subtitle: 'Batailles PvP épiques en temps réel',
      publisherName: 'Nova Games', category: 'Stratégie', description: 'Construisez votre deck et affrontez des joueurs du monde entier.',
      storeDescription: STORE_DESCRIPTIONS.gam_crystal, screenshots: ['/art/games/crystal-clash/hero.webp'],
      spotlight: {
        kind: 'season' as const, title: 'Saison 12 : la Forge de cristal ouvre ses portes', date: 'Nouvelle saison',
        text: 'Huit nouvelles cartes et une arène inédite. Les classements repartent de zéro : c’est le moment de grimper.',
        productId: 'pass_royal_monthly', angle: 'top' as const, order: 1,
        pitch: 'Le Pass Royal double les récompenses de toute la saison.',
      },
      iconUrl: '/art/games/crystal-clash/icon.webp', bannerUrl: '/art/games/crystal-clash/banner.webp',
      theme: { skin: 'arcade' as const, gradient: { enabled: false, c1: '#026ab3', c2: '#ffffff', style: 'linear' as const }, grid: { width: 205, height: 300, margin: 25 } },
      status: 'live' as const, linkMethods: ['code', 'id_confirm'] as ('code' | 'id_confirm')[],
      playerLookupUrl: 'http://localhost:4100/devappstore/players/{player_id}', webhookUrl: 'http://localhost:4100/devappstore/webhook',
      webhookSecret: DEMO_KEYS.crystal.webhookSecret, apiKeyHash: hashApiKey(DEMO_KEYS.crystal.apiKey), apiKeyPrefix: DEMO_API_KEY_PREFIX,
      publishableKey: DEMO_KEYS.crystal.publishableKey,
    },
    {
      id: 'gam_farm', studioId: 'std_nova', slug: 'pixel-farm', name: 'Pixel Farm', subtitle: 'Cultivez, récoltez, échangez',
      publisherName: 'Nova Games', category: 'Simulation', description: 'La ferme la plus mignonne du mobile.',
      storeDescription: STORE_DESCRIPTIONS.gam_farm, screenshots: [] as string[],
      spotlight: {
        kind: 'update' as const, title: 'La fête des récoltes est ouverte', date: 'Jusqu’à dimanche',
        text: 'Citrouilles géantes, nouveau marché et décorations d’automne à gagner cette semaine.',
        productId: 'seeds_50', angle: 'start' as const, order: 2,
        pitch: 'Des graines rares pour lancer vos cultures de saison.',
      },
      iconUrl: '/art/games/pixel-farm/icon.webp', bannerUrl: '/art/games/pixel-farm/banner.webp',
      theme: { skin: 'casual' as const, gradient: { enabled: false, c1: '#8fd16a', c2: '#ffffff', style: 'radial' as const }, grid: { width: 200, height: 260, margin: 24 } },
      status: 'live' as const, linkMethods: ['code'] as 'code'[],
      webhookSecret: DEMO_KEYS.farm.webhookSecret, apiKeyHash: hashApiKey(DEMO_KEYS.farm.apiKey), apiKeyPrefix: DEMO_API_KEY_PREFIX,
      publishableKey: DEMO_KEYS.farm.publishableKey,
    },
  ];
  for (const g of gameRows) {
    await db.insert(games).values(g).onConflictDoNothing();
    // Base créée avant la migration 0005 : présentation et captures complétées si elles sont encore vides.
    await db
      .update(games)
      .set({ storeDescription: g.storeDescription, screenshots: g.screenshots })
      .where(and(eq(games.id, g.id), eq(games.storeDescription, '')));
    // Base créée avant l'ajout des clés publiques : on les complète sans toucher au reste.
    await db.update(games).set({ publishableKey: g.publishableKey }).where(and(eq(games.id, g.id), isNull(games.publishableKey)));
  }
  // Base créée avec les anciennes clés secrètes `das_test_demo_*` : passage aux clés `das_secret_demo_*` (une clé
  // régénérée depuis l'onglet Intégration n'est pas touchée).
  for (const k of ['crystal', 'farm'] as const) {
    await db
      .update(games)
      .set({ apiKeyHash: hashApiKey(DEMO_KEYS[k].apiKey), apiKeyPrefix: DEMO_API_KEY_PREFIX })
      .where(and(eq(games.id, k === 'crystal' ? 'gam_crystal' : 'gam_farm'), eq(games.apiKeyHash, hashApiKey(LEGACY_DEMO_API_KEYS[k]))));
  }

  const it = (gameId: string, position: number, v: Omit<typeof items.$inferInsert, 'id' | 'gameId' | 'position' | 'style'> & { style?: ItemStyle }) => ({
    id: `itm_${gameId.slice(4)}_${v.productId}`, gameId, position, style: lavender, ...v,
  });
  const rows = [
    it('gam_crystal', 0, { productId: 'gems_1200', description: "1 200 gemmes créditées immédiatement sur votre compte : de quoi ouvrir quelques coffres ou accélérer l’amélioration de vos cartes préférées.", title: 'Sac de gemmes', priceCents: 799, oldPriceCents: 1099, quantity: 1200, keywords: ['Gemmes', 'Monnaie'], models: [{ imageUrl: art('gems-2'), label: '1 200 gemmes' }], layout: 4, style: sky }),
    it('gam_crystal', 1, { productId: 'gems_6500', description: "Le meilleur rapport gemmes/prix de la boutique : 6 500 gemmes, dont 15 % offerts par rapport au sac de gemmes. Idéal pour débloquer une carte légendaire.", title: 'Coffre de gemmes', subtitle: '+15 % offerts', priceCents: 3999, oldPriceCents: 4999, quantity: 6500, keywords: ['Gemmes', 'Monnaie', 'Meilleure offre'], models: [{ imageUrl: art('gems-3'), label: '6 500 gemmes' }], layout: 1, style: epic }),
    it('gam_crystal', 2, { productId: 'gold_10000', description: "10 000 pièces d’or pour améliorer vos cartes et acheter les offres du magasin quotidien. L’or ne se périme pas.", title: "Pile d'or", priceCents: 499, oldPriceCents: 599, quantity: 10000, keywords: ['Or', 'Monnaie'], models: [{ imageUrl: art('gold-2'), label: '10 000 or' }], layout: 2, style: goldA }),
    it('gam_crystal', 3, { productId: 'pass_royal_monthly', description: "Abonnement mensuel : récompenses de saison doublées, accès aux coffres exclusifs du Pass et à un emblème doré. Résiliable à tout moment, sans engagement.", type: 'auto_renewable', title: 'Pass Royal', subtitle: 'Récompenses x2 & coffres exclusifs', priceCents: 499, oldPriceCents: 599, keywords: ['Abonnement'], models: [{ imageUrl: art('pass'), label: 'Pass' }], layout: 3, style: ruby }),
    it('gam_crystal', 4, { productId: 'starter_pack', description: "Offre de bienvenue achetable une seule fois : 500 gemmes, 5 000 or et une carte épique garantie pour bien démarrer vos premières arènes.", type: 'non_consumable', title: 'Pack débutant', subtitle: 'Une seule fois', priceCents: 299, oldPriceCents: 999, keywords: ['Packs', 'Offre unique'], models: [{ imageUrl: art('starter-pack'), label: 'Pack' }], layout: 6, style: goldA }),
    it('gam_farm', 0, { productId: 'seeds_50', description: "50 graines rares tirées au hasard parmi les cultures de saison (fraises dorées, citrouilles géantes, tournesols arc-en-ciel), qui rapportent davantage au marché.", title: 'Sachet de graines', subtitle: '50 graines rares', priceCents: 199, quantity: 50, keywords: ['Graines'], models: [{ imageUrl: art('farm-seeds'), label: 'Graines' }], layout: 2, style: mint }),
    it('gam_farm', 1, { productId: 'coins_10000', description: "10 000 pièces pour agrandir votre ferme, acheter des animaux ou débloquer de nouveaux ateliers sans attendre la prochaine récolte.", title: 'Bourse de pièces', priceCents: 499, oldPriceCents: 699, quantity: 10000, keywords: ['Monnaie'], models: [{ imageUrl: art('farm-coins'), label: 'Pièces' }], layout: 2, style: honey }),
  ];
  for (const r of rows) {
    await db.insert(items).values(r).onConflictDoNothing();
    // Base antérieure à la migration 0005 : description complétée si elle est encore vide.
    await db.update(items).set({ description: r.description }).where(and(eq(items.id, r.id), eq(items.description, '')));
  }
  console.log(`Seed OK : 1 studio, ${gameRows.length} jeux, ${rows.length} articles — comptes de démo : ${Object.values(DEMO_USERS).map((u) => u.email).join(', ')} / ${DEMO_PASSWORD}`);
  await seedDemoSales();
  const catalog = await seedCatalog();
  console.log(`Seed catalogue : ${catalog.studios} studios, ${catalog.games} jeux, ${catalog.items} articles (packages/db/src/catalog-data.ts)`);
  const reviews = await seedReviews();
  console.log(`Seed avis : ${reviews.reviews} avis ajoutés sur ${reviews.games} jeux en ligne (packages/db/src/seed-reviews.ts)`);
  const ranks = await seedPromosSales(); console.log(`Seed classements et promos : ${ranks.orders} ventes sur 30 jours (${ranks.games} jeux), ${ranks.livePromos} promos en cours, ${ranks.upcomingPromos} à venir`);
  // Points Dev AppStore : récompenses de démo + points des commandes payées du joueur de démo (idempotent).
  const loyalty = await seedLoyalty(DEMO_USERS.player.id);
  console.log(`Seed Points Dev AppStore : ${loyalty.rewards} récompenses, ${loyalty.awards} attributions ajoutées (${loyalty.points} points au total)`);
  // Back-office /admin : dev@devappstore.test superadmin de la plateforme (idempotent ; un rôle modifié depuis est conservé).
  await db.insert(platformAdmins).values({ userId: DEMO_USERS.dev.id, role: DEMO_PLATFORM_ADMIN.role }).onConflictDoNothing();
  await db.insert(platformAdmins).values({ userId: DEMO_USERS.admin.id, role: 'superadmin' }).onConflictDoNothing();
  console.log(`Seed administration : ${DEMO_PLATFORM_ADMIN.email} est ${DEMO_PLATFORM_ADMIN.role} de Dev AppStore — back-office sur /admin`);
}

/*
 * Tâche « analytics » : ~90 jours de commandes payées + livraisons pour gam_crystal et gam_farm,
 * achetées par usr_demo_player (player_id #2PP8QL9). Générateur pseudo-aléatoire déterministe ;
 * identifiants fixes + onConflictDoNothing → relancer le seed ne crée pas de doublon.
 */
async function seedDemoSales() {
  const { DEFAULT_PLATFORM_FEE_BPS, feeCents } = await import('@devappstore/core');
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
        // Aujourd'hui : achats répartis jusqu'à maintenant (dont quelques livraisons encore en cours).
        const span = Math.min(86_400_000, now - dayStart);
        let paidAt = new Date(dayStart + Math.floor((back === 0 ? 0.3 + rand() * 0.7 : 0.25 + rand() * 0.74) * span));
        if (back === 0 && k === 0) paidAt = new Date(now - 10 * 60_000); // une livraison en cours
        const r = rand();
        const id = `ord_demo_${g.gameId.slice(4)}_${String(back).padStart(2, '0')}_${k}`;
        const amountCents = item.priceCents * quantity;
        const ageH = (now - paidAt.getTime()) / 3_600_000;
        const status = ageH < 1 ? 'pending' : r < 0.015 ? 'failed' : ageH < 4 || r < 0.06 ? 'delivered' : 'acknowledged';
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
