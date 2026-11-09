import { EventEmitter } from 'node:events';
import type { PurchaseEvent } from '@wolleen/sdk';
import { applyDelta, emptyInventory, grantFor, STARTING_INVENTORY, type Inventory } from './catalog';
import type { GameKey } from './config';

export interface CreditRecord {
  delivery_id: string;
  event: PurchaseEvent['event'];
  product_id: string;
  delta: Partial<Inventory>;
  at: string;
}

export interface CreditResult {
  duplicate: boolean;
  /** Produit inconnu du jeu : rien n'est crédité (journalisé). */
  unknownProduct: boolean;
  /** Remboursement d'une commande jamais créditée par le jeu : rien à retirer. */
  ignored?: boolean;
  inventory: Inventory;
  record?: CreditRecord;
}

export interface InventoryUpdate {
  game: GameKey;
  playerId: string;
  inventory: Inventory;
  record: CreditRecord;
}

interface PlayerState {
  inventory: Inventory;
  history: CreditRecord[];
}

/**
 * « Base de données » du faux serveur de jeu, en mémoire. Le crédit est idempotent par `delivery_id`
 * (par jeu) : un webhook rejoué ou relancé par Wolleen ne crédite jamais deux fois.
 * Un `purchase.refunded` retire exactement ce que la commande (`order_id`) avait crédité, et rien si elle ne
 * l'avait jamais été (remboursée avant livraison).
 */
export class InventoryStore extends EventEmitter<{ update: [InventoryUpdate] }> {
  private readonly players = new Map<string, PlayerState>();
  private readonly processed = new Map<GameKey, Set<string>>();
  /** Commandes créditées (par jeu) → variation appliquée, pour révoquer exactement en cas de remboursement. */
  private readonly credited = new Map<GameKey, Map<string, Partial<Inventory>>>();

  private state(game: GameKey, playerId: string): PlayerState {
    const k = `${game}:${playerId}`;
    let s = this.players.get(k);
    if (!s) {
      s = { inventory: applyDelta(emptyInventory(), STARTING_INVENTORY[game]), history: [] };
      this.players.set(k, s);
    }
    return s;
  }

  get(game: GameKey, playerId: string): { inventory: Inventory; history: CreditRecord[] } {
    const s = this.state(game, playerId);
    return { inventory: { ...s.inventory }, history: [...s.history] };
  }

  credit(game: GameKey, e: PurchaseEvent): CreditResult {
    const seen = this.processed.get(game) ?? new Set<string>();
    this.processed.set(game, seen);
    const s = this.state(game, e.player_id);
    if (seen.has(e.delivery_id)) return { duplicate: true, unknownProduct: false, inventory: { ...s.inventory } };
    const orders = this.credited.get(game) ?? new Map<string, Partial<Inventory>>();
    this.credited.set(game, orders);
    seen.add(e.delivery_id);
    let delta: Partial<Inventory> | null;
    if (e.event === 'purchase.refunded') {
      const granted = orders.get(e.order_id);
      if (!granted) return { duplicate: false, unknownProduct: false, ignored: true, inventory: { ...s.inventory } };
      orders.delete(e.order_id);
      delta = Object.fromEntries(Object.entries(granted).map(([k, v]) => [k, -(v ?? 0)]));
    } else {
      delta = grantFor(e.product_id, e.quantity);
      if (!delta) return { duplicate: false, unknownProduct: true, inventory: { ...s.inventory } };
      orders.set(e.order_id, delta);
    }
    s.inventory = applyDelta(s.inventory, delta);
    const record: CreditRecord = { delivery_id: e.delivery_id, event: e.event, product_id: e.product_id, delta, at: new Date().toISOString() };
    s.history = [record, ...s.history].slice(0, 30);
    this.emit('update', { game, playerId: e.player_id, inventory: { ...s.inventory }, record });
    return { duplicate: false, unknownProduct: false, inventory: { ...s.inventory }, record };
  }
}
