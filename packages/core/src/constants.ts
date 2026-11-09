import type { GameTheme, ItemStyle, ItemType, Period } from './types';

/** Commission standard Apple / Google sur les achats in-app. */
export const STORE_FEE_BPS = 3000;
/** Commission Wolleen par défaut (points de base). Surchargée par PLATFORM_FEE_BPS. */
export const DEFAULT_PLATFORM_FEE_BPS = 500;

/** Paliers de prix en centimes (inspirés d'App Store Connect). */
export const PRICE_TIERS_CENTS = [
  49, 99, 149, 199, 299, 399, 499, 599, 699, 799, 899, 999, 1099, 1299, 1499, 1699, 1799, 1999, 2199,
  2499, 2999, 3499, 3999, 4499, 4999, 5999, 6999, 7999, 8999, 9999,
];

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

/** Durée de validité d'un code de liaison affiché dans le jeu. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
/** Planning des nouvelles tentatives webhook (ms après l'échec précédent). */
export const WEBHOOK_RETRY_SCHEDULE_MS = [10_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 24 * 3600_000];
