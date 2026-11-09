/*
 * Mode clé publique + jeton joueur (sec/delivery-keys, D-05) : le SDK embarqué n'a accès aux achats qu'après la
 * liaison, envoie le jeton en en-tête, ne met jamais de clé ni de jeton dans une URL (CHK-API-04), oublie un jeton
 * révoqué et reprend après une nouvelle liaison.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Wolleen, WolleenError, type PurchaseEvent, type PurchaseSubscription } from './index';

const BASE = 'http://wolleen.test';
const PUB = 'wk_pub_test_farm';

function purchase(id: string, over: Partial<PurchaseEvent> = {}): PurchaseEvent {
  return {
    event: 'purchase.completed', delivery_id: id, order_id: `ord_${id}`, game_id: 'gam_farm', player_id: 'p1', product_id: 'seeds_50',
    item_type: 'consumable', quantity: 50, amount_cents: 199, currency: 'EUR', created_at: '2026-11-09T10:00:00.000Z', ...over,
  };
}

type Call = { method: string; url: string; headers: Record<string, string> };

/** Faux Wolleen : clé publique + jeton joueur `wk_pt_ok` délivré une fois par la demande de liaison. */
function fakeWolleen(opts: { pendingPolls?: number; pending?: PurchaseEvent[]; expire?: boolean } = {}) {
  const calls: Call[] = [];
  const state = { validToken: 'wk_pt_ok', polls: 0, claimed: false, pending: new Map((opts.pending ?? []).map((e) => [e.delivery_id, e])), acked: [] as string[], revoked: 0 };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method, url, headers });
    const path = url.slice(BASE.length);
    if (headers.authorization !== `Bearer ${PUB}`) return Response.json({ error: { code: 'unauthorized', message: 'Clé invalide' } }, { status: 401 });
    if (path === '/api/v1/link-codes' && method === 'POST') {
      return Response.json({ code: 'K7QF-M2XA', expires_at: new Date(Date.now() + 600_000).toISOString(), link_request_id: 'lnc_req1' });
    }
    if (path === '/api/v1/link-requests/lnc_req1') {
      if (opts.expire) return Response.json({ status: 'expired' });
      if (state.polls++ < (opts.pendingPolls ?? 0)) return Response.json({ status: 'pending', player_id: 'p1' });
      if (state.claimed) return Response.json({ status: 'claimed', player_id: 'p1' });
      state.claimed = true;
      return Response.json({ status: 'linked', player_id: 'p1', player_token: state.validToken });
    }
    if (headers['wolleen-player-token'] !== state.validToken) {
      return Response.json({ error: { code: 'player_token_required', message: 'Jeton joueur requis' } }, { status: 401 });
    }
    if (path === '/api/v1/player-tokens' && method === 'DELETE') {
      state.revoked++;
      return Response.json({ ok: true, revoked: 1 });
    }
    if (path.startsWith('/api/v1/deliveries/stream')) {
      const body = new ReadableStream<Uint8Array>({ start: () => {} });
      init?.signal?.addEventListener('abort', () => body.cancel().catch(() => {}));
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    }
    if (path.startsWith('/api/v1/deliveries?')) return Response.json({ data: [...state.pending.values()] });
    const m = path.match(/^\/api\/v1\/deliveries\/([^/]+)\/ack$/);
    if (m && method === 'POST') {
      state.acked.push(decodeURIComponent(m[1]!));
      state.pending.delete(decodeURIComponent(m[1]!));
      return Response.json({ ok: true });
    }
    return Response.json({ error: { code: 'not_found', message: 'Introuvable' } }, { status: 404 });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, state };
}

