import { useSyncExternalStore } from 'react';
import type { App, DB, Order, StoreItem } from '../types';
import { DEFAULT_GRID, DEFAULT_STYLE } from './constants';
import { randomKey, uid } from './format';
import * as A from './demoAssets';

/*
 * Couche de données du prototype : tout est stocké dans le localStorage du navigateur.
 * Les fonctions exportées (createApp, saveItem, addOrder…) constituent l'API à
 * remplacer par des appels à votre backend lors du passage en production.
 */

const KEY = 'wolleen-db';
const VERSION = 1;

function seed(): DB {
  const now = Date.now();
  const lavender = {
    ...DEFAULT_STYLE,
    bgType: 'radial' as const,
    bg1: '#eef0ff',
    bg2: '#9fb0f0',
    titleColor: '#ffffff',
    titleOutline: true,
    titleShadow: true,
    subtitleColor: '#2d3a6b',
    priceColor: '#ffffff',
    priceBg: 'transparent',
    priceOutline: true,
    priceShadow: true,
    borderWidth: 3,
    borderColor: '#141826',
  };
  const gold = {
    ...DEFAULT_STYLE,
    bgType: 'linear' as const,
    bg1: '#fff4cc',
    bg2: '#ffd46b',
    titleColor: '#ffffff',
    titleBg: '#f59f1c',
    subtitleColor: '#6b4a00',
    priceColor: '#ffffff',
    priceBg: '#5cc31f',
    priceShadow: true,
    borderWidth: 0,
    borderColor: '#000000',
  };
  const navy = {
    ...DEFAULT_STYLE,
    bgType: 'radial' as const,
    bg1: '#3b5cc4',
    bg2: '#101c4a',
    titleColor: '#ffffff',
    subtitleColor: '#c7d3ff',
    priceColor: '#ffffff',
    priceBg: '#0b1433',
    borderWidth: 2,
    borderColor: '#4fa3ff',
    rounded: false,
  };

  const item = (p: Partial<StoreItem> & Pick<StoreItem, 'title' | 'price'>, i: number): StoreItem => ({
    id: uid('itm_'),
    productId: '',
    type: 'consumable',
    period: 'month',
    subtitle: '',
    keywords: [],
    oldPrice: null,
    models: [{ label: '' }],
    layout: 4,
    style: lavender,
    createdAt: now - (10 - i) * 1000,
    ...p,
  });

  const crystalItems: StoreItem[] = [
    item({ title: 'Sac de gemmes', productId: 'gems_1200', price: 7.99, oldPrice: 10.99, keywords: ['Gemmes', 'Monnaie'], models: [{ image: A.ART_GEM_POUCH, label: '1 200 gemmes' }], layout: 4 }, 0),
    item({ title: 'Coffre de gemmes', productId: 'gems_6500', subtitle: '+15 % offerts', price: 39.99, oldPrice: 49.99, keywords: ['Gemmes', 'Monnaie', 'Meilleure offre'], models: [{ image: A.ART_GEM_CHEST, label: '6 500 gemmes' }], layout: 1 }, 1),
    item({ title: "Pile d'or", productId: 'gold_10000', subtitle: '10 000 pièces', price: 4.99, oldPrice: 5.99, keywords: ['Or', 'Monnaie'], models: [{ image: A.ART_GOLD, label: '10 000 or' }], layout: 2, style: gold }, 2),
    item({ title: 'Pass Royal', productId: 'pass_royal_monthly', type: 'auto_renewable', subtitle: 'Récompenses x2 & coffres exclusifs', price: 4.99, oldPrice: 5.99, keywords: ['Abonnement'], models: [{ image: A.ART_PASS, label: 'Pass' }], layout: 3, style: navy }, 3),
    item({ title: 'Pack débutant', productId: 'starter_pack', type: 'non_consumable', subtitle: 'Une seule fois', price: 2.99, oldPrice: 9.99, keywords: ['Packs', 'Meilleure offre'], models: [{ image: A.ART_STARTER, label: 'Pack' }], layout: 6, style: gold }, 4),
  ];

  const farmStyle = {
    ...DEFAULT_STYLE,
    bgType: 'linear' as const,
    bg1: '#ffffff',
    bg2: '#e2f7d4',
    titleColor: '#ffffff',
    titleBg: '#4caf50',
    subtitleColor: '#2e5e1f',
    priceBg: '#f9a825',
    borderWidth: 0,
  };
  const farmItems: StoreItem[] = [
    item({ title: 'Sachet de graines', productId: 'seeds_50', subtitle: '50 graines rares', price: 1.99, keywords: ['Graines'], models: [{ image: A.ART_SEEDS, label: 'Graines' }], layout: 2, style: farmStyle }, 0),
    item({ title: 'Bourse de pièces', productId: 'coins_10000', price: 4.99, oldPrice: 6.99, keywords: ['Monnaie'], models: [{ image: A.ART_GOLD, label: 'Pièces' }], layout: 2, style: farmStyle }, 1),
  ];

  const crystal: App = {
    id: 'app_crystal',
    name: 'Crystal Clash',
    subtitle: 'Batailles PvP épiques en temps réel',
    publisher: 'Nova Games',
    icon: A.ICON_CRYSTAL,
    bannerImage: A.BANNER_CRYSTAL,
    gradient: { enabled: true, c1: '#026ab3', c2: '#ffffff', style: 'linear' },
    grid: { width: 205, height: 300, margin: 25 },
    items: crystalItems,
    currency: 'EUR',
    apiKey: randomKey('wk_live_'),
    webhookSecret: randomKey('whsec_'),
    webhookUrl: 'https://api.novagames.example/wolleen/webhook',
    createdAt: now - 86400000 * 120,
  };
  const farm: App = {
    id: 'app_farm',
    name: 'Pixel Farm',
    subtitle: 'Cultivez, récoltez, échangez',
    publisher: 'Nova Games',
    icon: A.ICON_FARM,
    bannerImage: A.BANNER_FARM,
    gradient: { enabled: true, c1: '#8fd16a', c2: '#ffffff', style: 'radial' },
    grid: { ...DEFAULT_GRID },
    items: farmItems,
    currency: 'EUR',
    apiKey: randomKey('wk_live_'),
    webhookSecret: randomKey('whsec_'),
    webhookUrl: '',
    createdAt: now - 86400000 * 40,
  };

  // Historique de ventes de démonstration (pseudo-aléatoire, reproductible)
  let s = 42;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const orders: Order[] = [];
  const gen = (app: App, days: number, perDay: number) => {
    for (let d = days; d >= 0; d--) {
      const trend = 0.6 + (1 - d / days) * 0.8;
      const n = Math.round(perDay * trend * (0.5 + rnd()));
      for (let k = 0; k < n; k++) {
        const it = app.items[Math.floor(rnd() * rnd() * app.items.length)];
        orders.push({
          id: uid('ord_'),
          appId: app.id,
          itemId: it.id,
          itemTitle: it.title,
          productId: it.productId,
          amount: it.price,
          currency: app.currency,
          playerId: '#' + Math.floor(rnd() * 1e8).toString(36).toUpperCase(),
          email: `joueur${Math.floor(rnd() * 9999)}@mail.example`,
          status: app.webhookUrl ? 'delivered' : 'paid',
          createdAt: now - d * 86400000 - Math.floor(rnd() * 86400000),
        });
      }
    }
  };
  gen(crystal, 89, 9);
  gen(farm, 39, 3);
  orders.sort((a, b) => b.createdAt - a.createdAt);

  return { version: VERSION, apps: [crystal, farm], orders };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as DB;
      if (db.version === VERSION) return db;
    }
  } catch {
    /* stockage indisponible : on repart des données de démo */
  }
  return seed();
}

