import type { Currency, GameTheme, ItemStyle, ItemType, Period, StoreSkin } from './types';

/**
 * Commission standard Apple / Google sur les achats in-app (taux « plein » historique).
 * Conservée pour compatibilité : ce n'est PAS le cas le plus courant (petits studios < 1 M$/an et abonnements
 * après un an : 15 % ; UE : 26 %/15 % ; voir docs/legal/stores.md). Les comparaisons affichées doivent nommer le taux
 * utilisé et laisser choisir parmi `STORE_FEE_OPTIONS_BPS`.
 */
export const STORE_FEE_BPS = 3000;
/** Taux réduit des stores (Small Business Program Apple, 1er palier Google Play, abonnements après un an). */
export const REDUCED_STORE_FEE_BPS = 1500;
/** Taux de commission store proposés dans les comparatifs (calculateur marketing, tuile « Gagné en plus »). */
export const STORE_FEE_OPTIONS_BPS = [REDUCED_STORE_FEE_BPS, STORE_FEE_BPS] as const;
/** Commission Dev AppStore par défaut (points de base). Surchargée par PLATFORM_FEE_BPS. */
export const DEFAULT_PLATFORM_FEE_BPS = 500;

/** Paliers de prix en centimes (inspirés d'App Store Connect). */
export const PRICE_TIERS_CENTS = [
  49, 99, 149, 199, 299, 399, 499, 599, 699, 799, 899, 999, 1099, 1299, 1499, 1699, 1799, 1999, 2199,
  2499, 2999, 3499, 3999, 4499, 4999, 5999, 6999, 7999, 8999, 9999,
];

/**
 * Montant minimum accepté par Stripe par devise (centimes). Un article sous ce montant est refusé à l'écriture
 * (éditeur, import) : sinon il serait publié mais inachetable (revue 2026-11, C-5).
 */
export const MIN_CHARGE_CENTS: Record<Currency, number> = { EUR: 50, USD: 50, GBP: 30 };

export const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'consumable', label: 'Consommable' },
  { value: 'non_consumable', label: 'Non consommable' },
  { value: 'auto_renewable', label: 'Abonnement auto-renouvelable' },
  { value: 'non_renewing', label: 'Abonnement non renouvelable' },
];

export const PERIODS: { value: Period; label: string; short: string }[] = [
  { value: 'week', label: 'Semaine', short: '/sem.' },
  { value: 'month', label: 'Mois', short: '/mois' },
  { value: 'year', label: 'An', short: '/an' },
];

export const GAME_CATEGORIES = [
  'Action', 'Aventure', 'Stratégie', 'RPG', 'Simulation', 'Sport', 'Course', 'Puzzle', 'Casual', 'Cartes', 'Battle royale',
] as const;

export const GRID_LIMITS = {
  width: { min: 140, max: 280 },
  height: { min: 180, max: 380 },
  margin: { min: 0, max: 50 },
};

export const DEFAULT_THEME: GameTheme = {
  skin: 'arcade',
  gradient: { enabled: false, c1: '#4aa8f0', c2: '#ffffff', style: 'linear' },
  grid: { width: 200, height: 260, margin: 24 },
};

export const DEFAULT_ITEM_STYLE: ItemStyle = {
  bgType: 'radial',
  bg1: '#ffffff',
  bg2: '#c9c9cf',
  titleColor: '#1d1d1f',
  titleBg: 'transparent',
  titleOutline: false,
  titleShadow: false,
  subtitleColor: '#5f5f66',
  priceColor: '#ffffff',
  priceBg: '#4a4a52',
  priceOutline: false,
  priceShadow: false,
  borderWidth: 2,
  borderColor: '#1d1d1f',
  rounded: true,
  shadow: true,
};

/** Thèmes de boutique proposés aux studios (l'ordre est celui du sélecteur de l'éditeur). */
export const STORE_SKINS: { value: StoreSkin; label: string; description: string }[] = [
  { value: 'arcade', label: 'Arcade', description: 'Contours épais, relief, boutons 3D — jeux d’action.' },
  { value: 'premium', label: 'Premium sombre', description: 'Verre fumé, filets dorés, halo — RPG et collection.' },
  { value: 'casual', label: 'Casual doux', description: 'Pastels, rondeurs, rubans — puzzle et gestion.' },
  { value: 'clean', label: 'Épuré', description: 'Cartes blanches, aplat de couleur — façon vitrine.' },
  { value: 'classic', label: 'Classique', description: 'Rendu historique, chaque détail réglable.' },
];

