/*
 * Types publics du SDK. Copie volontaire (le SDK n'a aucune dépendance) des types de `@devappstore/core` :
 * la compatibilité est vérifiée par les tests (`types.test.ts`).
 */

export type Currency = 'EUR' | 'USD' | 'GBP';
export type ItemType = 'consumable' | 'non_consumable' | 'auto_renewable' | 'non_renewing';

/**
 * Événement d'achat livré au jeu (webhook, flux SSE, interrogation). Montants en centimes.
 * - `purchase.completed` : créditer le joueur.
 * - `purchase.refunded` : la commande `order_id` a été remboursée (ou contestée) ; retirer l'objet si cet `order_id`
 *   avait été crédité, sinon ignorer. Mêmes `product_id`, `quantity`… que l'achat ; `delivery_id` propre.
 */
export interface PurchaseEvent {
  event: 'purchase.completed' | 'purchase.refunded';
  /** Clé d'idempotence : ne jamais traiter deux fois le même `delivery_id` (achat ou remboursement). */
  delivery_id: string;
  /** Identifiant de la commande : commun à l'achat et à son éventuel remboursement. */
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
  /** Demande de liaison à interroger (`waitForLink`) pour obtenir le jeton joueur (clé publique). */
  link_request_id?: string | null;
  /** Page de la boutique où le joueur saisit le code (à ouvrir dans son navigateur). */
  link_url?: string;
  /** Boutique web du jeu. */
  store_url?: string;
  /** Plus forte réduction de la boutique web par rapport aux prix en jeu, en % (0 si aucune). */
  web_discount_percent?: number;
}

/** Réponse de `GET /api/v1/link-requests/{id}`. */
export interface LinkRequestStatus {
  /**
   * `pending` : code pas encore saisi ; `expired` : code expiré ; `linked` : compte lié (avec la clé publique,
   * `player_token` n'est présent qu'au premier appel) ; `claimed` : jeton déjà délivré pour cette demande.
   */
  status: 'pending' | 'linked' | 'expired' | 'claimed';
  player_id?: string;
  expires_at?: string;
  player_token?: string;
}

export interface WaitForLinkOptions {
  /** Intervalle d'interrogation (défaut 3 s, minimum 1 s). */
  intervalMs?: number;
  /** Abandon (ex. le joueur ferme l'écran de liaison). */
  signal?: AbortSignal;
  /** Délai max (défaut : jusqu'à l'expiration du code + 30 s, sinon 11 min). */
  timeoutMs?: number;
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
 * Constructeur EventSource acceptant `{ headers }` (ex. polyfill npm `eventsource`). L'EventSource natif du navigateur
 * ignore les en-têtes : il ne convient pas (la clé ne doit jamais passer dans l'URL).
 */
export type EventSourceCtor = new (url: string, init?: { headers?: Record<string, string>; withCredentials?: boolean }) => EventSourceLike;

export type Transport = 'auto' | 'fetch' | 'eventsource';

export interface DevAppStoreOptions {
  /**
   * Clé PUBLIQUE du jeu (`das_pub_…`, page Intégration) : à utiliser dans le client du jeu (navigateur, WebGL, WebView).
   * Les achats du joueur ne sont accessibles qu'après la liaison (`requestLinkCode` + `waitForLink`), avec le jeton
   * joueur obtenu, mémorisé dans `storage`.
   */
  publishableKey?: string;
  /**
   * Clé SECRÈTE du jeu (`das_secret_…`) : uniquement côté SERVEUR (Node), jamais dans un client — elle donne accès aux
   * achats de tous les joueurs. Une valeur `das_pub_…` passée ici est traitée comme une clé publique.
   */
  apiKey?: string;
  /**
   * Autorise une clé secrète dans un navigateur (déconseillé : n'importe quel visiteur la lirait). Sans cette option,
   * le constructeur refuse une clé secrète quand `window` et `document` existent.
   */
  dangerouslyAllowSecretKeyInBrowser?: boolean;
  /** URL de Dev AppStore, ex. `https://devappstore.com` ou `http://localhost:3000`. */
  baseUrl?: string;
  /** Implémentation fetch (par défaut `globalThis.fetch`). */
  fetch?: typeof fetch;
  /**
   * Transport du flux temps réel (la clé et le jeton voyagent toujours en en-têtes, jamais dans l'URL) :
   * - `fetch` : flux SSE lu via fetch + ReadableStream ;
   * - `eventsource` : constructeur `EventSource` fourni en option, qui doit accepter `{ headers }` (polyfill) ;
   * - `auto` (défaut) : `EventSource` fourni s'il y en a un, sinon fetch-stream. L'EventSource natif du navigateur
   *   (sans en-têtes) n'est jamais utilisé : sans fetch-stream, le SDK rattrape les achats toutes les 30 s.
   */
  transport?: Transport;
  /** Constructeur EventSource acceptant `{ headers }` (polyfill). */
  EventSource?: EventSourceCtor;
  /**
   * Persistance (ex. `localStorage`) des `delivery_id` déjà traités et des jetons joueur. Mémoire seule par défaut :
   * le joueur devrait alors refaire la liaison à chaque lancement.
   */
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
