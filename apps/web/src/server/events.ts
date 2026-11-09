import 'server-only';
import type { PurchaseEvent } from '@devappstore/core';

/**
 * Bus d'événements EN MÉMOIRE (propriétaire : tâche « delivery »).
 *
 * Sert à pousser les livraisons en temps réel vers les flux SSE (`/api/v1/deliveries/stream`)
 * ouverts par le SDK d'un jeu pour un joueur donné. Clé d'abonnement : (gameId, playerId).
 *
 * LIMITE CONNUE — une seule instance : un événement publié par une instance du serveur n'atteint que
 * les flux ouverts sur CETTE instance. En production multi-instance (plusieurs pods, serverless),
 * remplacer l'implémentation par Redis Pub/Sub ou Postgres LISTEN/NOTIFY (phase 2) en gardant la même API.
 * En attendant, rien n'est perdu : le SDK reçoit l'arriéré à chaque (re)connexion au flux et interroge
 * `GET /api/v1/deliveries` au lancement / retour au premier plan.
 */

/**
 * Métadonnées serveur jointes à un événement (jamais envoyées au jeu) : `userId` = compte Dev AppStore acheteur.
 * Un flux ouvert avec un jeton joueur ne relaie que les achats de SON compte (sec/delivery-keys).
 */
export interface PurchaseMeta {
  userId: string | null;
}

export type PurchaseListener = (event: PurchaseEvent, meta: PurchaseMeta) => void;

const g = globalThis as unknown as { __devAppStoreDeliveryBus?: Map<string, Set<PurchaseListener>> };
/** Survit au rechargement à chaud de Next.js (sinon les flux ouverts seraient orphelins). */
const bus: Map<string, Set<PurchaseListener>> = g.__devAppStoreDeliveryBus ?? (g.__devAppStoreDeliveryBus = new Map());

const keyOf = (gameId: string, playerId: string) => `${gameId}\u0000${playerId}`;

/** S'abonne aux événements d'un joueur dans un jeu. Renvoie la fonction de désabonnement. */
export function subscribe(gameId: string, playerId: string, listener: PurchaseListener): () => void {
  const key = keyOf(gameId, playerId);
  let set = bus.get(key);
  if (!set) bus.set(key, (set = new Set()));
  set.add(listener);
  return () => {
    const s = bus.get(key);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) bus.delete(key);
  };
}

/** Publie un événement à tous les abonnés (gameId, playerId). Renvoie le nombre d'abonnés notifiés. */
export function publish(gameId: string, playerId: string, event: PurchaseEvent, meta: PurchaseMeta = { userId: null }): number {
  const set = bus.get(keyOf(gameId, playerId));
  if (!set) return 0;
  let n = 0;
  for (const listener of [...set]) {
    try {
      listener(event, meta);
      n++;
    } catch (e) {
      console.error('[events] abonné en erreur', e);
    }
  }
  return n;
}

export function subscriberCount(gameId: string, playerId: string): number {
  return bus.get(keyOf(gameId, playerId))?.size ?? 0;
}
