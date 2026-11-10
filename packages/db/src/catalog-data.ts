/*
 * Catalogue de faux jeux de démonstration (en plus de Crystal Clash et Pixel Farm) : studios, jeux, thèmes de boutique
 * et articles. Données pures, utilisées par le seed (seed-catalog.ts), par scripts/placeholder-art.ts (visuels
 * provisoires) et par scripts/catalog-prompts.ts (liste des illustrations à générer, docs/design/prompts-catalogue.md).
 *
 * Images :
 * - icône et bannière : /art/games/<slug>/icon.webp et banner.webp (provisoires générées, à remplacer) ;
 * - articles : visuel propre au jeu /art/games/<slug>/<own>.webp s'il existe, sinon l'objet de la bibliothèque `art`.
 */
import type { StoreSkin } from '@devappstore/core';

export type CatalogStudio = { id: string; name: string; slug: string };

export type CatalogItem = {
  productId: string;
  title: string;
  subtitle?: string;
  price: number;
  old?: number;
  qty?: number;
  keywords: string[];
  /** Objet de la bibliothèque (apps/web/public/art/items/<art>.webp), utilisé tant que le visuel propre manque. */
  art: string;
  /** Visuel propre au jeu à générer : fichier /art/games/<slug>/<name>.webp + description (anglais) pour le prompt. */
  own?: { name: string; prompt: string };
  type?: 'consumable' | 'non_consumable' | 'auto_renewable';
  layout?: number;
};

export type CatalogGame = {
  slug: string;
  name: string;
  subtitle: string;
  category: string;
  studio: string;
  skin: StoreSkin;
  /** Couleurs d'identité : fond de boutique (dégradé) et fonds des cartes [clair, foncé]. */
  colors: { c1: string; c2: string; cards: [string, string][] };
  gradient?: 'linear' | 'radial';
  description: string;
  /** Descriptions (anglais) pour les prompts de l'icône et de l'emblème de bannière. */
  iconPrompt: string;
  bannerPrompt: string;
  /** Objet de la bibliothèque affiché dans l'icône provisoire. */
  iconArt: string;
  cardWidth?: number;
  items: CatalogItem[];
};

export const CATALOG_STUDIOS: CatalogStudio[] = [
  { id: 'std_lumen', name: 'Lumen Forge', slug: 'lumen-forge' },
  { id: 'std_owl', name: 'Pixel Owl', slug: 'pixel-owl' },
  { id: 'std_kraken', name: 'Kraken Studio', slug: 'kraken-studio' },
  { id: 'std_brume', name: 'Atelier Brume', slug: 'atelier-brume' },
  { id: 'std_comet', name: 'Red Comet', slug: 'red-comet' },
  { id: 'std_moon', name: 'Moonberry', slug: 'moonberry' },
  { id: 'std_polar', name: 'Polar Bits', slug: 'polar-bits' },
];

const own = (name: string, prompt: string) => ({ name, prompt });

