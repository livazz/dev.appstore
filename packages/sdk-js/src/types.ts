/*
 * Types publics du SDK. Copie volontaire (le SDK n'a aucune dépendance) des types de `@wolleen/core` :
 * la compatibilité est vérifiée par les tests (`types.test.ts`).
 */

export type Currency = 'EUR' | 'USD' | 'GBP';
export type ItemType = 'consumable' | 'non_consumable' | 'auto_renewable' | 'non_renewing';

/** Événement d'achat livré au jeu (webhook, flux SSE, interrogation). Montants en centimes. */
export interface PurchaseEvent {
  event: 'purchase.completed' | 'purchase.refunded';
  /** Clé d'idempotence : ne jamais créditer deux fois le même `delivery_id`. */
  delivery_id: string;
  order_id: string;
  game_id: string;
  player_id: string;
  product_id: string;
  item_type: ItemType;
  quantity: number;
  amount_cents: number;
  currency: Currency;
  created_at: string;
}

/** Réponse de `POST /api/v1/link-codes`. */
export interface LinkCode {
  /** Code à afficher dans le jeu, ex. « K7QF-M2XA ». */
  code: string;
  /** Date d'expiration ISO 8601. */
  expires_at: string;
}

/** Réponse attendue de l'endpoint « player lookup » du studio (méthode id_confirm). */
export interface PlayerLookupResponse {
  player_id: string;
  display_name: string;
  level?: number;
  avatar_url?: string;
}

/** Sous-ensemble de `Storage` (localStorage, ou équivalent maison) utilisé pour retenir les livraisons traitées. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Message SSE minimal (compatible `MessageEvent`). */
export interface SseMessage {
  data: string;
  lastEventId?: string;
}

/** Instance EventSource minimale (navigateur ou polyfill). */
export interface EventSourceLike {
  addEventListener(type: string, listener: (ev: SseMessage) => void): void;
  onopen: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
}

/**
 * Constructeur EventSource. Le second argument `{ headers }` est passé pour les polyfills qui
 * l'acceptent (ex. paquet npm `eventsource`) ; l'EventSource natif du navigateur l'ignore.
 */
export type EventSourceCtor = new (url: string, init?: { headers?: Record<string, string>; withCredentials?: boolean }) => EventSourceLike;

export type Transport = 'auto' | 'fetch' | 'eventsource';

export interface WolleenOptions {
  /** Clé API du jeu (`wk_…`), page Intégration de l'espace studio. */
  apiKey: string;
  /** URL de Wolleen, ex. `https://wolleen.com` ou `http://localhost:3000`. */
  baseUrl?: string;
  /** Implémentation fetch (par défaut `globalThis.fetch`). */
  fetch?: typeof fetch;
  /**
   * Transport du flux temps réel :
   * - `fetch` : flux SSE lu via fetch + ReadableStream (envoie l'en-tête Authorization) ;
   * - `eventsource` : EventSource (option `EventSource` fournie, sinon l'EventSource global) ;
   * - `auto` (défaut) : `EventSource` fourni en option s'il y en a un, sinon fetch-stream si disponible, sinon EventSource global.
   */
  transport?: Transport;
  /** Constructeur EventSource acceptant `{ headers }` (polyfill). */
  EventSource?: EventSourceCtor;
  /** Persistance des `delivery_id` déjà traités (ex. `localStorage`). Mémoire seule par défaut. */
  storage?: StorageLike | null;
  /** Accuser réception automatiquement après la résolution du handler (défaut : true). */
  autoAck?: boolean;
  /** Délai initial de reconnexion (défaut 1 s), doublé à chaque échec jusqu'à `maxReconnectDelayMs` (défaut 30 s). */
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  /** Sans aucune donnée (le serveur envoie un ping toutes les 15 s) pendant ce délai, la connexion est relancée. 0 = désactivé. Défaut 45 s. */
  idleTimeoutMs?: number;
  /** Délai max d'une requête HTTP simple (défaut 15 s). */
  timeoutMs?: number;
  /** Erreurs non fatales (réseau, handler qui échoue, ack refusé…). */
  onError?: (error: unknown) => void;
}

export type PurchaseHandler = (event: PurchaseEvent) => void | Promise<void>;

export interface PurchaseSubscription {
  /** Arrête l'écoute (ferme le flux, annule les reconnexions). */
  unsubscribe(): void;
  /** Rattrapage manuel : récupère les livraisons en attente et les traite. */
  catchUp(): Promise<void>;
  /** Vrai quand le flux temps réel est ouvert. */
  readonly connected: boolean;
}
