import { SseParser } from './sse.js';
import type {
  EventSourceCtor,
  EventSourceLike,
  LinkCode,
  PurchaseEvent,
  PurchaseHandler,
  PurchaseSubscription,
  StorageLike,
  WolleenOptions,
} from './types.js';

export const SDK_VERSION = '0.1.0';
const DEFAULT_BASE_URL = 'https://wolleen.com';
const PROCESSED_KEEP = 500;

/** Erreur renvoyée par l'API Wolleen (`{ error: { code, message } }`) ou par le transport. */
export class WolleenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'WolleenError';
  }
}

/** Erreurs qui ne se corrigent pas en réessayant (clé invalide, paramètre manquant…). */
function isFatal(e: unknown) {
  return e instanceof WolleenError && (e.status === 400 || e.status === 401 || e.status === 403 || e.status === 404);
}

/**
 * Client Wolleen pour le jeu (navigateur, WebView, Node ≥ 20). Aucune dépendance.
 *
 * ```ts
 * const wolleen = new Wolleen({ apiKey: 'wk_…', baseUrl: 'https://wolleen.com' });
 * const sub = wolleen.onPurchase(playerId, async (e) => inventory.add(e.product_id, e.quantity));
 * ```
 */
export class Wolleen {
  readonly baseUrl: string;
  private readonly opts: Required<Pick<WolleenOptions, 'autoAck' | 'reconnectDelayMs' | 'maxReconnectDelayMs' | 'idleTimeoutMs' | 'timeoutMs'>> &
    WolleenOptions;
  private readonly fetchImpl: typeof fetch;
  /** delivery_id déjà crédités, par joueur. */
  private readonly processed = new Map<string, Set<string>>();

  constructor(options: WolleenOptions) {
    if (!options?.apiKey) throw new Error('Wolleen : apiKey est obligatoire.');
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
    if (!f) throw new Error('Wolleen : aucune implémentation fetch disponible (passez options.fetch).');
    this.fetchImpl = f;
  }

  // ---------------------------------------------------------------- API REST

  /** Demande un code de liaison à afficher dans le jeu ; le joueur le saisit sur Wolleen. */
  requestLinkCode(playerId: string, playerName?: string): Promise<LinkCode> {
    const body: Record<string, string> = { player_id: playerId };
    if (playerName) body.player_name = playerName;
    return this.request<LinkCode>('POST', '/api/v1/link-codes', body);
  }

  /** Livraisons pending + delivered non acquittées du joueur. */
  async getPendingPurchases(playerId: string): Promise<PurchaseEvent[]> {
    const res = await this.request<{ data: PurchaseEvent[] }>('GET', `/api/v1/deliveries?player_id=${encodeURIComponent(playerId)}`);
    return Array.isArray(res?.data) ? res.data : [];
  }

  /** Confirme que l'achat a été crédité (statut `acknowledged`). */
  ack(deliveryId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>('POST', `/api/v1/deliveries/${encodeURIComponent(deliveryId)}/ack`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new WolleenError(`Wolleen injoignable : ${e instanceof Error ? e.message : String(e)}`, 0, 'network_error');
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
      throw new WolleenError(err?.message ?? `HTTP ${res.status}`, res.status, err?.code ?? 'http_error');
    }
    return json as T;
  }

  // ---------------------------------------------------------- Temps réel

  /**
   * Écoute les achats du joueur : flux SSE temps réel, rattrapage immédiat, puis à chaque reconnexion et
   * quand l'onglet redevient visible. Chaque `delivery_id` n'est passé qu'une fois au handler ; après sa
   * résolution, l'achat est acquitté automatiquement (`autoAck`). Si le handler lève une erreur, rien n'est
   * acquitté : la livraison sera proposée de nouveau au prochain rattrapage.
   */
  onPurchase(playerId: string, handler: PurchaseHandler): PurchaseSubscription {
    if (!playerId) throw new Error('Wolleen : playerId est obligatoire.');
    return new Subscription(this, playerId, handler);
  }

