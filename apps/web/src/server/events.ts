import 'server-only';
import type { PurchaseEvent } from '@devappstore/core';
import type { NotifyTransport } from '@devappstore/db';

/**
 * Bus d'événements des livraisons, MULTI-INSTANCE (propriétaire : tâche « delivery », vague 6 « realtime »).
 *
 * Sert à pousser les livraisons en temps réel vers les flux SSE (`/api/v1/deliveries/stream`) ouverts par le SDK
 * d'un jeu pour un joueur donné. Clé d'abonnement : (gameId, playerId).
 *
 * - Abonnés de l'instance qui publie : notifiés immédiatement et de façon synchrone (comportement historique).
 * - Autres instances : `publish` émet aussi un Postgres `NOTIFY devappstore_deliveries` dont la charge utile ne
 *   contient que des identifiants (`{ v, o, g, p, d }` : version, instance d'origine, jeu, joueur, livraison) —
 *   jamais de secret ni de montant. L'instance qui reçoit la notification ignore la sienne, ne fait rien si elle n'a
 *   aucun flux ouvert pour (jeu, joueur), sinon RELIT la livraison en base et la pousse à ses abonnés.
 * - Reconnexion : la connexion LISTEN est rétablie automatiquement ; à chaque (r)établissement, chaque abonné reçoit
 *   `onResync` et le flux SSE refait un rattrapage en base (aucun achat perdu pendant la coupure).
 *
 * Transport choisi par `EVENTS_TRANSPORT` : `postgres` (défaut si `DATABASE_URL`), `pglite` (défaut sans
 * `DATABASE_URL` : LISTEN/NOTIFY de PGlite, dans le processus), `memory` (aucun relais, défaut sous vitest).
 * URL de la connexion LISTEN : `EVENTS_DATABASE_URL` sinon `DATABASE_URL` (elle doit être DIRECTE, non poolée).
 * Voir docs/deploy.md, « Plusieurs instances ».
 */

/**
 * Métadonnées serveur jointes à un événement (jamais envoyées au jeu) : `userId` = compte Dev AppStore acheteur.
 * Un flux ouvert avec un jeton joueur ne relaie que les achats de SON compte (sec/delivery-keys).
 */
export interface PurchaseMeta {
  userId: string | null;
}

export type PurchaseListener = (event: PurchaseEvent, meta: PurchaseMeta) => void;

export interface SubscribeOptions {
  /** L'écoute inter-instances vient d'être (r)établie : des événements ont pu être manqués, relire la base. */
  onResync?: () => void;
}

/** Relit une livraison (achat ou remboursement) en base à partir de son identifiant. */
export type ResolveDelivery = (deliveryId: string) => Promise<{ gameId: string; playerId: string; event: PurchaseEvent; meta: PurchaseMeta } | null>;

/** Charge utile NOTIFY (identifiants seulement). */
export interface DeliveryNotice {
  v: 1;
  /** Instance d'origine. */
  o: string;
  g: string;
  p: string;
  d: string;
}

export interface EventBusOptions {
  /** Transport inter-instances (ou fabrique paresseuse). null = bus local seulement. */
  transport?: NotifyTransport | null | (() => Promise<NotifyTransport | null>);
  resolve?: ResolveDelivery;
  instanceId?: string;
  channel?: string;
  /** Délais entre les tentatives (NOTIFY et première écoute). */
  retryDelaysMs?: number[];
  /** Écoute initiale en échec : délai avant un nouvel essai. */
  listenRetryMs?: number;
  /**
   * Étalement des rattrapages après une (re)connexion LISTEN (revue 2026-11, F13) : chaque abonné est rappelé après
   * un délai aléatoire de 0 à `resyncJitterMs`, au lieu que tous les flux relisent la base au même instant.
   * Défaut : 5 s (0 sous vitest).
   */
  resyncJitterMs?: number;
}