export const CATALOG_GAMES: CatalogGame[] = [
  // ——— Arcade : gros objets 3D, contours épais ———
  {
    slug: 'neon-drift', name: 'Neon Drift', subtitle: 'Courses de rue sous les néons', category: 'Course', studio: 'std_comet', skin: 'arcade',
    colors: { c1: '#ff2e88', c2: '#2a0a4a', cards: [['#ff8ad0', '#7a1fd6'], ['#62f0ff', '#1d3fd6'], ['#ffe066', '#ff6a00']] }, gradient: 'linear',
    description: 'Drifts, nitro et courses nocturnes dans une ville rétro-futuriste.', iconArt: 'speed-up',
    iconPrompt: 'a sleek neon pink sports car drifting with motion trails, synthwave city at night behind',
    bannerPrompt: 'game logo emblem, a chrome steering wheel with pink and cyan neon wings, sparks',
    items: [
      { productId: 'nitro_10', title: 'Pack nitro', qty: 10, price: 199, keywords: ['Boosts'], art: 'booster-x2', own: own('nitro', 'a glowing blue nitro bottle canister with flames') },
      { productId: 'cash_50k', title: 'Liasse de crédits', qty: 50000, price: 499, old: 699, keywords: ['Crédits', 'Populaire'], art: 'gold-3', own: own('credits', 'a thick stack of neon pink holographic banknotes') },
      { productId: 'car_viper', title: 'Voiture Viper', subtitle: 'Exclusive', price: 999, keywords: ['Voitures', 'Exclusif'], type: 'non_consumable', layout: 3, art: 'skin', own: own('car-viper', 'a neon purple futuristic sports car, three-quarter view') },
      { productId: 'vip_month', title: 'Pass Pilote', subtitle: 'Récompenses ×2 pendant 30 jours', price: 499, keywords: ['Abonnement'], type: 'auto_renewable', art: 'season-pass' },
    ],
  },
  {
    slug: 'titan-arena', name: 'Titan Arena', subtitle: '100 joueurs, un seul titan', category: 'Battle royale', studio: 'std_kraken', skin: 'arcade',
    colors: { c1: '#ff7a1a', c2: '#3b1200', cards: [['#ffd36b', '#f06400'], ['#8be0ff', '#2a5be0'], ['#ff8a8a', '#a3122a']] },
    description: 'Parachutez-vous sur l’île, équipez votre titan et soyez le dernier debout.', iconArt: 'shield',
    iconPrompt: 'a giant armored titan robot raising its fist on a floating island, epic sky',
    bannerPrompt: 'game logo emblem, a cracked bronze helmet of a titan with orange energy glowing from the cracks',
    items: [
      { productId: 'bucks_1000', title: 'Titan Bucks', qty: 1000, price: 799, old: 999, keywords: ['Monnaie', 'Meilleure offre'], art: 'tokens', own: own('bucks', 'a pile of orange hexagonal energy coins with a titan symbol') },
      { productId: 'bucks_2800', title: 'Caisse de Titan Bucks', qty: 2800, price: 1999, old: 2499, keywords: ['Monnaie'], art: 'crystals-3' },
      { productId: 'skin_inferno', title: 'Skin Inferno', price: 1499, keywords: ['Skins', 'Nouveau'], type: 'non_consumable', layout: 6, art: 'skin', own: own('skin-inferno', 'a lava armored titan warrior figurine with flaming shoulders') },
      { productId: 'battle_pass', title: 'Pass de combat', subtitle: 'Saison 7', price: 899, keywords: ['Passes'], type: 'non_consumable', art: 'season-pass' },
      { productId: 'emote_dance', title: 'Emote Victoire', price: 299, keywords: ['Skins'], type: 'non_consumable', art: 'emote' },
    ],
  },
  {
    slug: 'dragon-siege', name: 'Dragon Siege', subtitle: 'Défendez le royaume', category: 'Stratégie', studio: 'std_lumen', skin: 'arcade',
    colors: { c1: '#3a9c3a', c2: '#0d2b12', cards: [['#b6ff8a', '#1f8a2a'], ['#ffd36b', '#d97a00'], ['#c79bff', '#5a1fb0']] }, gradient: 'radial',
    description: 'Bâtissez des tours, élevez des dragons et repoussez les sièges ennemis.', iconArt: 'chest-legendary',
    iconPrompt: 'a fierce green dragon head breathing fire over a stone castle tower',
    bannerPrompt: 'game logo emblem, a stone castle shield with a coiled green dragon around it, flames',
    items: [
      { productId: 'gems_500', title: 'Gemmes de dragon', qty: 500, price: 499, keywords: ['Gemmes'], art: 'gems-2', own: own('dragon-gems', 'a few glowing red dragon eye gemstones in a small pile') },
      { productId: 'egg_rare', title: 'Œuf de dragon rare', price: 999, old: 1499, keywords: ['Œufs', 'Populaire'], art: 'chest-rare', own: own('dragon-egg', 'a large spotted blue and gold dragon egg with cracks of light') },
      { productId: 'egg_legend', title: 'Œuf légendaire', price: 2999, keywords: ['Œufs', 'Exclusif'], layout: 3, art: 'chest-legendary', own: own('dragon-egg-legend', 'a golden glowing legendary dragon egg with orange runes, sparkles') },
      { productId: 'builder', title: 'Bâtisseur supplémentaire', price: 1499, keywords: ['Packs'], type: 'non_consumable', art: 'key' },
    ],
  },
  {
    slug: 'sky-pirates', name: 'Sky Pirates', subtitle: 'Pillez les îles volantes', category: 'Aventure', studio: 'std_kraken', skin: 'arcade',
    colors: { c1: '#1fb6ff', c2: '#0a2e5c', cards: [['#8ae6ff', '#1f6fd6'], ['#ffe08a', '#e08a00'], ['#ffb08a', '#c2410c']] }, gradient: 'linear',
    description: 'Commandez votre dirigeable, recrutez un équipage et partez à l’abordage des nuages.', iconArt: 'gold-4',
    iconPrompt: 'a flying pirate airship with big balloon and skull flag among clouds',
    bannerPrompt: 'game logo emblem, a ship steering wheel with propellers and a pirate skull, clouds',
    items: [
      { productId: 'doubloons', title: 'Doublons', qty: 2500, price: 299, keywords: ['Trésor'], art: 'gold-1', own: own('doubloons', 'a handful of old gold pirate doubloons with skull engraving') },
      { productId: 'treasure', title: 'Coffre de pirate', price: 1499, old: 1999, keywords: ['Trésor', 'Meilleure offre'], layout: 3, art: 'gold-4' },
      { productId: 'map', title: 'Carte au trésor', price: 199, keywords: ['Objets'], art: 'subscription-scroll', own: own('treasure-map', 'a rolled parchment treasure map with a red X and a compass') },
      { productId: 'crew', title: 'Équipage d’élite', price: 799, keywords: ['Objets'], type: 'non_consumable', art: 'crown-silver' },
    ],
  },
  {
    slug: 'robo-rumble', name: 'Robo Rumble', subtitle: 'Combats de robots en arène', category: 'Action', studio: 'std_comet', skin: 'arcade',
    colors: { c1: '#9aa4b8', c2: '#1b2030', cards: [['#c7d2fe', '#3730a3'], ['#a7f3d0', '#047857'], ['#fecaca', '#b91c1c']] },
    description: 'Assemblez votre robot pièce par pièce et dominez l’arène.', iconArt: 'energy',
    iconPrompt: 'a chunky cartoon fighting robot with big fists and a glowing visor',
    bannerPrompt: 'game logo emblem, two crossed robotic arms with bolts and electric sparks behind a gear',
    items: [
      { productId: 'bolts', title: 'Boulons', qty: 5000, price: 499, keywords: ['Pièces'], art: 'silver', own: own('bolts', 'a pile of shiny steel bolts and nuts') },
      { productId: 'core', title: 'Noyau énergétique', price: 999, keywords: ['Pièces', 'Populaire'], art: 'energy', own: own('energy-core', 'a glowing cyan reactor energy core in a metal frame') },
      { productId: 'arm_laser', title: 'Bras laser', price: 1299, old: 1799, keywords: ['Armes'], layout: 6, art: 'skin', own: own('laser-arm', 'a robotic arm cannon with a glowing red laser tip') },
    ],
  },
  {
    slug: 'goal-rush', name: 'Goal Rush', subtitle: 'Football arcade 3 contre 3', category: 'Sport', studio: 'std_polar', skin: 'arcade',
    colors: { c1: '#22c55e', c2: '#064e1f', cards: [['#bbf7d0', '#15803d'], ['#fde68a', '#ca8a04'], ['#bfdbfe', '#1d4ed8']] }, gradient: 'radial',
    description: 'Matchs express, gestes techniques et ligues mondiales.', iconArt: 'trophy',
    iconPrompt: 'a cartoon soccer ball on fire smashing into a goal net',
    bannerPrompt: 'game logo emblem, a golden soccer ball with wings on a green shield',
    items: [
      { productId: 'coins_20k', title: 'Pièces Rush', qty: 20000, price: 499, keywords: ['Monnaie'], art: 'gold-2' },
      { productId: 'pack_pro', title: 'Pack Joueurs Pro', price: 999, old: 1299, keywords: ['Packs', 'Populaire'], art: 'card-pack', own: own('player-pack', 'a shiny foil card pack with a soccer ball emblem') },
      { productId: 'ball_gold', title: 'Ballon doré', price: 399, keywords: ['Cosmétiques'], type: 'non_consumable', art: 'trophy', own: own('golden-ball', 'a golden soccer ball with sparkles') },
      { productId: 'season', title: 'Pass Saison', price: 799, keywords: ['Passes'], type: 'non_consumable', art: 'ticket' },
    ],
  },
  {
    slug: 'monster-tamer', name: 'Monster Tamer', subtitle: 'Capturez-les, entraînez-les', category: 'RPG', studio: 'std_moon', skin: 'arcade',
    colors: { c1: '#a855f7', c2: '#2e1065', cards: [['#e9d5ff', '#7e22ce'], ['#fde68a', '#d97706'], ['#99f6e4', '#0f766e']] }, gradient: 'linear',
    description: 'Explorez un monde peuplé de créatures et formez l’équipe ultime.', iconArt: 'elixir',
    iconPrompt: 'a cute round purple monster with big eyes and tiny horns waving',
    bannerPrompt: 'game logo emblem, a capture orb with a cute monster silhouette inside, stars around',
    items: [
      { productId: 'orbs_10', title: 'Orbes de capture', qty: 10, price: 299, keywords: ['Capture'], art: 'crystals-1', own: own('capture-orb', 'three glowing red and white capture orbs') },
      { productId: 'candy', title: 'Bonbons d’XP', qty: 50, price: 199, keywords: ['Entraînement'], art: 'xp-boost', own: own('xp-candy', 'a jar of colorful glowing candies') },
      { productId: 'incubator', title: 'Incubateur', price: 999, keywords: ['Capture', 'Meilleure offre'], art: 'chest-mystery' },
      { productId: 'starter', title: 'Pack du dresseur', price: 299, old: 899, keywords: ['Packs', 'Offre unique'], type: 'non_consumable', layout: 3, art: 'starter-pack' },
    ],
  },
  {
    slug: 'arcane-duel', name: 'Duel d’Arcanes', subtitle: 'Jeu de cartes magique', category: 'Cartes', studio: 'std_lumen', skin: 'arcade',
    colors: { c1: '#3b82f6', c2: '#1e1b4b', cards: [['#c7d2fe', '#4338ca'], ['#fbcfe8', '#be185d'], ['#fde68a', '#b45309']] },
    description: 'Construisez votre deck de sorts et affrontez des mages du monde entier.', iconArt: 'card-pack',
    iconPrompt: 'a wizard hand holding three glowing magic cards fanned out',
    bannerPrompt: 'game logo emblem, a spell book with a glowing blue rune and floating cards',
    items: [
      { productId: 'pack_5', title: 'Paquet de cartes', qty: 5, price: 199, keywords: ['Cartes'], art: 'card-pack' },
      { productId: 'pack_50', title: 'Coffret de 50 cartes', qty: 50, price: 1499, old: 1999, keywords: ['Cartes', 'Meilleure offre'], layout: 3, art: 'chest-epic', own: own('card-box', 'an ornate wooden box overflowing with glowing magic cards') },
      { productId: 'dust', title: 'Poussière arcanique', qty: 1000, price: 499, keywords: ['Monnaie'], art: 'stars', own: own('arcane-dust', 'a glass vial filled with glowing blue sparkling magic dust') },
    ],
  },

  // ——— Premium sombre : luxe, or, fantasy ———
  {
    slug: 'shadow-blade', name: 'Shadow Blade', subtitle: 'La voie du ninja', category: 'Action', studio: 'std_kraken', skin: 'premium',
    colors: { c1: '#1f1f2e', c2: '#000000', cards: [['#ff5a5a', '#15121f'], ['#8b5cf6', '#15121f'], ['#f5c451', '#15121f']] },
    description: 'Infiltration, katanas et combos dévastateurs dans un Japon mythique.', iconArt: 'key',
    iconPrompt: 'a hooded ninja silhouette with a glowing red katana under a full moon',
    bannerPrompt: 'game logo emblem, two crossed katanas with red cherry blossom petals and a crescent moon',
    items: [
      { productId: 'jade_300', title: 'Jade', qty: 300, price: 299, keywords: ['Jade'], art: 'gems-1', own: own('jade', 'polished green jade stones carved with kanji-like patterns') },
      { productId: 'jade_1600', title: 'Coffret de jade', qty: 1600, price: 1499, old: 1999, keywords: ['Jade', 'Meilleure offre'], art: 'gems-3' },
      { productId: 'katana', title: 'Katana écarlate', price: 1999, keywords: ['Armes', 'Exclusif'], type: 'non_consumable', layout: 3, art: 'skin', own: own('katana', 'an ornate katana with a crimson glowing blade and gold guard') },
      { productId: 'shuriken', title: 'Shurikens', qty: 20, price: 199, keywords: ['Armes'], art: 'stars', own: own('shuriken', 'three steel shuriken throwing stars') },
    ],
  },
  {
    slug: 'empire-of-sands', name: 'Empire des Sables', subtitle: 'Bâtissez une dynastie', category: 'Stratégie', studio: 'std_brume', skin: 'premium',
    colors: { c1: '#3d2a12', c2: '#0f0a04', cards: [['#ffc85a', '#15121f'], ['#50dca0', '#15121f'], ['#ff7896', '#15121f']] }, gradient: 'radial',
    description: 'Pyramides, caravanes et alliances dans un désert antique.', iconArt: 'crown-silver',
    iconPrompt: 'a golden pharaoh mask in front of pyramids at sunset',
    bannerPrompt: 'game logo emblem, a golden scarab with spread wings over a sun disc',
    items: [
      { productId: 'gold_bars', title: 'Lingots d’or', qty: 100, price: 999, keywords: ['Trésor'], art: 'gold-4', own: own('gold-bars', 'a stack of ancient gold bars engraved with hieroglyphs') },
      { productId: 'scarab', title: 'Scarabée sacré', price: 499, keywords: ['Reliques', 'Populaire'], art: 'vip', own: own('scarab', 'a jeweled golden scarab amulet with turquoise inlays') },
      { productId: 'dynasty', title: 'Pass Dynastie', subtitle: 'Bonus de production permanent', price: 999, keywords: ['Abonnement'], type: 'auto_renewable', layout: 6, art: 'subscription-scroll' },
    ],
  },
  {
    slug: 'eldoria', name: 'Légendes d’Eldoria', subtitle: 'RPG épique au tour par tour', category: 'RPG', studio: 'std_lumen', skin: 'premium',
    colors: { c1: '#1d1438', c2: '#05030c', cards: [['#aa6eff', '#15121f'], ['#50dca0', '#15121f'], ['#ffc85a', '#15121f']] },
    description: 'Invoquez des héros légendaires et percez les secrets d’Eldoria.', iconArt: 'elixir',
    iconPrompt: 'an elegant elf mage with a glowing staff in a dark enchanted forest',
    bannerPrompt: 'game logo emblem, an ornate silver crest with a glowing violet crystal and laurel wings',
    items: [
      { productId: 'summon_1', title: 'Parchemin d’invocation', price: 299, keywords: ['Invocation'], art: 'subscription-scroll', own: own('summon-scroll', 'a glowing violet magic summoning scroll with a wax seal') },
      { productId: 'summon_10', title: '10 invocations', subtitle: '1 héros 5★ garanti', price: 2499, old: 2999, keywords: ['Invocation', 'Meilleure offre'], layout: 3, art: 'chest-epic' },
      { productId: 'mana', title: 'Cristaux de mana', qty: 980, price: 999, keywords: ['Cristaux'], art: 'crystals-2' },
      { productId: 'monthly', title: 'Bénédiction mensuelle', price: 499, keywords: ['Abonnement'], type: 'auto_renewable', art: 'pass' },
    ],
  },
  {
    slug: 'royal-poker', name: 'Royal Poker', subtitle: 'Le casino des rois', category: 'Cartes', studio: 'std_polar', skin: 'premium',
    colors: { c1: '#0b3b2e', c2: '#020c09', cards: [['#50dca0', '#15121f'], ['#ffc85a', '#15121f'], ['#ff7896', '#15121f']] }, gradient: 'radial',
    description: 'Tournois de poker, tables privées et jetons sans mise réelle.', iconArt: 'tokens',
    iconPrompt: 'a royal flush of playing cards fanned over a green felt table with gold chips',
    bannerPrompt: 'game logo emblem, a golden crown resting on an ace of spades card',
    items: [
      { productId: 'chips_1m', title: '1 million de jetons', qty: 1000000, price: 499, keywords: ['Jetons'], art: 'tokens', own: own('poker-chips', 'stacks of luxury black and gold casino chips') },
      { productId: 'chips_10m', title: 'Valise de jetons', qty: 10000000, price: 2999, old: 3999, keywords: ['Jetons', 'Meilleure offre'], layout: 3, art: 'gold-4', own: own('chip-case', 'an open aluminium briefcase full of casino chips') },
      { productId: 'vip', title: 'Club VIP', price: 999, keywords: ['Abonnement'], type: 'auto_renewable', art: 'vip' },
    ],
  },
  {
    slug: 'mythic-kingdoms', name: 'Royaumes Mythiques', subtitle: 'Guerre de clans', category: 'Stratégie', studio: 'std_kraken', skin: 'premium',
    colors: { c1: '#2b0f12', c2: '#0a0304', cards: [['#ff7896', '#15121f'], ['#ffc85a', '#15121f'], ['#aa6eff', '#15121f']] },
    description: 'Unissez les clans, forgez des alliances et conquérez le continent.', iconArt: 'shield',
    iconPrompt: 'an armored warrior queen with a war banner on a burning battlefield',
    bannerPrompt: 'game logo emblem, a dark iron crown with red gems on crossed battle axes',
    items: [
      { productId: 'gold_crowns', title: 'Couronnes d’or', qty: 1200, price: 999, keywords: ['Monnaie'], art: 'gold-3' },
      { productId: 'shield_24h', title: 'Bouclier de paix', subtitle: '24 heures', price: 299, keywords: ['Boosts'], art: 'shield' },
      { productId: 'warlord', title: 'Pack Seigneur de guerre', price: 4999, old: 7999, keywords: ['Packs', 'Exclusif'], layout: 6, art: 'mega-bundle', own: own('warlord-pack', 'a war chest with a horned helmet, an axe and gold coins') },
    ],
  },
  {
    slug: 'crimson-night', name: 'Nuit Écarlate', subtitle: 'Vampires et intrigues', category: 'Aventure', studio: 'std_brume', skin: 'premium',
    colors: { c1: '#3a0614', c2: '#050002', cards: [['#ff7896', '#15121f'], ['#aa6eff', '#15121f'], ['#ffc85a', '#15121f']] }, gradient: 'linear',
    description: 'Un récit interactif gothique où chaque choix compte.', iconArt: 'lives',
    iconPrompt: 'an elegant vampire countess with a red rose in a gothic castle window',
    bannerPrompt: 'game logo emblem, a blood red rose wrapped around an ornate silver dagger, bat wings',
    items: [
      { productId: 'roses_20', title: 'Roses de sang', qty: 20, price: 299, keywords: ['Roses'], art: 'lives', own: own('blood-rose', 'a single glowing crimson rose with thorns') },
      { productId: 'roses_120', title: 'Bouquet écarlate', qty: 120, price: 1499, old: 1799, keywords: ['Roses', 'Populaire'], art: 'gift-big', own: own('rose-bouquet', 'a dark bouquet of crimson roses tied with black ribbon') },
      { productId: 'chapter', title: 'Chapitre secret', price: 499, keywords: ['Histoire'], type: 'non_consumable', art: 'key' },
    ],
  },

  // ——— Casual doux : pastel, mignon ———
  {
    slug: 'bubble-bay', name: 'Bubble Bay', subtitle: 'Bulles et trésors marins', category: 'Puzzle', studio: 'std_moon', skin: 'casual',
    colors: { c1: '#9be7ff', c2: '#ffffff', cards: [['#d4f4ff', '#8fd8ff'], ['#ffe0ea', '#ffa6c1'], ['#fff2c2', '#ffd36b']] }, gradient: 'linear',
    description: 'Visez, éclatez les bulles et sauvez les petits poissons de la baie.', iconArt: 'gems-1',
    iconPrompt: 'a cute smiling blue fish blowing colorful bubbles underwater',
    bannerPrompt: 'game logo emblem, a cluster of shiny colorful bubbles with a cute starfish, seashells',
    items: [
      { productId: 'pearls_100', title: 'Perles', qty: 100, price: 199, keywords: ['Perles'], art: 'gems-1', own: own('pearls', 'a pile of shiny pink and white pearls in an open seashell') },
      { productId: 'lives_inf', title: 'Vies illimitées', subtitle: '2 heures', price: 299, keywords: ['Boosts'], art: 'lives' },
      { productId: 'booster_box', title: 'Boîte de boosters', price: 699, old: 999, keywords: ['Boosts', 'Meilleure offre'], art: 'gift-small' },
    ],
  },
  {
    slug: 'pastry-pop', name: 'Pâtisserie Pop', subtitle: 'Associez les gourmandises', category: 'Puzzle', studio: 'std_moon', skin: 'casual',
    colors: { c1: '#ffc6dd', c2: '#fff7fb', cards: [['#ffe0ea', '#ffa6c1'], ['#fff2c2', '#ffd36b'], ['#eadcff', '#c3a6ff']] }, gradient: 'radial',
    description: 'Macarons, cupcakes et éclairs : alignez-les pour ouvrir la pâtisserie de vos rêves.', iconArt: 'gift-small',
    iconPrompt: 'a cute smiling pink cupcake with sprinkles and a cherry',
    bannerPrompt: 'game logo emblem, a tower of pastel macarons with a cherry on top, sprinkles',
    items: [
      { productId: 'sugar_500', title: 'Morceaux de sucre', qty: 500, price: 299, keywords: ['Sucre'], art: 'crystals-1', own: own('sugar-cubes', 'a pile of sparkling sugar cubes') },
      { productId: 'cake_box', title: 'Boîte à gâteaux', price: 799, keywords: ['Packs', 'Populaire'], art: 'gift-big', own: own('cake-box', 'a pastel pink pastry box with a bow, macarons peeking out') },
      { productId: 'rolling_pin', title: 'Rouleau magique', price: 199, keywords: ['Boosts'], art: 'speed-up', own: own('rolling-pin', 'a magic wooden rolling pin with sparkles') },
    ],
  },
  {
    slug: 'cozy-cats', name: 'Cozy Cats', subtitle: 'Votre café à chats', category: 'Simulation', studio: 'std_owl', skin: 'casual',
    colors: { c1: '#ffd9b3', c2: '#fffaf3', cards: [['#fff2c2', '#ffd36b'], ['#ffe0ea', '#ffa6c1'], ['#c8f7dc', '#8fe3b3']] },
    description: 'Décorez votre café, adoptez des chats et servez des lattes moelleux.', iconArt: 'daily-gift',
    iconPrompt: 'a cute fluffy orange cat sleeping in a coffee cup',
    bannerPrompt: 'game logo emblem, a cute cat face peeking over a latte cup with heart foam art',
    items: [
      { productId: 'fish_200', title: 'Friandises au poisson', qty: 200, price: 199, keywords: ['Friandises'], art: 'farm-coins', own: own('fish-treats', 'a small bag of fish-shaped cat treats') },
      { productId: 'cat_rare', title: 'Chat calico rare', price: 499, keywords: ['Chats', 'Nouveau'], type: 'non_consumable', art: 'gift-small', own: own('calico-cat', 'a cute calico kitten sitting with a bow') },
      { productId: 'decor', title: 'Pack déco cosy', price: 899, old: 1199, keywords: ['Décor'], layout: 3, art: 'bundle', own: own('cozy-decor', 'a cozy armchair with a knitted blanket and a potted plant') },
    ],
  },
  {
    slug: 'garden-match', name: 'Jardin Match', subtitle: 'Fleurs et puzzles', category: 'Puzzle', studio: 'std_owl', skin: 'casual',
    colors: { c1: '#b8f2c2', c2: '#f5fff7', cards: [['#c8f7dc', '#8fe3b3'], ['#ffe0ea', '#ffa6c1'], ['#eadcff', '#c3a6ff']] }, gradient: 'linear',
    description: 'Faites pousser un jardin enchanté niveau après niveau.', iconArt: 'farm-seeds',
    iconPrompt: 'a cute smiling sunflower in a terracotta pot with a ladybug',
    bannerPrompt: 'game logo emblem, a wreath of pastel flowers with a watering can and butterflies',
    items: [
      { productId: 'petals', title: 'Pétales', qty: 300, price: 299, keywords: ['Pétales'], art: 'stars', own: own('petals', 'a swirl of pink flower petals') },
      { productId: 'can', title: 'Arrosoir doré', price: 499, keywords: ['Outils'], type: 'non_consumable', art: 'trophy', own: own('watering-can', 'a golden watering can sprinkling sparkles') },
      { productId: 'seeds_pack', title: 'Graines rares', qty: 20, price: 199, keywords: ['Graines'], art: 'farm-seeds' },
    ],
  },
  {
    slug: 'tiny-zoo', name: 'Tiny Zoo', subtitle: 'Le zoo de poche', category: 'Simulation', studio: 'std_moon', skin: 'casual',
    colors: { c1: '#ffe9a8', c2: '#fffdf3', cards: [['#fff2c2', '#ffd36b'], ['#c8f7dc', '#8fe3b3'], ['#d4f4ff', '#8fd8ff']] },
    description: 'Accueillez des animaux adorables et agrandissez votre zoo miniature.', iconArt: 'gift-big',
    iconPrompt: 'a cute baby panda hugging a bamboo stalk',
    bannerPrompt: 'game logo emblem, a cute zoo entrance arch with a giraffe and a panda peeking',
    items: [
      { productId: 'tickets', title: 'Tickets d’entrée', qty: 50, price: 199, keywords: ['Tickets'], art: 'ticket' },
      { productId: 'panda', title: 'Bébé panda', price: 699, keywords: ['Animaux', 'Populaire'], type: 'non_consumable', art: 'gift-small', own: own('baby-panda', 'a cute baby panda sitting') },
      { productId: 'food', title: 'Panier de nourriture', price: 299, keywords: ['Boosts'], art: 'bundle', own: own('food-basket', 'a wicker basket of bananas, carrots and bamboo') },
    ],
  },
  {
    slug: 'ocean-friends', name: 'Ocean Friends', subtitle: 'Aquarium relaxant', category: 'Casual', studio: 'std_owl', skin: 'casual',
    colors: { c1: '#a6e3ff', c2: '#f2fbff', cards: [['#d4f4ff', '#8fd8ff'], ['#eadcff', '#c3a6ff'], ['#c8f7dc', '#8fe3b3']] }, gradient: 'radial',
    description: 'Créez l’aquarium le plus apaisant et collectionnez des créatures marines.', iconArt: 'gems-2',
    iconPrompt: 'a cute smiling turtle swimming with small colorful fish',
    bannerPrompt: 'game logo emblem, a cute octopus holding a shiny pearl, coral and bubbles',
    items: [
      { productId: 'shells', title: 'Coquillages', qty: 400, price: 299, keywords: ['Coquillages'], art: 'gems-2', own: own('seashells', 'a small pile of pastel seashells and a starfish') },
      { productId: 'turtle', title: 'Tortue arc-en-ciel', price: 499, keywords: ['Créatures', 'Exclusif'], type: 'non_consumable', art: 'gift-small', own: own('rainbow-turtle', 'a cute turtle with a rainbow shell') },
      { productId: 'no_ads', title: 'Sans publicité', price: 399, keywords: ['Confort'], type: 'non_consumable', art: 'remove-ads' },
    ],
  },
  {
    slug: 'fruity-splash', name: 'Fruity Splash', subtitle: 'Explosion de fruits', category: 'Puzzle', studio: 'std_polar', skin: 'casual',
    colors: { c1: '#ffcf9e', c2: '#fff8f0', cards: [['#fff2c2', '#ffd36b'], ['#ffe0ea', '#ffa6c1'], ['#c8f7dc', '#8fe3b3']] }, gradient: 'linear',
    description: 'Des centaines de niveaux juteux à faire éclater.', iconArt: 'stars',
    iconPrompt: 'a cute smiling strawberry splashing juice with an orange and a lemon',
    bannerPrompt: 'game logo emblem, a splash of colorful fruit juice with a strawberry, orange and kiwi',
    items: [
      { productId: 'gold_fruit', title: 'Fruits d’or', qty: 60, price: 299, keywords: ['Monnaie'], art: 'gold-1', own: own('golden-fruit', 'a shiny golden apple and golden cherries') },
      { productId: 'moves', title: '+5 coups', price: 99, keywords: ['Boosts'], art: 'energy' },
      { productId: 'mega', title: 'Méga panier', price: 1999, old: 2999, keywords: ['Packs', 'Meilleure offre'], layout: 3, art: 'mega-bundle', own: own('fruit-basket', 'an overflowing basket of colorful glossy fruits') },
    ],
  },
  {
    slug: 'bunny-hop', name: 'Bunny Hop', subtitle: 'Sautez de nuage en nuage', category: 'Casual', studio: 'std_moon', skin: 'casual',
    colors: { c1: '#e6d4ff', c2: '#fdfaff', cards: [['#eadcff', '#c3a6ff'], ['#ffe0ea', '#ffa6c1'], ['#d4f4ff', '#8fd8ff']] },
    description: 'Un petit lapin, des nuages, des carottes : jusqu’où irez-vous ?', iconArt: 'farm-seeds',
    iconPrompt: 'a cute white bunny jumping on a fluffy cloud with a carrot',
    bannerPrompt: 'game logo emblem, a cute bunny face with long ears on a pastel cloud with carrots',
    items: [
      { productId: 'carrots', title: 'Carottes', qty: 500, price: 199, keywords: ['Carottes'], art: 'farm-seeds', own: own('carrots', 'a bunch of cute glossy carrots tied with a ribbon') },
      { productId: 'costume', title: 'Costume de licorne', price: 399, keywords: ['Costumes', 'Nouveau'], type: 'non_consumable', art: 'skin', own: own('unicorn-costume', 'a cute bunny wearing a pastel unicorn costume') },
      { productId: 'doubler', title: 'Carottes ×2', price: 499, keywords: ['Boosts'], type: 'non_consumable', art: 'booster-x2' },
    ],
  },

  // ——— Épuré : minimal, typographique ———
  {
    slug: 'word-flow', name: 'Word Flow', subtitle: 'Mots croisés zen', category: 'Puzzle', studio: 'std_polar', skin: 'clean',
    colors: { c1: '#f4f1ea', c2: '#ffffff', cards: [['#fff4cf', '#ffd36b'], ['#d9fbe8', '#9ff0c5'], ['#efe4ff', '#c7a9ff']] },
    description: 'Des grilles élégantes pour entraîner votre vocabulaire chaque jour.', iconArt: 'subscription-scroll',
    iconPrompt: 'three letter tiles stacked in a minimal composition',
    bannerPrompt: 'minimal logo emblem, a fountain pen nib drawing a flowing line',
    items: [
      { productId: 'hints_20', title: 'Indices', qty: 20, price: 199, keywords: ['Indices'], art: 'key', own: own('hint-bulb', 'a minimal light bulb') },
      { productId: 'premium', title: 'Word Flow Premium', subtitle: 'Toutes les grilles, sans pub', price: 399, keywords: ['Abonnement'], type: 'auto_renewable', layout: 3, art: 'pass' },
      { productId: 'themes', title: 'Pack de thèmes', price: 299, keywords: ['Personnalisation'], type: 'non_consumable', art: 'bundle' },
    ],
  },
  {
    slug: 'zen-sudoku', name: 'Zen Sudoku', subtitle: 'Respirez, résolvez', category: 'Puzzle', studio: 'std_owl', skin: 'clean',
    colors: { c1: '#e8f0ec', c2: '#ffffff', cards: [['#d9fbe8', '#9ff0c5'], ['#efe4ff', '#c7a9ff'], ['#fff4cf', '#ffd36b']] }, gradient: 'linear',
    description: 'Sudoku apaisant, sans chrono ni stress.', iconArt: 'stars',
    iconPrompt: 'a minimal 3x3 grid of soft stone tiles with a single number dot',
    bannerPrompt: 'minimal logo emblem, a smooth zen stone stack with a bamboo leaf',
    items: [
      { productId: 'packs', title: '100 grilles expert', price: 299, keywords: ['Grilles'], type: 'non_consumable', art: 'card-pack' },
      { productId: 'no_ads', title: 'Sans publicité', price: 299, keywords: ['Confort'], type: 'non_consumable', art: 'remove-ads' },
      { productId: 'zen_plus', title: 'Zen+', price: 199, keywords: ['Abonnement'], type: 'auto_renewable', art: 'vip', own: own('zen-stone', 'a stack of three smooth zen stones') },
    ],
  },
  {
    slug: 'chess-club', name: 'Échecs Club', subtitle: 'Parties en ligne et leçons', category: 'Stratégie', studio: 'std_brume', skin: 'clean',
    colors: { c1: '#ece7df', c2: '#ffffff', cards: [['#4b3f8f', '#22243a'], ['#fff4cf', '#ffd36b'], ['#d9fbe8', '#9ff0c5']] },
    description: 'Jouez, progressez avec des leçons et affrontez des amis.', iconArt: 'crown-silver',
    iconPrompt: 'a minimal white chess king piece casting a long shadow',
    bannerPrompt: 'minimal logo emblem, a black and white knight chess piece on a single square',
    items: [
      { productId: 'lessons', title: 'Leçons de maître', price: 999, keywords: ['Leçons'], type: 'non_consumable', art: 'subscription-scroll', own: own('chess-book', 'a closed book with a knight chess piece on top') },
      { productId: 'club', title: 'Club Or', subtitle: 'Analyses illimitées', price: 499, keywords: ['Abonnement'], type: 'auto_renewable', layout: 3, art: 'crown-silver' },
      { productId: 'board', title: 'Échiquier en marbre', price: 299, keywords: ['Personnalisation'], type: 'non_consumable', art: 'skin', own: own('marble-board', 'a marble chessboard with a few pieces') },
    ],
  },
  {
    slug: 'mini-golf-zen', name: 'Mini Golf Zen', subtitle: 'Parcours minimalistes', category: 'Sport', studio: 'std_polar', skin: 'clean',
    colors: { c1: '#e3f6e8', c2: '#ffffff', cards: [['#d9fbe8', '#9ff0c5'], ['#fff4cf', '#ffd36b'], ['#efe4ff', '#c7a9ff']] }, gradient: 'radial',
    description: 'Des parcours géométriques, une balle, un trou.', iconArt: 'trophy',
    iconPrompt: 'a white golf ball next to a flag on a floating geometric green island',
    bannerPrompt: 'minimal logo emblem, a golf flag on a small round green with a ball',
    items: [
      { productId: 'courses', title: 'Pack de parcours', price: 299, keywords: ['Parcours'], type: 'non_consumable', art: 'bundle', own: own('golf-island', 'a floating geometric mini golf island with a flag') },
      { productId: 'balls', title: 'Balles colorées', price: 199, keywords: ['Personnalisation'], type: 'non_consumable', art: 'gems-1', own: own('golf-balls', 'three pastel colored golf balls') },
      { productId: 'no_ads', title: 'Sans publicité', price: 299, keywords: ['Confort'], type: 'non_consumable', art: 'remove-ads' },
    ],
  },
  {
    slug: 'metropole', name: 'Métropole', subtitle: 'Construisez la ville idéale', category: 'Simulation', studio: 'std_lumen', skin: 'clean',
    colors: { c1: '#e6eef8', c2: '#ffffff', cards: [['#efe4ff', '#c7a9ff'], ['#d9fbe8', '#9ff0c5'], ['#4b3f8f', '#22243a']] }, gradient: 'linear',
    description: 'Urbanisme, transports et quartiers verts.', iconArt: 'key',
    iconPrompt: 'a minimal isometric cluster of white buildings with a single tree',
    bannerPrompt: 'minimal logo emblem, an isometric skyline of three towers on a round platform',
    items: [
      { productId: 'bucks', title: 'Crédits de ville', qty: 5000, price: 499, keywords: ['Crédits'], art: 'silver' },
      { productId: 'park', title: 'Parc central', price: 799, keywords: ['Bâtiments', 'Populaire'], type: 'non_consumable', art: 'bundle', own: own('city-park', 'an isometric city park block with trees and a fountain') },
      { productId: 'tower', title: 'Gratte-ciel', price: 1499, keywords: ['Bâtiments'], type: 'non_consumable', layout: 6, art: 'trophy', own: own('skyscraper', 'an isometric glass skyscraper') },
    ],
  },
  {
    slug: 'orbit-tycoon', name: 'Orbit Tycoon', subtitle: 'Empire spatial', category: 'Simulation', studio: 'std_comet', skin: 'clean',
    colors: { c1: '#1e1b3a', c2: '#3d3a6b', cards: [['#4b3f8f', '#22243a'], ['#efe4ff', '#c7a9ff'], ['#d9fbe8', '#9ff0c5']] }, gradient: 'radial',
    description: 'Lancez des satellites, minez des astéroïdes et bâtissez votre empire orbital.', iconArt: 'crystals-4',
    iconPrompt: 'a minimal satellite orbiting a small pastel planet',
    bannerPrompt: 'minimal logo emblem, a rocket circling a ringed planet',
    items: [
      { productId: 'ore', title: 'Minerai stellaire', qty: 800, price: 499, keywords: ['Ressources'], art: 'crystals-2', own: own('star-ore', 'a glowing chunk of asteroid ore with crystals') },
      { productId: 'rocket', title: 'Fusée express', price: 299, keywords: ['Boosts'], art: 'speed-up', own: own('rocket', 'a small white rocket with a flame') },
      { productId: 'station', title: 'Station orbitale', price: 1999, old: 2499, keywords: ['Bâtiments', 'Meilleure offre'], type: 'non_consumable', layout: 3, art: 'chest-rare', own: own('space-station', 'a ring-shaped orbital space station') },
    ],
  },

  // ——— Classique (pixel art) ———
  {
    slug: 'hero-dash', name: 'Hero Dash', subtitle: 'Course infinie rétro', category: 'Action', studio: 'std_owl', skin: 'classic',
    colors: { c1: '#ff6b6b', c2: '#ffd93d', cards: [['#fff1e6', '#ffb4a2'], ['#e0f7ff', '#7bdff2'], ['#fff9db', '#ffd43b']] }, gradient: 'linear',
    description: 'Sautez, glissez et collectez des pièces dans un monde 8-bit.', iconArt: 'gold-1',
    iconPrompt: 'a tiny pixel hero with a red cape running and jumping over coins',
    bannerPrompt: 'pixel art logo emblem, a pixel sword and shield with sparkling coins',
    items: [
      { productId: 'coins', title: 'Pièces', qty: 5000, price: 199, keywords: ['Pièces'], art: 'gold-2', own: own('pixel-coins', 'a stack of pixel art gold coins') },
      { productId: 'magnet', title: 'Aimant', price: 99, keywords: ['Boosts'], art: 'energy', own: own('magnet', 'a red and silver horseshoe magnet') },
      { productId: 'hero_ninja', title: 'Héros ninja', price: 299, keywords: ['Héros'], type: 'non_consumable', art: 'skin' },
    ],
  },
  {
    slug: 'pixel-dungeon', name: 'Donjon 8-bit', subtitle: 'Rogue-like rétro', category: 'RPG', studio: 'std_comet', skin: 'classic',
    colors: { c1: '#3b2f63', c2: '#0f0b1f', cards: [['#ede7ff', '#9b87f5'], ['#fff3d6', '#f4b860'], ['#dcfce7', '#4ade80']] }, gradient: 'radial',
    description: 'Explorez des donjons générés, chaque partie est unique.', iconArt: 'chest-common',
    iconPrompt: 'a pixel knight holding a torch at a dungeon door with a skull',
    bannerPrompt: 'pixel art logo emblem, a wooden dungeon door with torches and a skull key',
    items: [
      { productId: 'potions', title: 'Potions de soin', qty: 10, price: 199, keywords: ['Potions'], art: 'elixir', own: own('health-potion', 'a red pixel health potion bottle') },
      { productId: 'chest', title: 'Coffre du donjon', price: 499, keywords: ['Coffres'], art: 'chest-common', own: own('dungeon-chest', 'a pixel art wooden treasure chest with iron bands') },
      { productId: 'class', title: 'Classe Nécromancien', price: 399, keywords: ['Classes'], type: 'non_consumable', art: 'skin' },
    ],
  },
  {
    slug: 'turbo-kart', name: 'Turbo Kart', subtitle: 'Karting multijoueur', category: 'Course', studio: 'std_polar', skin: 'classic',
    colors: { c1: '#4dabf7', c2: '#e7f5ff', cards: [['#e7f5ff', '#74c0fc'], ['#fff4e6', '#ffa94d'], ['#ebfbee', '#69db7c']] },
    description: 'Dérapages, objets et circuits colorés à 8 joueurs.', iconArt: 'speed-up',
    iconPrompt: 'a tiny pixel go-kart with a helmeted driver boosting with flames',
    bannerPrompt: 'pixel art logo emblem, a checkered flag crossed with a racing trophy',
    items: [
      { productId: 'tokens', title: 'Jetons turbo', qty: 300, price: 299, keywords: ['Jetons'], art: 'tokens' },
      { productId: 'kart_gold', title: 'Kart doré', price: 499, keywords: ['Karts', 'Exclusif'], type: 'non_consumable', art: 'trophy', own: own('gold-kart', 'a pixel art golden go-kart') },
      { productId: 'boost', title: 'Turbo ×3', price: 99, keywords: ['Boosts'], art: 'booster-x2' },
    ],
  },
];