  /** @internal */
  _ctx() {
    return { opts: this.opts, fetchImpl: this.fetchImpl, baseUrl: this.baseUrl };
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

const storageKey = (playerId: string) => `wolleen:processed:${playerId}`;
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

class Subscription implements PurchaseSubscription {
  private closed = false;
  private _connected = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private abort: AbortController | undefined;
  private es: EventSourceLike | undefined;
  private queue: Promise<void> = Promise.resolve();
  private readonly inflight = new Set<string>();
  /** Acquittés pendant cette session (évite de renvoyer un ack déjà accepté). */
  private readonly acked = new Set<string>();
  /** Vrai après la première connexion : les suivantes déclenchent un rattrapage. */
  private attemptedBefore = false;
  private readonly detach: Array<() => void> = [];

  constructor(
    private readonly client: Wolleen,
    private readonly playerId: string,
    private readonly handler: PurchaseHandler,
  ) {
    this.catchUp().catch(() => {});
    this.connect();
    this.listenForeground();
  }

  get connected() {
    return this._connected;
  }

  unsubscribe(): void {
    if (this.closed) return;
    this.closed = true;
    this._connected = false;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.idleTimer);
    this.abort?.abort();
    this.es?.close();
    for (const d of this.detach) d();
  }

  async catchUp(): Promise<void> {
    if (this.closed) return;
    try {
      const events = await this.client.getPendingPurchases(this.playerId);
      await Promise.all(events.map((e) => this.process(e)));
    } catch (e) {
      this.client._reportError(e);
    }
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
      await this.client.ack(id);
      this.acked.add(id);
    } catch (err) {
      this.client._reportError(err);
    }
  }

  // ------------------------------------------------------------ connexion

  private streamUrl() {
    return `${this.client._ctx().baseUrl}/api/v1/deliveries/stream?player_id=${encodeURIComponent(this.playerId)}`;
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.client._ctx().opts.apiKey}`, accept: 'text/event-stream' };
  }

  private pickTransport(): { kind: 'fetch' } | { kind: 'eventsource'; ctor: EventSourceCtor; headersSupported: boolean } {
    const { opts } = this.client._ctx();
    const globalEs = (globalThis as { EventSource?: EventSourceCtor }).EventSource;
    const fetchStream = typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined';
    const t = opts.transport ?? 'auto';
    if (t === 'fetch') return { kind: 'fetch' };
    if (opts.EventSource) return { kind: 'eventsource', ctor: opts.EventSource, headersSupported: true };
    if (t === 'eventsource' || !fetchStream) {
      if (globalEs) return { kind: 'eventsource', ctor: globalEs, headersSupported: false };
    }
    return { kind: 'fetch' };
  }

  private connect() {
    if (this.closed) return;
    const t = this.pickTransport();
    if (t.kind === 'fetch') this.connectFetch();
    else this.connectEventSource(t.ctor, t.headersSupported);
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
    const ctrl = new AbortController();
    this.abort = ctrl;
    try {
      const res = await fetchImpl(this.streamUrl(), { headers: this.headers(), signal: ctrl.signal, cache: 'no-store' });
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
        throw new WolleenError(message, res.status, code);
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
        return; // clé invalide : inutile d'insister
      }
    }
    if (this.abort !== ctrl) return; // une autre connexion a pris le relais
    this.scheduleReconnect();
  }

  private connectEventSource(ctor: EventSourceCtor, headersSupported: boolean) {
    let url = this.streamUrl();
    // L'EventSource natif ne permet pas d'en-têtes : la clé passe alors en paramètre (le serveur doit l'accepter).
    if (!headersSupported) url += `&access_token=${encodeURIComponent(this.client._ctx().opts.apiKey)}`;
    const es = new ctor(url, headersSupported ? { headers: this.headers() } : undefined);
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
    if (this.closed) return;
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
    if (this.closed || this._connected) return;
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