let state: DB = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    alert("Stockage local plein : l'image est peut-être trop lourde. Essayez une image plus légère.");
  }
}

function commit(next: DB) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function useDB() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function useApp(id: string | undefined) {
  const db = useDB();
  return db.apps.find((a) => a.id === id);
}

export function updateApp(id: string, patch: Partial<App> | ((a: App) => Partial<App>)) {
  commit({
    ...state,
    apps: state.apps.map((a) => (a.id === id ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) } : a)),
  });
}

export function createApp(): App {
  const app: App = {
    id: uid('app_'),
    name: 'Nouvelle app',
    subtitle: 'Sous-titre',
    publisher: 'Mon studio',
    gradient: { enabled: false, c1: '#4aa8f0', c2: '#ffffff', style: 'linear' },
    grid: { ...DEFAULT_GRID },
    items: [],
    currency: 'EUR',
    apiKey: randomKey('wk_live_'),
    webhookSecret: randomKey('whsec_'),
    webhookUrl: '',
    createdAt: Date.now(),
  };
  commit({ ...state, apps: [...state.apps, app] });
  return app;
}

export function deleteApp(id: string) {
  commit({ ...state, apps: state.apps.filter((a) => a.id !== id), orders: state.orders.filter((o) => o.appId !== id) });
}

export function saveItem(appId: string, item: StoreItem) {
  updateApp(appId, (a) => ({
    items: a.items.some((i) => i.id === item.id) ? a.items.map((i) => (i.id === item.id ? item : i)) : [...a.items, item],
  }));
}

export function deleteItem(appId: string, itemId: string) {
  updateApp(appId, (a) => ({ items: a.items.filter((i) => i.id !== itemId) }));
}

export function moveItem(appId: string, itemId: string, dir: -1 | 1) {
  updateApp(appId, (a) => {
    const items = [...a.items];
    const i = items.findIndex((x) => x.id === itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return {};
    [items[i], items[j]] = [items[j], items[i]];
    return { items };
  });
}

export function addOrder(order: Order) {
  commit({ ...state, orders: [order, ...state.orders] });
}

export function resetDemo() {
  commit(seed());
}
