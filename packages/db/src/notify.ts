import type { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';

/*
 * Transports de notification entre instances du serveur (Postgres LISTEN/NOTIFY).
 *
 * Utilisé par le bus d'événements de l'application (`apps/web/src/server/events.ts`) pour qu'une livraison créée
 * sur une instance réveille les flux SSE ouverts sur une autre. Les charges utiles doivent rester MINIMALES
 * (identifiants seulement, jamais de secret ni de donnée personnelle) : le destinataire relit la base.
 *
 * Trois implémentations, même interface :
 * - `createPostgresNotifyTransport(url)` : Postgres réel via postgres-js. Connexion LISTEN dédiée, reconnectée
 *   automatiquement par postgres-js ; `onReady` est rappelé à chaque (re)connexion pour que l'appelant rattrape
 *   ce qu'il a pu manquer pendant la coupure.
 * - `createPgliteNotifyTransport(pglite)` : PGlite (dev local). PGlite implémente LISTEN/NOTIFY dans le processus.
 * - `createMemoryNotifyTransport(hub?)` : en mémoire (tests). Plusieurs transports partageant le même `hub`
 *   simulent plusieurs instances.
 */

/** Canal unique des livraisons (identifiant Postgres : minuscules, sans guillemets). */
export const DELIVERY_CHANNEL = 'devappstore_deliveries';

/** NOTIFY refuse les charges utiles de 8 000 octets ou plus. */
export const NOTIFY_MAX_PAYLOAD_BYTES = 7900;

export interface ListenOptions {
  /**
   * Appelé quand l'écoute est (r)établie : `reconnect` = false à la première connexion, true après une coupure
   * (des notifications ont pu être perdues entre-temps).
   */
  onReady?: (info: { reconnect: boolean }) => void;
}

export interface NotifyTransport {
  /** Nom lisible (journaux, tests). */
  readonly kind: 'postgres' | 'pglite' | 'memory';
  /** Écoute un canal. Renvoie la fonction d'arrêt (idempotente). */
  listen(channel: string, onMessage: (payload: string) => void, opts?: ListenOptions): Promise<() => Promise<void>>;
  /** Envoie une notification (reçue aussi par l'émetteur s'il écoute le canal, comme en Postgres). */
  notify(channel: string, payload: string): Promise<void>;
  /** Ferme les connexions propres au transport. */
  close(): Promise<void>;
}

function assertChannel(channel: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(channel)) throw new Error(`Nom de canal invalide : ${channel}`);
}

function assertPayload(payload: string) {
  if (Buffer.byteLength(payload, 'utf8') > NOTIFY_MAX_PAYLOAD_BYTES) throw new Error('Charge utile NOTIFY trop longue');
}

/* ------------------------------------------------------------------------------------------------ */
/* Postgres (postgres-js)                                                                            */
/* ------------------------------------------------------------------------------------------------ */

/** Sous-ensemble de postgres-js utilisé (injectable dans les tests). */
export interface PostgresNotifyClient {
  listen(channel: string, onnotify: (value: string) => void, onlisten?: () => void): Promise<{ unlisten(): Promise<void> }>;
  notify(channel: string, payload: string): PromiseLike<unknown>;
  end(opts?: { timeout?: number }): Promise<void>;
}

/**
 * Transport Postgres. Utilise une petite connexion dédiée (`max: 2` : une pour LISTEN, une pour NOTIFY), distincte
 * du pool de l'application. Avec Neon/Supabase, utiliser l'URL DIRECTE (non poolée) : PgBouncer en mode
 * transaction ne relaie pas LISTEN (voir docs/deploy.md, « Plusieurs instances »).
 */
export function createPostgresNotifyTransport(urlOrClient: string | PostgresNotifyClient): NotifyTransport {
  const client: PostgresNotifyClient =
    typeof urlOrClient === 'string'
      ? (postgres(urlOrClient, { max: 2, idle_timeout: 0, connect_timeout: 10, onnotice: () => {} }) as unknown as PostgresNotifyClient)
      : urlOrClient;
  return {
    kind: 'postgres',
    async listen(channel, onMessage, opts = {}) {
      assertChannel(channel);
      let connections = 0;
      // postgres-js rétablit seul la connexion LISTEN et rappelle `onlisten` à chaque (re)connexion.
      const sub = await client.listen(channel, onMessage, () => {
        connections += 1;
        opts.onReady?.({ reconnect: connections > 1 });
      });
      let stopped = false;
      return async () => {
        if (stopped) return;
        stopped = true;
        await sub.unlisten();
      };
    },
    async notify(channel, payload) {
      assertChannel(channel);
      assertPayload(payload);
      await client.notify(channel, payload);
    },
    async close() {
      await client.end({ timeout: 5 });
    },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* PGlite                                                                                            */
/* ------------------------------------------------------------------------------------------------ */

/** Sous-ensemble de PGlite utilisé. */
export type PgliteNotifyClient = Pick<PGlite, 'listen' | 'query'>;

/** Transport PGlite : LISTEN/NOTIFY réels, mais limités au processus qui a ouvert la base (dev, tests). */
export function createPgliteNotifyTransport(pg: PgliteNotifyClient): NotifyTransport {
  return {
    kind: 'pglite',
    async listen(channel, onMessage, opts = {}) {
      assertChannel(channel);
      const unlisten = await pg.listen(channel, onMessage);
      opts.onReady?.({ reconnect: false });
      let stopped = false;
      return async () => {
        if (stopped) return;
        stopped = true;
        await unlisten();
      };
    },
    async notify(channel, payload) {
      assertChannel(channel);
      assertPayload(payload);
      await pg.query('select pg_notify($1, $2)', [channel, payload]);
    },
    async close() {
      /* la base appartient à l'appelant */
    },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Mémoire                                                                                           */
/* ------------------------------------------------------------------------------------------------ */

/** « Serveur » partagé par des transports mémoire (un par instance simulée). */
export class MemoryNotifyHub {
  private readonly channels = new Map<string, Set<(payload: string) => void>>();

  subscribe(channel: string, fn: (payload: string) => void): () => void {
    let set = this.channels.get(channel);
    if (!set) this.channels.set(channel, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.channels.delete(channel);
    };
  }

  publish(channel: string, payload: string): void {
    // Asynchrone, comme une vraie notification (jamais pendant l'appel à notify).
    for (const fn of [...(this.channels.get(channel) ?? [])]) setTimeout(() => fn(payload), 0);
  }

  listeners(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }
}

export function createMemoryNotifyTransport(hub: MemoryNotifyHub = new MemoryNotifyHub()): NotifyTransport {
  const subs = new Set<() => void>();
  return {
    kind: 'memory',
    async listen(channel, onMessage, opts = {}) {
      assertChannel(channel);
      const off = hub.subscribe(channel, onMessage);
      subs.add(off);
      opts.onReady?.({ reconnect: false });
      return async () => {
        off();
        subs.delete(off);
      };
    },
    async notify(channel, payload) {
      assertChannel(channel);
      assertPayload(payload);
      hub.publish(channel, payload);
    },
    async close() {
      for (const off of subs) off();
      subs.clear();
    },
  };
}