export interface EventBus {
  readonly instanceId: string;
  subscribe(gameId: string, playerId: string, listener: PurchaseListener, opts?: SubscribeOptions): () => void;
  publish(gameId: string, playerId: string, event: PurchaseEvent, meta?: PurchaseMeta): number;
  subscriberCount(gameId: string, playerId: string): number;
  /** Résout quand l'écoute inter-instances est établie (immédiatement sans transport). */
  ready(): Promise<void>;
  /** Attend la fin des envois et réceptions en cours (tests). */
  idle(): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_CHANNEL = 'devappstore_deliveries';
const DEFAULT_RETRY_DELAYS_MS = [200, 1_000, 5_000];
const DEFAULT_LISTEN_RETRY_MS = 5_000;
const DEFAULT_RESYNC_JITTER_MS = 5_000;

interface Sub {
  listener: PurchaseListener;
  onResync?: () => void;
}

const keyOf = (gameId: string, playerId: string) => `${gameId}\u0000${playerId}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseNotice(raw: string): DeliveryNotice | null {
  try {
    const n = JSON.parse(raw) as Partial<DeliveryNotice>;
    if (n && n.v === 1 && typeof n.o === 'string' && typeof n.g === 'string' && typeof n.p === 'string' && typeof n.d === 'string') return n as DeliveryNotice;
  } catch {
    /* ignorée */
  }
  return null;
}

export function createEventBus(opts: EventBusOptions = {}): EventBus {
  const instanceId = opts.instanceId ?? `ins_${crypto.randomUUID()}`;
  const channel = opts.channel ?? DEFAULT_CHANNEL;
  const retryDelays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const listenRetryMs = opts.listenRetryMs ?? DEFAULT_LISTEN_RETRY_MS;
  const resyncJitterMs = opts.resyncJitterMs ?? (process.env.VITEST ? 0 : DEFAULT_RESYNC_JITTER_MS);
  const resolve = opts.resolve ?? resolveFromDb;
  const subs = new Map<string, Set<Sub>>();
  const pending = new Set<Promise<unknown>>();
  let closed = false;

  /* ------------------------------------------------------------------ transport (paresseux) */
  let transportP: Promise<NotifyTransport | null> | null = null;
  const getTransport = () =>
    (transportP ??= (async () => {
      const t = opts.transport;
      if (typeof t === 'function') return t();
      return t ?? null;
    })().catch((e) => {
      console.error('[events] transport indisponible, bus local seulement', e);
      return null;
    }));

  const track = <T>(p: Promise<T>): Promise<T> => {
    pending.add(p);
    p.finally(() => pending.delete(p)).catch(() => {});
    return p;
  };

  /* ------------------------------------------------------------------ écoute */
  let listening: Promise<void> | null = null;
  let stopListening: (() => Promise<void>) | null = null;
  let readyResolve!: () => void;
  const readyP = new Promise<void>((r) => (readyResolve = r));

  const resyncAll = () => {
    const call = (s: Sub) => {
      try {
        s.onResync?.();
      } catch (e) {
        console.error('[events] onResync en erreur', e);
      }
    };
    for (const set of subs.values())
      for (const s of [...set]) {
        if (!s.onResync) continue;
        if (resyncJitterMs <= 0) call(s);
        else setTimeout(() => !closed && call(s), Math.floor(Math.random() * resyncJitterMs)).unref?.();
      }
  };

  // Réceptions traitées une par une, dans l'ordre (un remboursement ne double pas son achat).
  let chain: Promise<void> = Promise.resolve();
  const onMessage = (raw: string) => {
    const n = parseNotice(raw);
    if (!n || n.o === instanceId) return; // l'émetteur a déjà notifié ses propres abonnés
    if (!subs.get(keyOf(n.g, n.p))?.size) return; // aucun flux ouvert ici pour ce joueur : rien à relire
    chain = chain.then(async () => {
      try {
        const row = await resolve(n.d);
        if (!row || row.gameId !== n.g || row.playerId !== n.p) return;
        deliverLocal(n.g, n.p, row.event, row.meta);
      } catch (e) {
        console.error('[events] relecture de la livraison impossible', e);
      }
    });
    track(chain);
  };

  const startListening = () =>
    (listening ??= (async () => {
      let failed = false;
      while (!closed) {
        const t = await getTransport();
        if (!t) {
          readyResolve();
          return;
        }
        try {
          stopListening = await t.listen(channel, onMessage, {
            onReady: ({ reconnect }) => {
              readyResolve();
              // Première écoute après un échec, ou reconnexion : on a pu manquer des notifications.
              if (reconnect || failed) console.warn('[events] écoute LISTEN rétablie : rattrapage des flux ouverts');
              resyncAll();
            },
          });
          return;
        } catch (e) {
          failed = true;
          console.error(`[events] LISTEN impossible, nouvel essai dans ${listenRetryMs} ms`, e);
          readyResolve(); // ne bloque pas les flux : ils lisent la base, puis rattraperont à la reconnexion
          await sleep(listenRetryMs);
        }
      }
    })());

  /* ------------------------------------------------------------------ local */
  function deliverLocal(gameId: string, playerId: string, event: PurchaseEvent, meta: PurchaseMeta): number {
    const set = subs.get(keyOf(gameId, playerId));
    if (!set) return 0;
    let n = 0;
    for (const s of [...set]) {
      try {
        s.listener(event, meta);
        n++;
      } catch (e) {
        console.error('[events] abonné en erreur', e);
      }
    }
    return n;
  }

  async function notifyOthers(notice: DeliveryNotice) {
    const t = await getTransport();
    if (!t) return;
    const payload = JSON.stringify(notice);
    for (let attempt = 0; ; attempt++) {
      try {
        await t.notify(channel, payload);
        return;
      } catch (e) {
        if (attempt >= retryDelays.length) {
          // Les autres instances rattraperont à la reconnexion du flux (le SDK relit l'arriéré à chaque connexion).
          console.error('[events] NOTIFY abandonné', { delivery: notice.d }, e);
          return;
        }
        await sleep(retryDelays[attempt]!);
      }
    }
  }

  return {
    instanceId,
    subscribe(gameId, playerId, listener, subOpts = {}) {
      const key = keyOf(gameId, playerId);
      let set = subs.get(key);
      if (!set) subs.set(key, (set = new Set()));
      const sub: Sub = { listener, onResync: subOpts.onResync };
      set.add(sub);
      if (!closed) void startListening();
      return () => {
        const s = subs.get(key);
        if (!s) return;
        s.delete(sub);
        if (s.size === 0) subs.delete(key);
      };
    },
    publish(gameId, playerId, event, meta = { userId: null }) {
      const n = deliverLocal(gameId, playerId, event, meta);
      if (!closed) track(notifyOthers({ v: 1, o: instanceId, g: gameId, p: playerId, d: event.delivery_id }));
      return n;
    },
    subscriberCount(gameId, playerId) {
      return subs.get(keyOf(gameId, playerId))?.size ?? 0;
    },
    ready() {
      void startListening();
      return readyP;
    },
    async idle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
    async close() {
      closed = true;
      readyResolve();
      await Promise.allSettled([...pending]);
      await stopListening?.().catch(() => {});
      const t = transportP ? await transportP : null;
      if (t && typeof opts.transport === 'function') await t.close().catch(() => {}); // transport créé par le bus
      subs.clear();
    },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Bus par défaut (un par processus)                                                                 */
/* ------------------------------------------------------------------------------------------------ */

/** Relit une livraison d'achat ou de remboursement et l'acheteur de la commande. */
async function resolveFromDb(deliveryId: string) {
  const { db, deliveries, refundDeliveries, orders, eq } = await import('@devappstore/db');
  for (const t of [deliveries, refundDeliveries] as const) {
    const [r] = await db
      .select({ gameId: t.gameId, playerId: t.playerId, payload: t.payload, userId: orders.userId })
      .from(t)
      .innerJoin(orders, eq(orders.id, t.orderId))
      .where(eq(t.id, deliveryId));
    if (r) return { gameId: r.gameId, playerId: r.playerId, event: r.payload, meta: { userId: r.userId } };
  }
  return null;
}

/** Transport selon l'environnement (voir l'en-tête du fichier). */
export async function defaultTransport(env: Record<string, string | undefined> = process.env): Promise<NotifyTransport | null> {
  const mode = env.EVENTS_TRANSPORT || (env.VITEST ? 'memory' : env.DATABASE_URL ? 'postgres' : 'pglite');
  if (mode === 'memory' || mode === 'none') return null;
  const dbm = await import('@devappstore/db');
  if (mode === 'postgres') {
    const url = env.EVENTS_DATABASE_URL || env.DATABASE_URL;
    if (!url) throw new Error('EVENTS_TRANSPORT=postgres sans EVENTS_DATABASE_URL ni DATABASE_URL');
    return dbm.createPostgresNotifyTransport(url);
  }
  if (mode === 'pglite') {
    if (env.DATABASE_URL) throw new Error('EVENTS_TRANSPORT=pglite alors que DATABASE_URL est défini');
    return dbm.createPgliteNotifyTransport((dbm.db as unknown as { $client: Parameters<typeof dbm.createPgliteNotifyTransport>[0] }).$client);
  }
  throw new Error(`EVENTS_TRANSPORT inconnu : ${mode}`);
}

const g = globalThis as unknown as { __devAppStoreEventBus?: EventBus };

/** Bus du processus (survit au rechargement à chaud de Next.js : sinon les flux ouverts seraient orphelins). */
export function getEventBus(): EventBus {
  return (g.__devAppStoreEventBus ??= createEventBus({ transport: () => defaultTransport() }));
}

/** Remplace le bus du processus (tests). */
export function setEventBus(bus: EventBus) {
  g.__devAppStoreEventBus = bus;
}

/* ------------------------------------------------------------------------------------------------ */
/* API historique (inchangée pour les appelants)                                                     */
/* ------------------------------------------------------------------------------------------------ */

/** S'abonne aux événements d'un joueur dans un jeu. Renvoie la fonction de désabonnement. */
export function subscribe(gameId: string, playerId: string, listener: PurchaseListener, opts?: SubscribeOptions): () => void {
  return getEventBus().subscribe(gameId, playerId, listener, opts);
}

/**
 * Publie un événement : abonnés de cette instance (synchrone, renvoie leur nombre) puis NOTIFY aux autres
 * instances (asynchrone, en arrière-plan).
 */
export function publish(gameId: string, playerId: string, event: PurchaseEvent, meta: PurchaseMeta = { userId: null }): number {
  return getEventBus().publish(gameId, playerId, event, meta);
}

export function subscriberCount(gameId: string, playerId: string): number {
  return getEventBus().subscriberCount(gameId, playerId);
}
