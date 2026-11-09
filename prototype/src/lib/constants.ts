import type { ItemStyle, ItemType, GridSettings, Period } from '../types';

/** Commission prélevée par Apple / Google sur les achats in-app (cas standard). */
export const STORE_FEE = 0.3;
/** Commission Wolleen, frais de paiement inclus. À ajuster selon votre modèle économique. */
export const PLATFORM_FEE = 0.05;

export const PRICE_TIERS = [
  0.49, 0.99, 1.49, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99, 7.99, 8.99, 9.99, 10.99, 12.99, 14.99,
  16.99, 17.99, 19.99, 21.99, 24.99, 29.99, 34.99, 39.99, 44.99, 49.99, 59.99, 69.99, 79.99, 89.99,
  99.99,
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

export const GRID_LIMITS = {
  width: { min: 140, max: 280 },
  height: { min: 180, max: 380 },
  margin: { min: 0, max: 50 },
};

export const DEFAULT_GRID: GridSettings = { width: 200, height: 260, margin: 24 };

export const DEFAULT_STYLE: ItemStyle = {
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
