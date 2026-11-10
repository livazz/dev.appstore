import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevAppStore, DevAppStoreError, type EventSourceLike, type PurchaseEvent, type PurchaseSubscription, type SseMessage } from './index';

const BASE = 'http://devappstore.test';

function purchase(id: string, over: Partial<PurchaseEvent> = {}): PurchaseEvent {
  return {
    event: 'purchase.completed',
    delivery_id: id,
    order_id: `ord_${id}`,
    game_id: 'gam_farm',
    player_id: 'p1',
    product_id: 'seeds_50',
    item_type: 'consumable',
    quantity: 50,
    amount_cents: 199,
    currency: 'EUR',
    created_at: '2026-11-09T10:00:00.000Z',
    ...over,
  };
}

/** Flux SSE contrôlable par le test. */
function controllableStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  return {
    body,
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    sendPurchase: (e: PurchaseEvent) => ctrl.enqueue(enc.encode(`event: purchase\nid: ${e.delivery_id}\ndata: ${JSON.stringify(e)}\n\n`)),
    end: () => ctrl.close(),
  };
}

type Call = { method: string; url: string; headers: Record<string, string>; body?: string };

/** Faux serveur Dev AppStore : livraisons en attente, acks, flux. */
function fakeDevAppStore(opts: { pending?: PurchaseEvent[]; streamStatus?: number } = {}) {
  const calls: Call[] = [];
  const pending = new Map((opts.pending ?? []).map((e) => [e.delivery_id, e]));
  const streams: ReturnType<typeof controllableStream>[] = [];
  const acked: string[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method, url, headers, body: init?.body as string | undefined });
    const path = url.slice(BASE.length);
    if (headers.authorization !== 'Bearer das_test') return Response.json({ error: { code: 'unauthorized', message: 'Clé invalide' } }, { status: 401 });
    if (path.startsWith('/api/v1/deliveries/stream')) {
      if (opts.streamStatus) return Response.json({ error: { code: 'nope', message: 'non' } }, { status: opts.streamStatus });
      const s = controllableStream();
      streams.push(s);
      init?.signal?.addEventListener('abort', () => {
        try {
          s.end();
        } catch {
          /* déjà fermé */
        }
      });
      return new Response(s.body, { headers: { 'content-type': 'text/event-stream' } });
    }
    if (path.startsWith('/api/v1/deliveries?')) return Response.json({ data: [...pending.values()] });
    const m = path.match(/^\/api\/v1\/deliveries\/([^/]+)\/ack$/);
    if (m && method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      acked.push(id);
      pending.delete(id);
      return Response.json({ ok: true });
    }
    if (path === '/api/v1/link-codes' && method === 'POST') return Response.json({ code: 'K7QF-M2XA', expires_at: '2026-11-09T10:10:00.000Z' });
    return Response.json({ error: { code: 'not_found', message: 'Introuvable' } }, { status: 404 });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, pending, streams, acked };
}

const subs: PurchaseSubscription[] = [];
afterEach(() => {
  while (subs.length) subs.pop()!.unsubscribe();
});

function client(srv: ReturnType<typeof fakeDevAppStore>, extra: Partial<ConstructorParameters<typeof DevAppStore>[0]> = {}) {
  return new DevAppStore({ apiKey: 'das_test', baseUrl: `${BASE}/`, fetch: srv.fetch, reconnectDelayMs: 5, maxReconnectDelayMs: 20, ...extra });
}