function memStorage() {
  const mem = new Map<string, string>();
  return { mem, getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
}

const subs: PurchaseSubscription[] = [];
afterEach(() => {
  while (subs.length) subs.pop()!.unsubscribe();
  vi.unstubAllGlobals();
});

const client = (srv: ReturnType<typeof fakeWolleen>, storage = memStorage(), extra: Record<string, unknown> = {}) =>
  new Wolleen({ publishableKey: PUB, baseUrl: BASE, fetch: srv.fetch, storage, reconnectDelayMs: 5, maxReconnectDelayMs: 20, ...extra });

describe('clé publique', () => {
  it('sans jeton : aucun appel aux livraisons, erreur player_token_required', async () => {
    const srv = fakeWolleen();
    const w = client(srv);
    expect(w.keyType).toBe('publishable');
    expect(w.isLinked('p1')).toBe(false);
    await expect(w.getPendingPurchases('p1')).rejects.toMatchObject({ code: 'player_token_required', status: 401 });
    expect(srv.calls).toHaveLength(0);
  });

  it('liaison : code + link_request_id, interrogation jusqu’au jeton, mémorisé dans le storage', async () => {
    const srv = fakeWolleen({ pendingPolls: 2 });
    const storage = memStorage();
    const w = client(srv, storage);
    const link = await w.requestLinkCode('p1', 'Ali');
    expect(link).toMatchObject({ code: 'K7QF-M2XA', link_request_id: 'lnc_req1' });
    const token = await w.waitForLink(link, { intervalMs: 1000, timeoutMs: 10_000 });
    expect(token).toBe('wk_pt_ok');
    expect(srv.state.polls).toBe(3);
    expect(storage.mem.get('wolleen:player-token:p1')).toBe('wk_pt_ok');
    expect(w.isLinked('p1')).toBe(true);
    // Un nouveau client (relance du jeu) retrouve le jeton.
    expect(client(srv, storage).getPlayerToken('p1')).toBe('wk_pt_ok');
  }, 15_000);

  it('code expiré ou attente annulée → erreur explicite', async () => {
    const w = client(fakeWolleen({ expire: true }));
    await expect(w.waitForLink('lnc_req1')).rejects.toMatchObject({ code: 'link_expired' });
    const w2 = client(fakeWolleen({ pendingPolls: 100 }));
    const ctrl = new AbortController();
    const p = w2.waitForLink('lnc_req1', { intervalMs: 1000, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(WolleenError);
  });

  it('onPurchase attend la liaison puis démarre seul ; jeton en en-tête, jamais dans une URL', async () => {
    const srv = fakeWolleen({ pending: [purchase('dlv_1')] });
    const onError = vi.fn();
    const w = client(srv, memStorage(), { onError });
    const handler = vi.fn();
    const sub = w.onPurchase('p1', handler);
    subs.push(sub);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'player_token_required' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(srv.calls.filter((c) => c.url.includes('/deliveries'))).toHaveLength(0);

    await w.waitForLink('lnc_req1');
    await vi.waitFor(() => expect(srv.state.acked).toEqual(['dlv_1']));
    await vi.waitFor(() => expect(sub.connected).toBe(true));
    expect(handler).toHaveBeenCalledTimes(1);
    for (const c of srv.calls) {
      expect(c.url).not.toContain('wk_pub');
      expect(c.url).not.toContain('wk_pt');
      if (c.url.includes('/deliveries')) expect(c.headers['wolleen-player-token']).toBe('wk_pt_ok');
    }
  });

  it('jeton révoqué : oublié, abonnement en attente, reprise après une nouvelle liaison', async () => {
    const srv = fakeWolleen();
    const storage = memStorage();
    storage.mem.set('wolleen:player-token:p1', 'wk_pt_ancien'); // jeton révoqué côté serveur
    const onError = vi.fn();
    const w = client(srv, storage, { onError });
    const sub = w.onPurchase('p1', () => {});
    subs.push(sub);
    await vi.waitFor(() => expect(storage.mem.has('wolleen:player-token:p1')).toBe(false));
    expect(w.isLinked('p1')).toBe(false);
    const streamCalls = () => srv.calls.filter((c) => c.url.includes('/stream')).length;
    const before = streamCalls();
    await new Promise((r) => setTimeout(r, 50));
    expect(streamCalls()).toBe(before); // pas de boucle de reconnexion sans jeton

    srv.state.pending.set('dlv_2', purchase('dlv_2'));
    w.setPlayerToken('p1', 'wk_pt_ok');
    await vi.waitFor(() => expect(srv.state.acked).toEqual(['dlv_2']));
  });

  it('unlink révoque le jeton côté serveur puis l’oublie', async () => {
    const srv = fakeWolleen();
    const storage = memStorage();
    const w = client(srv, storage);
    w.setPlayerToken('p1', 'wk_pt_ok');
    expect(await w.unlink('p1')).toBe(1);
    expect(srv.state.revoked).toBe(1);
    expect(srv.calls.at(-1)).toMatchObject({ method: 'DELETE', url: `${BASE}/api/v1/player-tokens` });
    expect(storage.mem.has('wolleen:player-token:p1')).toBe(false);
  });

  it("n'utilise jamais l'EventSource natif (pas d'en-têtes → la clé finirait dans l'URL)", async () => {
    const constructed: string[] = [];
    vi.stubGlobal('EventSource', class { constructor(url: string) { constructed.push(url); } });
    const srv = fakeWolleen();
    const w = client(srv, memStorage(), { transport: 'eventsource' });
    w.setPlayerToken('p1', 'wk_pt_ok');
    const sub = w.onPurchase('p1', () => {});
    subs.push(sub);
    await vi.waitFor(() => expect(sub.connected).toBe(true));
    expect(constructed).toEqual([]);
  });

  it('exige une clé', () => {
    expect(() => new Wolleen({})).toThrow();
    expect(new Wolleen({ apiKey: 'wk_pub_x', fetch: (async () => new Response()) as typeof fetch }).keyType).toBe('publishable');
    expect(new Wolleen({ apiKey: 'wk_secret_x', fetch: (async () => new Response()) as typeof fetch }).keyType).toBe('secret');
  });
});
