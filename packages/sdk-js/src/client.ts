import { SseParser } from './sse.js';
import type {
  EventSourceCtor,
  EventSourceLike,
  LinkCode,
  LinkRequestStatus,
  PurchaseEvent,
  PurchaseHandler,
  PurchaseSubscription,
  StorageLike,
  WaitForLinkOptions,
  DevAppStoreOptions,
} from './types.js';

export const SDK_VERSION = '0.2.0';
const DEFAULT_BASE_URL = 'https://devappstore.com';
const PROCESSED_KEEP = 500;
/** En-tête du jeton joueur (clé publique). */
export const PLAYER_TOKEN_HEADER = 'DevAppStore-Player-Token';
const PUBLISHABLE_PREFIX = 'das_pub_';
/** Sans flux temps réel possible, rattrapage périodique. */
const FALLBACK_POLL_MS = 30_000;

/** Erreur renvoyée par l'API Dev AppStore (`{ error: { code, message } }`) ou par le transport. */
export class DevAppStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DevAppStoreError';
  }
}

/** Erreurs qui ne se corrigent pas en réessayant (clé invalide, jeton absent, paramètre manquant…). */
function isFatal(e: unknown) {
  return e instanceof DevAppStoreError && (e.status === 400 || e.status === 401 || e.status === 403 || e.status === 404);
}

