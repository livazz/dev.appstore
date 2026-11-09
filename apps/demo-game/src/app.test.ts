import type { AddressInfo } from 'node:net';
import { signPayload, type PurchaseEvent } from '@wolleen/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoApp, type DemoApp } from './app';
import { loadConfig } from './config';
import { InventoryStore } from './store';

const config = loadConfig({ WOLLEEN_URL: 'http://wolleen.test' });
const CRYSTAL_SECRET = config.games.crystal.webhookSecret;

function event(over: Partial<PurchaseEvent> = {}): PurchaseEvent {
  return {
    event: 'purchase.completed',
    delivery_id: 'dlv_1',
    order_id: 'ord_1',
    game_id: 'gam_crystal',
    player_id: '#2PP8QL9',
    product_id: 'gems_1200',
    item_type: 'consumable',
    quantity: 1200,
    amount_cents: 799,
    currency: 'EUR',
    created_at: '2026-11-09T10:00:00.000Z',
    ...over,
  };
}

const defaultUpstream = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (url.endsWith('/ack')) return Response.json({ ok: true });
  if (url.endsWith('/api/v1/link-codes')) return Response.json({ code: 'K7QF-M2XA', expires_at: '2026-11-09T10:10:00.000Z', echo: JSON.parse(String(init?.body)) });
  if (url.includes('/api/v1/deliveries?')) return Response.json({ data: [], auth: (init?.headers as Record<string, string>).authorization });
  return new Response('nope', { status: 404 });
};
const upstream = vi.fn(defaultUpstream);

let app: DemoApp;
let base: string;

beforeAll(async () => {
  app = createDemoApp({ config, fetch: upstream as unknown as typeof fetch, log: () => {} });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  app.server.closeAllConnections();
  await new Promise((r) => app.server.close(r));
});
beforeEach(() => upstream.mockClear());

const postWebhook = (body: string, sig?: string) =>
  fetch(`${base}/wolleen/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'Wolleen-Signature': sig } : {}) }, body });

describe('POST /wolleen/webhook', () => {
  it('crédite une fois, ignore les rejeux (idempotent par delivery_id) et acquitte chez Wolleen', async () => {
    const before = app.store.get('crystal', '#2PP8QL9').inventory.gems;
    const body = JSON.stringify(event({ delivery_id: 'dlv_idem' }));
    const r1 = await postWebhook(body, signPayload(body, CRYSTAL_SECRET));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, duplicate: false });
    // Relance Wolleen (nouvelle signature, même livraison).
    const r2 = await postWebhook(body, signPayload(body, CRYSTAL_SECRET));
    expect(await r2.json()).toEqual({ ok: true, duplicate: true });
    expect(app.store.get('crystal', '#2PP8QL9').inventory.gems).toBe(before + 1200);
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1));
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe('http://wolleen.test/api/v1/deliveries/dlv_idem/ack');
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${config.games.crystal.apiKey}`);
  });

  it('refuse une signature absente, fausse ou expirée', async () => {
    const body = JSON.stringify(event({ delivery_id: 'dlv_bad' }));
    expect((await postWebhook(body)).status).toBe(401);
    expect((await postWebhook(body, signPayload(body, 'whsec_autre'))).status).toBe(401);
    expect((await postWebhook(body, signPayload(body, CRYSTAL_SECRET, Math.floor(Date.now() / 1000) - 3600))).status).toBe(401);
    const tampered = body.replace('1200', '999999');
    expect((await postWebhook(tampered, signPayload(body, CRYSTAL_SECRET))).status).toBe(401);
    expect(app.store.get('crystal', '#2PP8QL9').history.some((h) => h.delivery_id === 'dlv_bad')).toBe(false);
  });

  it("refuse un événement d'un autre jeu ou malformé", async () => {
    const body = JSON.stringify(event({ delivery_id: 'dlv_x', game_id: 'gam_farm' }));
    expect((await postWebhook(body, signPayload(body, CRYSTAL_SECRET))).status).toBe(400);
    const junk = '{"hello":1}';
    expect((await postWebhook(junk, signPayload(junk, CRYSTAL_SECRET))).status).toBe(400);
  });

  it('gère packs, abonnements, remboursements et produits inconnus', async () => {
    const store = new InventoryStore();
    const a = createDemoApp({ config, store, ackWebhooks: false, log: () => {} });
    const send = (e: PurchaseEvent) => {
      const raw = JSON.stringify(e);
      return a.handleWebhook(raw, signPayload(raw, CRYSTAL_SECRET));
    };
    const p = '#9LQ2YVR';
    const start = store.get('crystal', p).inventory;
    await send(event({ delivery_id: 'd1', player_id: p, product_id: 'starter_pack', quantity: 1 }));
    await send(event({ delivery_id: 'd2', player_id: p, product_id: 'pass_royal_monthly', quantity: 1 }));
    await send(event({ delivery_id: 'd3', player_id: p, product_id: 'gold_10000', quantity: 10000 }));
    await send(event({ delivery_id: 'd4', player_id: p, event: 'purchase.refunded', product_id: 'gold_10000', quantity: 10000 }));
    const r = await send(event({ delivery_id: 'd5', player_id: p, product_id: 'inconnu' }));
    expect(r.status).toBe(200);
    const inv = store.get('crystal', p).inventory;
    expect(inv).toMatchObject({ gems: start.gems + 500, gold: start.gold + 5000, royalPass: 1, starterPack: 1 });
    expect(store.get('crystal', p).history).toHaveLength(4);
  });
});

