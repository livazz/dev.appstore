import type { GameKey } from './config';

/** Joueurs fictifs, communs aux deux jeux de Nova Games. */
export interface DemoPlayer {
  id: string;
  name: string;
  level: number;
}

export const PLAYERS: DemoPlayer[] = [
  { id: '#2PP8QL9', name: 'Ali', level: 42 },
  { id: '#9LQ2YVR', name: 'Léa', level: 17 },
  { id: '#8VJR2KX', name: 'Sam', level: 7 },
];

/** Accepte « 2pp8ql9 », « #2PP8QL9 », « %232PP8QL9 »… et renvoie l'ID canonique s'il existe. */
export function findPlayer(input: string): DemoPlayer | undefined {
  const s = input.trim().toUpperCase().replace(/^#/, '');
  return PLAYERS.find((p) => p.id.slice(1) === s);
}

export type Resource = 'gems' | 'gold' | 'seeds' | 'royalPass' | 'starterPack';
export type Inventory = Record<Resource, number>;

export const emptyInventory = (): Inventory => ({ gems: 0, gold: 0, seeds: 0, royalPass: 0, starterPack: 0 });

/** Inventaire de départ, pour que la démo ne commence pas à zéro. */
export const STARTING_INVENTORY: Record<GameKey, Partial<Inventory>> = {
  crystal: { gems: 120, gold: 2500 },
  farm: { seeds: 10, gold: 300 },
};

/**
 * Ce que chaque produit crédite. `perUnit` : la ressource reçoit `quantity` de l'événement (ex. 1 200 gemmes) ;
 * `fixed` : un lot fixe (packs, abonnements). Partagé avec la page du jeu (mode SDK) via /api/config.
 */
export type Grant = { perUnit: Resource; fallback: number } | { fixed: Partial<Inventory> };

export const GRANTS: Record<string, Grant> = {
  gems_1200: { perUnit: 'gems', fallback: 1200 },
  gems_6500: { perUnit: 'gems', fallback: 6500 },
  gold_10000: { perUnit: 'gold', fallback: 10000 },
  starter_pack: { fixed: { gems: 500, gold: 5000, starterPack: 1 } },
  pass_royal_monthly: { fixed: { royalPass: 1 } },
  seeds_50: { perUnit: 'seeds', fallback: 50 },
  coins_10000: { perUnit: 'gold', fallback: 10000 },
};

/** Variation d'inventaire pour un produit (négative pour un remboursement). */
export function grantFor(productId: string, quantity: number, refund = false): Partial<Inventory> | null {
  const g = GRANTS[productId];
  if (!g) return null;
  const sign = refund ? -1 : 1;
  if ('perUnit' in g) return { [g.perUnit]: sign * (quantity > 0 ? quantity : g.fallback) };
  return Object.fromEntries(Object.entries(g.fixed).map(([k, v]) => [k, sign * (v ?? 0)]));
}

export function applyDelta(inv: Inventory, delta: Partial<Inventory>): Inventory {
  const out = { ...inv };
  for (const [k, v] of Object.entries(delta) as [Resource, number][]) {
    out[k] = Math.max(0, out[k] + v);
    if (k === 'royalPass' || k === 'starterPack') out[k] = Math.min(1, out[k]);
  }
  return out;
}