const tokenRequired = () =>
  new DevAppStoreError('Compte joueur non lié sur cet appareil : appelez requestLinkCode() puis waitForLink().', 401, 'player_token_required');

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DevAppStoreError('Attente annulée.', 0, 'aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DevAppStoreError('Attente annulée.', 0, 'aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Client Dev AppStore pour le jeu (navigateur, WebView, Node ≥ 20). Aucune dépendance.
 *
 * Jeu SANS serveur — clé publique + jeton joueur :
 * ```ts
 * const devappstore = new DevAppStore({ publishableKey: 'das_pub_…', baseUrl: 'https://devappstore.com', storage: localStorage });
 * if (!devappstore.isLinked(playerId)) {
 *   const link = await devappstore.requestLinkCode(playerId, playerName); // afficher link.code
 *   await devappstore.waitForLink(link);                                  // jeton joueur mémorisé
 * }
 * const sub = devappstore.onPurchase(playerId, async (e) => inventory.apply(e));
 * ```
 * Serveur du studio (Node) — clé secrète : `new DevAppStore({ apiKey: process.env.DEVAPPSTORE_SECRET_KEY })`.
 */
export class DevAppStore {
  readonly baseUrl: string;
  /** `publishable` : clé publique (client du jeu, jeton joueur requis) ; `secret` : clé secrète (serveur). */
  readonly keyType: 'publishable' | 'secret';
  private readonly key: string;
  private readonly opts: Required<Pick<DevAppStoreOptions, 'autoAck' | 'reconnectDelayMs' | 'maxReconnectDelayMs' | 'idleTimeoutMs' | 'timeoutMs'>> &
    DevAppStoreOptions;
  private readonly fetchImpl: typeof fetch;
  /** delivery_id déjà crédités, par joueur. */
  private readonly processed = new Map<string, Set<string>>();
  /** Jetons joueur connus (cache de `storage`) ; null = absent. */
  private readonly tokens = new Map<string, string | null>();
  private readonly tokenListeners = new Map<string, Set<(token: string | null) => void>>();

  constructor(options: DevAppStoreOptions) {
    const key = options?.publishableKey || options?.apiKey;
    if (!key) throw new Error('Dev AppStore : publishableKey (client du jeu) ou apiKey (serveur) est obligatoire.');
    this.key = key;
    this.keyType = key.startsWith(PUBLISHABLE_PREFIX) ? 'publishable' : 'secret';
    this.opts = {
      autoAck: true,
      reconnectDelayMs: 1000,
      maxReconnectDelayMs: 30_000,
      idleTimeoutMs: 45_000,
      timeoutMs: 15_000,
      ...options,
    };
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const f = options.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
    if (!f) throw new Error('Dev AppStore : aucune implémentation fetch disponible (passez options.fetch).');
    this.fetchImpl = f;
  }

  // ---------------------------------------------------------- Liaison et jeton joueur

  /**
   * Demande un code de liaison à afficher dans le jeu ; le joueur le saisit sur Dev AppStore.
   * Avec la clé publique, passez ensuite le résultat à `waitForLink` pour obtenir le jeton joueur.
   */
  requestLinkCode(playerId: string, playerName?: string): Promise<LinkCode> {
    const body: Record<string, string> = { player_id: playerId };
    if (playerName) body.player_name = playerName;
    return this.request<LinkCode>('POST', '/api/v1/link-codes', body);
  }

  /** État d'une demande de liaison. Un `player_token` reçu (clé publique, une seule fois) est mémorisé. */
  async getLinkRequest(linkRequestId: string): Promise<LinkRequestStatus> {
    const res = await this.request<LinkRequestStatus>('GET', `/api/v1/link-requests/${encodeURIComponent(linkRequestId)}`);
    if (res?.player_token && res.player_id) this.setPlayerToken(res.player_id, res.player_token);
    return res;
  }

  /**
   * Attend que le joueur ait saisi le code sur Dev AppStore (interrogation toutes les 3 s) et renvoie le jeton joueur
   * (clé publique, mémorisé : `onPurchase` démarre alors tout seul) ou null (clé secrète : la liaison est faite).
   * Lève `DevAppStoreError` : `link_expired` (code expiré), `link_already_claimed`, `link_timeout`, `aborted`.
   */
  async waitForLink(link: LinkCode | string, options: WaitForLinkOptions = {}): Promise<string | null> {
    const id = typeof link === 'string' ? link : link.link_request_id;
    if (!id) throw new DevAppStoreError('Réponse sans link_request_id : mettez Dev AppStore à jour.', 0, 'no_link_request');
    const interval = Math.max(1000, options.intervalMs ?? 3000);
    const expires = typeof link === 'string' ? NaN : Date.parse(link.expires_at);
    const deadline = Date.now() + (options.timeoutMs ?? (Number.isFinite(expires) ? Math.max(0, expires - Date.now()) + 30_000 : 11 * 60_000));
    for (;;) {
      const r = await this.getLinkRequest(id);
      if (r.status === 'linked') return r.player_token ?? (this.keyType === 'publishable' && r.player_id ? this.getPlayerToken(r.player_id) : null);
      if (r.status === 'claimed') {
        const known = r.player_id ? this.getPlayerToken(r.player_id) : null;
        if (known) return known;
        throw new DevAppStoreError('Le jeton de cette liaison a déjà été délivré : demandez un nouveau code.', 409, 'link_already_claimed');
      }
      if (r.status === 'expired') throw new DevAppStoreError('Code expiré : demandez-en un nouveau.', 410, 'link_expired');
      if (Date.now() + interval > deadline) throw new DevAppStoreError('Le code n’a pas été saisi à temps.', 408, 'link_timeout');
      await sleep(interval, options.signal);
    }
  }

  /** Jeton joueur mémorisé pour ce joueur (clé publique), ou null. */
  getPlayerToken(playerId: string): string | null {
    if (!this.tokens.has(playerId)) {
      const stored = safeGet(this.opts.storage, tokenKey(playerId));
      this.tokens.set(playerId, stored && stored.startsWith('das_pt_') ? stored : null);
    }
    return this.tokens.get(playerId) ?? null;
  }

  /** Mémorise (ou efface, avec null) le jeton joueur — ex. jeton obtenu par votre propre écran de liaison. */
  setPlayerToken(playerId: string, token: string | null): void {
    const before = this.getPlayerToken(playerId);
    this.tokens.set(playerId, token);
    if (token) safeSet(this.opts.storage, tokenKey(playerId), token);
    else safeRemove(this.opts.storage, tokenKey(playerId));
    if (before === token) return;
    for (const l of [...(this.tokenListeners.get(playerId) ?? [])]) {
      try {
        l(token);
      } catch (e) {
        this._reportError(e);
      }
    }
  }

  /** Vrai si les achats de ce joueur sont accessibles (clé secrète, ou jeton joueur présent). */
  isLinked(playerId: string): boolean {
    return this.keyType === 'secret' || !!this.getPlayerToken(playerId);
  }

  /**
   * Délie : clé publique → révoque le jeton de cet appareil et l'oublie ; clé secrète (serveur) → révoque tous les
   * jetons joueur de ce player_id. Renvoie le nombre de jetons révoqués côté serveur.
   */
  async unlink(playerId: string): Promise<number> {
    if (this.keyType === 'secret') {
      const r = await this.request<{ revoked: number }>('DELETE', `/api/v1/player-tokens?player_id=${encodeURIComponent(playerId)}`);
      return r?.revoked ?? 0;
    }
    if (!this.getPlayerToken(playerId)) return 0;
    try {
      const r = await this.request<{ revoked: number }>('DELETE', '/api/v1/player-tokens', undefined, playerId);
      return r?.revoked ?? 0;
    } catch (e) {
      if (e instanceof DevAppStoreError && e.code === 'player_token_required') return 0; // déjà révoqué
      throw e;
    } finally {
      this.setPlayerToken(playerId, null);
    }
  }

  // ---------------------------------------------------------------- Livraisons

  /** Livraisons pending + delivered non acquittées du joueur (achats et remboursements). */
  async getPendingPurchases(playerId: string): Promise<PurchaseEvent[]> {
    const res = await this.request<{ data: PurchaseEvent[] }>('GET', `/api/v1/deliveries?player_id=${encodeURIComponent(playerId)}`, undefined, playerId);
    return Array.isArray(res?.data) ? res.data : [];
  }

  /**
   * Confirme que l'achat a été crédité (ou le remboursement appliqué) : statut `acknowledged`.
   * Clé publique : `playerId` désigne le jeton à utiliser (facultatif si un seul joueur est lié).
   */
  ack(deliveryId: string, playerId?: string): Promise<{ ok: true }> {
    let pid = playerId;
    if (this.keyType === 'publishable' && pid === undefined) {
      const linked = [...this.tokens.entries()].filter(([, t]) => !!t).map(([p]) => p);
      if (linked.length === 1) pid = linked[0];
    }
    return this.request<{ ok: true }>('POST', `/api/v1/deliveries/${encodeURIComponent(deliveryId)}/ack`, undefined, pid);
  }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, playerId?: string): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.key}`, accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.keyType === 'publishable' && playerId !== undefined && path.startsWith('/api/v1/') && !path.startsWith('/api/v1/link-')) {
      const token = this.getPlayerToken(playerId);
      if (!token) throw tokenRequired();
      headers[PLAYER_TOKEN_HEADER] = token;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new DevAppStoreError(`Dev AppStore injoignable : ${e instanceof Error ? e.message : String(e)}`, 0, 'network_error');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      /* corps non JSON */
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | undefined)?.error;
      const error = new DevAppStoreError(err?.message ?? `HTTP ${res.status}`, res.status, err?.code ?? 'http_error');
      // Jeton révoqué ou invalide : on l'oublie, le jeu doit refaire la liaison.
      if (error.code === 'player_token_required' && playerId !== undefined && headers[PLAYER_TOKEN_HEADER]) this.setPlayerToken(playerId, null);
      throw error;
    }
    return json as T;
  }

  // ---------------------------------------------------------- Temps réel

  /**
   * Écoute les achats du joueur : flux SSE temps réel, rattrapage immédiat, puis à chaque reconnexion et
   * quand l'onglet redevient visible. Chaque `delivery_id` n'est passé qu'une fois au handler ; après sa
   * résolution, l'achat est acquitté automatiquement (`autoAck`). Si le handler lève une erreur, rien n'est
   * acquitté : la livraison sera proposée de nouveau au prochain rattrapage.
   * Clé publique sans jeton : l'abonnement attend la liaison (`waitForLink`) et démarre tout seul ensuite ;
   * un jeton révoqué le remet en attente.
   */
  onPurchase(playerId: string, handler: PurchaseHandler): PurchaseSubscription {
    if (!playerId) throw new Error('Dev AppStore : playerId est obligatoire.');
    return new Subscription(this, playerId, handler);
  }

  /** @internal */
  _ctx() {
    return { opts: this.opts, fetchImpl: this.fetchImpl, baseUrl: this.baseUrl, key: this.key, keyType: this.keyType };
  }

  /** @internal */
  _onTokenChange(playerId: string, listener: (token: string | null) => void): () => void {
    let set = this.tokenListeners.get(playerId);
    if (!set) this.tokenListeners.set(playerId, (set = new Set()));
    set.add(listener);
    return () => set!.delete(listener);
  }

  /** @internal Ensemble des livraisons déjà traitées (chargé depuis `storage`). */
  _processed(playerId: string): Set<string> {
    let set = this.processed.get(playerId);
    if (!set) {
      set = new Set<string>();
      const raw = safeGet(this.opts.storage, storageKey(playerId));
      if (raw) {
        try {
          for (const id of JSON.parse(raw) as string[]) if (typeof id === 'string') set.add(id);
        } catch {
          /* ignoré */
        }
      }
      this.processed.set(playerId, set);
    }
    return set;
  }

  /** @internal */
  _markProcessed(playerId: string, deliveryId: string) {
    const set = this._processed(playerId);
    set.add(deliveryId);
    if (set.size > PROCESSED_KEEP) {
      const first = set.values().next().value;
      if (first !== undefined) set.delete(first);
    }
    safeSet(this.opts.storage, storageKey(playerId), JSON.stringify([...set]));
  }

  /** @internal */
  _reportError(e: unknown) {
    try {
      this.opts.onError?.(e);
    } catch {
      /* le callback d'erreur ne doit jamais casser le SDK */
    }
  }
}

const storageKey = (playerId: string) => `devappstore:processed:${playerId}`;
const tokenKey = (playerId: string) => `devappstore:player-token:${playerId}`;
function safeGet(s: StorageLike | null | undefined, k: string) {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
}
function safeSet(s: StorageLike | null | undefined, k: string, v: string) {
  try {
    s?.setItem(k, v);
  } catch {
    /* stockage plein ou interdit */
  }
}
function safeRemove(s: StorageLike | null | undefined, k: string) {
  try {
    const r = s as (StorageLike & { removeItem?: (key: string) => void }) | null | undefined;
    if (typeof r?.removeItem === 'function') r.removeItem(k);
    else r?.setItem(k, '');
  } catch {
    /* stockage interdit */
  }
}

class Subscription implements PurchaseSubscription {
  private closed = false;
  private _connected = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private abort: AbortController | undefined;
  private es: EventSourceLike | undefined;
  private queue: Promise<void> = Promise.resolve();
  private readonly inflight = new Set<string>();
  /** Acquittés pendant cette session (évite de renvoyer un ack déjà accepté). */
  private readonly acked = new Set<string>();
  /** Vrai après la première connexion : les suivantes déclenchent un rattrapage. */
  private attemptedBefore = false;
  /** Clé publique sans jeton joueur : en attente de la liaison. */
  private waitingForToken = false;
  private foregroundBound = false;
  private readonly detach: Array<() => void> = [];

  constructor(
    private readonly client: DevAppStore,
    private readonly playerId: string,
    private readonly handler: PurchaseHandler,
  ) {
    this.detach.push(client._onTokenChange(playerId, (token) => this.onToken(token)));
    if (!client.isLinked(playerId)) {
      this.waitingForToken = true;
      client._reportError(tokenRequired());
      return;
    }
    this.start();
  }

  get connected() {
    return this._connected;
  }

  unsubscribe(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopTransport();
    for (const d of this.detach) d();
  }

  async catchUp(): Promise<void> {
    if (this.closed || this.waitingForToken) return;
    try {
      const events = await this.client.getPendingPurchases(this.playerId);
      await Promise.all(events.map((e) => this.process(e)));
    } catch (e) {
      this.client._reportError(e);
    }
  }

  private start() {
    this.waitingForToken = false;
    this.attempt = 0;
    this.attemptedBefore = false;
    this.catchUp().catch(() => {});
    this.connect();
    if (!this.foregroundBound) {
      this.foregroundBound = true;
      this.listenForeground();
    }
  }

  /** Jeton reçu (liaison) → démarrage ; jeton effacé (révoqué, `unlink`) → mise en attente. */
  private onToken(token: string | null) {
    if (this.closed) return;
    if (token && this.waitingForToken) this.start();
    else if (!token && this.client._ctx().keyType === 'publishable' && !this.waitingForToken) {
      this.waitingForToken = true;
      this.stopTransport();
    }
  }

  private stopTransport() {
    this._connected = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    clearTimeout(this.idleTimer);
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    const ctrl = this.abort;
    this.abort = undefined;
    ctrl?.abort();
    this.es?.close();
    this.es = undefined;
  }

  /** Dédoublonne, appelle le handler (en série), puis acquitte. */
  private process(e: PurchaseEvent): Promise<void> {
    if (this.closed || !e || typeof e.delivery_id !== 'string') return Promise.resolve();
    const id = e.delivery_id;
    const { autoAck } = this.client._ctx().opts;
    if (this.client._processed(this.playerId).has(id)) {
      // Déjà crédité mais renvoyé par le serveur : l'ack précédent s'est perdu, on le renvoie sans recréditer.
      if (!autoAck || this.acked.has(id)) return Promise.resolve();
      return this.ackOnce(id);
    }
    if (this.inflight.has(id)) return Promise.resolve();
    this.inflight.add(id);
    const run = async () => {
      try {
        if (this.closed) return;
        await this.handler(e);
        this.client._markProcessed(this.playerId, id);
      } catch (err) {
        this.client._reportError(err);
        return;
      } finally {
        this.inflight.delete(id);
      }
      if (autoAck) await this.ackOnce(id);
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => {});
    return p;
  }

  private async ackOnce(id: string) {
    try {
      await this.client.ack(id, this.playerId);
      this.acked.add(id);
    } catch (err) {
      this.client._reportError(err);
    }
  }

  // ------------------------------------------------------------ connexion

  private streamUrl() {
    return `${this.client._ctx().baseUrl}/api/v1/deliveries/stream?player_id=${encodeURIComponent(this.playerId)}`;
  }

  /** La clé et le jeton voyagent TOUJOURS en en-têtes, jamais dans l'URL. */
  private headers(): Record<string, string> | null {
    const { key, keyType } = this.client._ctx();
    const h: Record<string, string> = { authorization: `Bearer ${key}`, accept: 'text/event-stream' };
    if (keyType === 'publishable') {
      const token = this.client.getPlayerToken(this.playerId);
      if (!token) return null;
      h[PLAYER_TOKEN_HEADER] = token;
    }
    return h;
  }

  /**
   * - `fetch` : flux lu via fetch + ReadableStream (en-têtes possibles) ;
   * - `eventsource` : constructeur fourni en option acceptant `{ headers }` (polyfill) ;
   * - `none` : aucun transport capable d'envoyer des en-têtes (EventSource natif seul) → rattrapage périodique.
   */
  private pickTransport(): { kind: 'fetch' } | { kind: 'eventsource'; ctor: EventSourceCtor } | { kind: 'none' } {
    const { opts } = this.client._ctx();
    const fetchStream = typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined';
    const t = opts.transport ?? 'auto';
    if (t === 'fetch') return { kind: 'fetch' };
    if (opts.EventSource) return { kind: 'eventsource', ctor: opts.EventSource };
    return fetchStream ? { kind: 'fetch' } : { kind: 'none' };
  }

  private connect() {
    if (this.closed || this.waitingForToken) return;
    const t = this.pickTransport();
    if (t.kind === 'fetch') this.connectFetch();
    else if (t.kind === 'eventsource') this.connectEventSource(t.ctor);
    else if (!this.pollTimer) {
      this.client._reportError(new DevAppStoreError('Flux temps réel indisponible ici : rattrapage toutes les 30 s.', 0, 'realtime_unavailable'));
      this.pollTimer = setInterval(() => this.catchUp().catch(() => {}), FALLBACK_POLL_MS);
    }
  }

  private onOpen() {
    this._connected = true;
    this.attempt = 0;
    this.bumpIdle();
  }

  private bumpIdle() {
    const { idleTimeoutMs } = this.client._ctx().opts;
    clearTimeout(this.idleTimer);
    if (!idleTimeoutMs || this.closed) return;
    this.idleTimer = setTimeout(() => {
      const ctrl = this.abort;
      this.abort = undefined; // la boucle de lecture abandonnée ne replanifie pas elle-même
      ctrl?.abort();
      this.es?.close();
      this.es = undefined;
      this.scheduleReconnect();
    }, idleTimeoutMs);
  }

  private handleSse(type: string, data: string) {
    if (type !== 'purchase') return;
    let e: PurchaseEvent;
    try {
      e = JSON.parse(data) as PurchaseEvent;
    } catch (err) {
      this.client._reportError(err);
      return;
    }
    this.process(e).catch(() => {});
  }

  private async connectFetch() {
    const { fetchImpl } = this.client._ctx();
    const headers = this.headers();
    if (!headers) return;
    const ctrl = new AbortController();
    this.abort = ctrl;
    try {
      const res = await fetchImpl(this.streamUrl(), { headers, signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok || !res.body) {
        let code = 'http_error';
        let message = `Flux indisponible (HTTP ${res.status})`;
        try {
          const j = (await res.json()) as { error?: { code?: string; message?: string } };
          code = j.error?.code ?? code;
          message = j.error?.message ?? message;
        } catch {
          /* corps non JSON */
        }
        throw new DevAppStoreError(message, res.status, code);
      }
      this.onOpen();
      if (this.attemptedBefore) this.catchUp().catch(() => {});
      this.attemptedBefore = true;
      const parser = new SseParser((ev) => this.handleSse(ev.event, ev.data));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.bumpIdle();
        parser.feed(decoder.decode(value, { stream: true }));
      }
      parser.feed(decoder.decode());
    } catch (e) {
      if (this.closed || this.abort !== ctrl) return;
      if (!(e instanceof Error && e.name === 'AbortError')) this.client._reportError(e);
      if (isFatal(e)) {
        this._connected = false;
        // Jeton révoqué : on l'oublie (l'abonnement se remet en attente de liaison). Clé invalide : on arrête.
        if (e instanceof DevAppStoreError && e.code === 'player_token_required') this.client.setPlayerToken(this.playerId, null);
        return;
      }
    }
    if (this.abort !== ctrl) return; // une autre connexion a pris le relais
    this.scheduleReconnect();
  }

  private connectEventSource(ctor: EventSourceCtor) {
    const headers = this.headers();
    if (!headers) return;
    const es = new ctor(this.streamUrl(), { headers });
    this.es = es;
    es.onopen = () => {
      if (this.es !== es) return;
      this.onOpen();
      if (this.attemptedBefore) this.catchUp().catch(() => {});
      this.attemptedBefore = true;
    };
    es.addEventListener('purchase', (m) => {
      if (this.es !== es) return;
      this.bumpIdle();
      this.handleSse('purchase', m.data);
    });
    es.onerror = () => {
      if (this.es !== es) return;
      // On ferme et on gère nous-mêmes la reconnexion exponentielle.
      es.close();
      this.es = undefined;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.closed || this.waitingForToken) return;
    this._connected = false;
    clearTimeout(this.idleTimer);
    clearTimeout(this.reconnectTimer);
    const { reconnectDelayMs, maxReconnectDelayMs } = this.client._ctx().opts;
    const base = Math.min(maxReconnectDelayMs, reconnectDelayMs * 2 ** this.attempt);
    const delay = Math.round(base / 2 + (Math.random() * base) / 2); // gigue pour éviter les rafales
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  /** Reconnexion immédiate (retour au premier plan, réseau revenu). */
  private reconnectNow() {
    if (this.closed || this._connected || this.waitingForToken) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
      this.attempt = 0;
      this.connect();
    }
  }

  private listenForeground() {
    const doc = (globalThis as { document?: Document }).document;
    if (doc && typeof doc.addEventListener === 'function') {
      const onVisible = () => {
        if (doc.visibilityState !== 'visible') return;
        this.catchUp().catch(() => {});
        this.reconnectNow();
      };
      doc.addEventListener('visibilitychange', onVisible);
      this.detach.push(() => doc.removeEventListener('visibilitychange', onVisible));
    }
    const win = (globalThis as { window?: Window }).window;
    if (win && typeof win.addEventListener === 'function') {
      const onOnline = () => {
        this.catchUp().catch(() => {});
        this.reconnectNow();
      };
      win.addEventListener('online', onOnline);
      this.detach.push(() => win.removeEventListener('online', onOnline));
    }
  }
}