describe('GET /wolleen/players/{id}', () => {
  it('renvoie le joueur (ID encodé, sans signature)', async () => {
    const res = await fetch(`${base}/wolleen/players/%232PP8QL9`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ player_id: '#2PP8QL9', display_name: 'Ali', level: 42 });
  });

  it('vérifie la signature si elle est présente (corps signé = ID brut)', async () => {
    const ok = await fetch(`${base}/wolleen/players/2pp8ql9`, { headers: { 'Wolleen-Signature': signPayload('2pp8ql9', CRYSTAL_SECRET) } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).player_id).toBe('#2PP8QL9');
    const replay = await fetch(`${base}/wolleen/players/2pp8ql9`, { headers: { 'Wolleen-Signature': signPayload('#9LQ2YVR', CRYSTAL_SECRET) } });
    expect(replay.status).toBe(401);
    const bad = await fetch(`${base}/wolleen/players/%232PP8QL9`, { headers: { 'Wolleen-Signature': 't=1,v1=abc' } });
    expect(bad.status).toBe(401);
  });

  it('404 pour un joueur inconnu', async () => {
    expect((await fetch(`${base}/wolleen/players/%23NOPE`)).status).toBe(404);
  });
});

describe('API du jeu', () => {
  it('pousse les mises à jour au client du jeu (SSE)', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events?game=crystal&player=${encodeURIComponent('#8VJR2KX')}`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    const readUntil = async (needle: string) => {
      while (!text.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value);
      }
    };
    await readUntil('event: state');
    const body = JSON.stringify(event({ delivery_id: 'dlv_live', player_id: '#8VJR2KX', product_id: 'gems_6500', quantity: 6500 }));
    await postWebhook(body, signPayload(body, CRYSTAL_SECRET));
    await readUntil('event: inventory');
    const line = text.split('\n').find((l, i, all) => all[i - 1] === 'event: inventory' && l.startsWith('data: '))!;
    const update = JSON.parse(line.slice(6));
    expect(update.record).toMatchObject({ delivery_id: 'dlv_live', delta: { gems: 6500 } });
    ctrl.abort();
  });

  it('demande un code de liaison à Wolleen avec la clé du jeu', async () => {
    const res = await fetch(`${base}/api/link-code`, { method: 'POST', body: JSON.stringify({ game: 'crystal', player_id: '#2PP8QL9' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: 'K7QF-M2XA', echo: { player_id: '#2PP8QL9', player_name: 'Ali' } });
  });

  it('relaie /proxy/api/v1/* vers Wolleen (mode SDK)', async () => {
    const res = await fetch(`${base}/proxy/api/v1/deliveries?player_id=p1`, { headers: { authorization: 'Bearer wk_test_demo_pixel_farm' } });
    expect(await res.json()).toEqual({ data: [], auth: 'Bearer wk_test_demo_pixel_farm' });
    expect(String(upstream.mock.calls[0]![0])).toBe('http://wolleen.test/api/v1/deliveries?player_id=p1');
    expect((await fetch(`${base}/proxy/admin`)).status).toBe(404);
  });

  it('mode SDK de bout en bout : flux SSE relayé par le proxy, crédit puis ack', async () => {
    const enc = new TextEncoder();
    const farmEvent = event({ delivery_id: 'dlv_farm', game_id: 'gam_farm', product_id: 'seeds_50', quantity: 50 });
    upstream.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/deliveries/stream')) {
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode(': ping\n\n'));
            setTimeout(() => c.enqueue(enc.encode(`event: purchase\nid: dlv_farm\ndata: ${JSON.stringify(farmEvent)}\n\n`)), 20);
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }
      if (url.includes('/deliveries?')) return Response.json({ data: [] });
      if (url.endsWith('/ack')) return Response.json({ ok: true });
      return new Response('nope', { status: 404 });
    });
    const { Wolleen } = await import('@wolleen/sdk');
    const w = new Wolleen({ apiKey: config.games.farm.apiKey, baseUrl: `${base}/proxy` });
    const got: PurchaseEvent[] = [];
    const sub = w.onPurchase('#2PP8QL9', (e) => void got.push(e));
    try {
      await vi.waitFor(() => expect(upstream.mock.calls.some(([u]) => String(u).endsWith('/deliveries/dlv_farm/ack'))).toBe(true));
      expect(got).toEqual([farmEvent]);
    } finally {
      sub.unsubscribe();
      upstream.mockImplementation(defaultUpstream);
    }
  });

  it('sert le SDK au navigateur en modules ES, sans le code serveur', async () => {
    const res = await fetch(`${base}/sdk/index.js`);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(await res.text()).toContain("from './client.js'");
    const client = await (await fetch(`${base}/sdk/client.js`)).text();
    expect(client).toContain('class Wolleen');
    expect(client).not.toContain('import type');
    expect((await fetch(`${base}/sdk/server.js`)).status).toBe(404);
  });

  it('ne divulgue la clé API que pour le jeu en mode SDK', async () => {
    const cfg = await (await fetch(`${base}/api/config`)).json();
    expect(cfg.games.farm.apiKey).toBe(config.games.farm.apiKey);
    expect(cfg.games.crystal.apiKey).toBeUndefined();
    expect(JSON.stringify(cfg)).not.toContain('whsec_');
  });

  it('sert la page du jeu', async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('Lier mon compte web');
    expect(html).toContain('Crystal Clash');
  });
});