/**
 * Palettes conseillées par thème (proposées dans l'éditeur). Dans les thèmes, `bg1`/`bg2` colorent la carte (arcade),
 * le halo (premium) ou l'aplat derrière l'objet (casual, épuré) ; `priceBg`/`priceColor` le bouton d'achat.
 */
export const SKIN_PALETTES: Record<Exclude<StoreSkin, 'classic'>, { label: string; style: Partial<ItemStyle> }[]> = {
  arcade: [
    { label: 'Ciel', style: { bg1: '#7bd3ff', bg2: '#2a5be0', titleColor: '#ffffff', priceBg: '#4cc92f', priceColor: '#ffffff' } },
    { label: 'Épique', style: { bg1: '#e5a8ff', bg2: '#6a1fd6', titleColor: '#ffffff', priceBg: '#4cc92f', priceColor: '#ffffff' } },
    { label: 'Or', style: { bg1: '#ffeaa0', bg2: '#f08c00', titleColor: '#ffffff', priceBg: '#4cc92f', priceColor: '#ffffff' } },
    { label: 'Rubis', style: { bg1: '#ff7aa8', bg2: '#7a1145', titleColor: '#ffffff', priceBg: '#4cc92f', priceColor: '#ffffff' } },
  ],
  premium: [
    { label: 'Émeraude', style: { bg1: '#50dca0', bg2: '#15121f', titleColor: '#f3ead7', priceBg: '#d9ad5c', priceColor: '#1a1408' } },
    { label: 'Améthyste', style: { bg1: '#aa6eff', bg2: '#15121f', titleColor: '#f3ead7', priceBg: '#d9ad5c', priceColor: '#1a1408' } },
    { label: 'Soleil', style: { bg1: '#ffc85a', bg2: '#15121f', titleColor: '#f3ead7', priceBg: '#d9ad5c', priceColor: '#1a1408' } },
    { label: 'Braise', style: { bg1: '#ff7896', bg2: '#15121f', titleColor: '#f3ead7', priceBg: '#d9ad5c', priceColor: '#1a1408' } },
  ],
  casual: [
    { label: 'Menthe', style: { bg1: '#c8f7dc', bg2: '#8fe3b3', titleColor: '#4a2c12', priceBg: '#4cc43a', priceColor: '#ffffff' } },
    { label: 'Lavande', style: { bg1: '#eadcff', bg2: '#c3a6ff', titleColor: '#4a2c12', priceBg: '#4cc43a', priceColor: '#ffffff' } },
    { label: 'Miel', style: { bg1: '#fff2c2', bg2: '#ffd36b', titleColor: '#4a2c12', priceBg: '#4cc43a', priceColor: '#ffffff' } },
    { label: 'Fraise', style: { bg1: '#ffe0ea', bg2: '#ffa6c1', titleColor: '#4a2c12', priceBg: '#4cc43a', priceColor: '#ffffff' } },
  ],
  clean: [
    { label: 'Menthe', style: { bg1: '#d9fbe8', bg2: '#9ff0c5', titleColor: '#111111', priceBg: '#111111', priceColor: '#ffffff' } },
    { label: 'Lavande', style: { bg1: '#efe4ff', bg2: '#c7a9ff', titleColor: '#111111', priceBg: '#111111', priceColor: '#ffffff' } },
    { label: 'Miel', style: { bg1: '#fff4cf', bg2: '#ffd36b', titleColor: '#111111', priceBg: '#111111', priceColor: '#ffffff' } },
    { label: 'Nuit', style: { bg1: '#4b3f8f', bg2: '#22243a', titleColor: '#111111', priceBg: '#111111', priceColor: '#ffffff' } },
  ],
};

/** Durée de validité d'un code de liaison affiché dans le jeu. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
/** Planning des nouvelles tentatives webhook (ms après l'échec précédent). */
export const WEBHOOK_RETRY_SCHEDULE_MS = [10_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 24 * 3600_000];