describe('API REST', () => {
  it('demande un code de liaison', async () => {
    const srv = fakeDevAppStore();
    const res = await client(srv).requestLinkCode('#2PP8QL9', 'Ali');
    expect(res).toEqual({ code: 'K7QF-M2XA', expires_at: '2026-11-09T10:10:00.000Z' });
    const c = srv.calls[0]!;
    expect(c.method).toBe('POST');
    expect(c.url).toBe(`${BASE}/api/v1/link-codes`);
    expect(c.headers.authorization).toBe('Bearer das_test');
    expect(JSON.parse(c.body!)).toEqual({ player_id: '#2PP8QL9', player_name: 'Ali' });
  });

  it('récupère les achats en attente (player_id encodé)', async () => {
    const srv = fakeDevAppStore({ pending: [purchase('dlv_1')] });
    const list = await client(srv).getPendingPurchases('#2PP8QL9');
    expect(list.map((e) => e.delivery_id)).toEqual(['dlv_1']);
    expect(srv.calls[0]!.url).toBe(`${BASE}/api/v1/deliveries?player_id=%232PP8QL9`);
  });

  it('acquitte une livraison', async () => {
    const srv = fakeDevAppStore();
    await expect(client(srv).ack('dlv/1')).resolves.toEqual({ ok: true });
    expect(srv.calls[0]!.url).toBe(`${BASE}/api/v1/deliveries/dlv%2F1/ack`);
  });

  it('transforme les erreurs API en DevAppStoreError', async () => {
    const srv = fakeDevAppStore();
    const w = new DevAppStore({ apiKey: 'mauvaise', baseUrl: BASE, fetch: srv.fetch });
    const err = await w.getPendingPurchases('p1').catch((e) => e);
    expect(err).toBeInstanceOf(DevAppStoreError);
    expect(err).toMatchObject({ status: 401, code: 'unauthorized', message: 'Clé invalide' });
  });

  it('signale une erreur réseau', async () => {
    const w = new DevAppStore({ apiKey: 'k', baseUrl: BASE, fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
    await expect(w.ack('x')).rejects.toMatchObject({ code: 'network_error', status: 0 });
  });

  it('exige une clé API', () => {
    expect(() => new DevAppStore({ apiKey: '' })).toThrow();
  });
});

describe('onPurchase', () => {
  it('rattrape les achats au démarrage, appelle le handler puis acquitte', async () => {
    const srv = fakeDevAppStore({ pending: [purchase('dlv_1')] });
    const order: string[] = [];
    const sub = client(srv).onPurchase('p1', async (e) => {
      order.push(`handler:${e.delivery_id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`credited:${e.delivery_id}`);
    });
    subs.push(sub);
    await vi.waitFor(() => expect(srv.acked).toEqual(['dlv_1']));
    expect(order).toEqual(['handler:dlv_1', 'credited:dlv_1']);
  });

  it('reçoit les achats en direct par le flux et dédoublonne par delivery_id', async () => {
    const srv = fakeDevAppStore();
    const handler = vi.fn();
    const sub = client(srv).onPurchase('p1', handler);
    subs.push(sub);
    await vi.waitFor(() => expect(sub.connected).toBe(true));
    const s = srv.streams[0]!;
    s.push(': ping\n\n');
    s.sendPurchase(purchase('dlv_2'));
    s.sendPurchase(purchase('dlv_2')); // doublon
    await vi.waitFor(() => expect(srv.acked).toContain('dlv_2'));
    // Le même achat revient par le rattrapage : pas de second crédit.
    srv.pending.set('dlv_2', purchase('dlv_2'));
    await sub.catchUp();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({ delivery_id: 'dlv_2', quantity: 50 });
  });

  it("n'acquitte pas si le handler échoue et retente au rattrapage suivant", async () => {
    const srv = fakeDevAppStore({ pending: [purchase('dlv_3')] });
    const onError = vi.fn();
    let fail = true;
    const handler = vi.fn(async () => {
      if (fail) throw new Error('inventaire indisponible');
    });
    const sub = client(srv, { onError }).onPurchase('p1', handler);
    subs.push(sub);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(srv.acked).toEqual([]);
    fail = false;
    await sub.catchUp();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(srv.acked).toEqual(['dlv_3']);
  });

  it('autoAck: false laisse le jeu acquitter lui-même', async () => {
    const srv = fakeDevAppStore({ pending: [purchase('dlv_4')] });
    const handler = vi.fn();
    subs.push(client(srv, { autoAck: false }).onPurchase('p1', handler));
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(srv.acked).toEqual([]);
  });

  it('traite les achats en série', async () => {
    const srv = fakeDevAppStore({ pending: [purchase('a'), purchase('b'), purchase('c')] });
    let running = 0;
    let max = 0;
    const seen: string[] = [];
    subs.push(
      client(srv).onPurchase('p1', async (e) => {
        running++;
        max = Math.max(max, running);
        await new Promise((r) => setTimeout(r, 3));
        seen.push(e.delivery_id);
        running--;
      }),
    );
    await vi.waitFor(() => expect(srv.acked).toHaveLength(3));
    expect(max).toBe(1);
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('se reconnecte quand le flux se coupe et rattrape les achats manqués', async () => {
    const srv = fakeDevAppStore();
    const handler = vi.fn();
    const sub = client(srv).onPurchase('p1', handler);
    subs.push(sub);
    await vi.waitFor(() => expect(srv.streams).toHaveLength(1));
    await vi.waitFor(() => expect(sub.connected).toBe(true));
    // Un achat arrive pendant la coupure.
    srv.pending.set('dlv_5', purchase('dlv_5'));
    srv.streams[0]!.end();
    await vi.waitFor(() => expect(srv.streams).toHaveLength(2));
    await vi.waitFor(() => expect(srv.acked).toEqual(['dlv_5']));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('applique un délai de reconnexion exponentiel', async () => {
    vi.useFakeTimers();
    try {
      let streamCalls = 0;
      const fetch = (async (input: RequestInfo | URL) => {
        if (String(input).includes('/stream')) {
          streamCalls++;
          throw new TypeError('réseau coupé');
        }
        return Response.json({ data: [] });
      }) as typeof globalThis.fetch;
      vi.spyOn(Math, 'random').mockReturnValue(0.999999);
      const sub = new DevAppStore({ apiKey: 'k', baseUrl: BASE, fetch, reconnectDelayMs: 100, maxReconnectDelayMs: 400 }).onPurchase('p1', () => {});
      subs.push(sub);
      await vi.advanceTimersByTimeAsync(0);
      expect(streamCalls).toBe(1);
      await vi.advanceTimersByTimeAsync(99);
      expect(streamCalls).toBe(1);
      await vi.advanceTimersByTimeAsync(1); // +100 ms
      expect(streamCalls).toBe(2);
      await vi.advanceTimersByTimeAsync(200); // +200 ms
      expect(streamCalls).toBe(3);
      await vi.advanceTimersByTimeAsync(399);
      expect(streamCalls).toBe(3);
      await vi.advanceTimersByTimeAsync(1); // +400 ms
      expect(streamCalls).toBe(4);
      await vi.advanceTimersByTimeAsync(400); // plafonné à 400 ms
      expect(streamCalls).toBe(5);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("abandonne la connexion si la clé est refusée (pas de boucle infinie)", async () => {
    const srv = fakeDevAppStore({ streamStatus: 401 });
    const onError = vi.fn();
    const sub = client(srv, { onError }).onPurchase('p1', () => {});
    subs.push(sub);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 401 })));
    await new Promise((r) => setTimeout(r, 50));
    expect(srv.calls.filter((c) => c.url.includes('/stream'))).toHaveLength(1);
  });

  it('retient les livraisons traitées dans le storage (redémarrage du jeu)', async () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    // 1re session : crédit OK mais l'ack échoue (réseau coupé).
    const srv1 = fakeDevAppStore({ pending: [purchase('dlv_6')] });
    const failingAck = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/ack')) throw new TypeError('coupé');
      return srv1.fetch(input, init);
    }) as typeof fetch;
    const h1 = vi.fn();
    const s1 = new DevAppStore({ apiKey: 'das_test', baseUrl: BASE, fetch: failingAck, storage, onError: () => {} }).onPurchase('p1', h1);
    subs.push(s1);
    await vi.waitFor(() => expect(mem.get('devappstore:processed:p1')).toContain('dlv_6'));
    s1.unsubscribe();
    // 2e session : l'achat est renvoyé, il n'est pas recrédité mais l'ack est renvoyé.
    const srv2 = fakeDevAppStore({ pending: [purchase('dlv_6')] });
    const h2 = vi.fn();
    subs.push(client(srv2, { storage }).onPurchase('p1', h2));
    await vi.waitFor(() => expect(srv2.acked).toEqual(['dlv_6']));
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).not.toHaveBeenCalled();
  });

  it("n'appelle plus le handler après unsubscribe", async () => {
    const srv = fakeDevAppStore();
    const handler = vi.fn();
    const sub = client(srv).onPurchase('p1', handler);
    await vi.waitFor(() => expect(sub.connected).toBe(true));
    sub.unsubscribe();
    expect(sub.connected).toBe(false);
    srv.pending.set('x', purchase('x'));
    await sub.catchUp();
    expect(handler).not.toHaveBeenCalled();
  });

  it('rattrape quand la page redevient visible', async () => {
    const listeners: Record<string, () => void> = {};
    const fakeDoc = { visibilityState: 'visible', addEventListener: (t: string, f: () => void) => (listeners[t] = f), removeEventListener: () => {} };
    vi.stubGlobal('document', fakeDoc);
    try {
      const srv = fakeDevAppStore();
      const handler = vi.fn();
      const sub = client(srv).onPurchase('p1', handler);
      subs.push(sub);
      await vi.waitFor(() => expect(sub.connected).toBe(true));
      srv.pending.set('dlv_7', purchase('dlv_7'));
      listeners.visibilitychange!();
      await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('utilise un EventSource fourni (avec en-têtes) si demandé', async () => {
    const srv = fakeDevAppStore();
    const instances: FakeES[] = [];
    class FakeES implements EventSourceLike {
      onopen: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      listeners: Record<string, (m: SseMessage) => void> = {};
      closed = false;
      constructor(
        readonly url: string,
        readonly init?: { headers?: Record<string, string> },
      ) {
        instances.push(this);
      }
      addEventListener(t: string, f: (m: SseMessage) => void) {
        this.listeners[t] = f;
      }
      close() {
        this.closed = true;
      }
    }
    const handler = vi.fn();
    const sub = client(srv, { EventSource: FakeES }).onPurchase('p1', handler);
    subs.push(sub);
    const es = instances[0]!;
    expect(es.url).toBe(`${BASE}/api/v1/deliveries/stream?player_id=p1`);
    expect(es.init?.headers?.authorization).toBe('Bearer das_test');
    es.onopen!({});
    expect(sub.connected).toBe(true);
    es.listeners.purchase!({ data: JSON.stringify(purchase('dlv_8')) });
    await vi.waitFor(() => expect(srv.acked).toEqual(['dlv_8']));
    es.onerror!({});
    expect(es.closed).toBe(true);
    await vi.waitFor(() => expect(instances).toHaveLength(2));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('clé secrète dans un navigateur (revue 2026-11, F13)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('refusée quand window et document existent, sauf option explicite ; la clé publique reste acceptée', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    const fetch = vi.fn();
    expect(() => new DevAppStore({ apiKey: 'das_secret_x', fetch })).toThrow(/navigateur/);
    expect(() => new DevAppStore({ apiKey: 'das_secret_x', fetch, dangerouslyAllowSecretKeyInBrowser: true })).not.toThrow();
    expect(() => new DevAppStore({ publishableKey: 'das_pub_x', fetch })).not.toThrow();
  });
  it('acceptée côté serveur (Node, sans window)', () => {
    expect(() => new DevAppStore({ apiKey: 'das_secret_x', fetch: vi.fn() })).not.toThrow();
  });
});
