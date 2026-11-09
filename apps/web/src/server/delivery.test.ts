import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, WEBHOOK_RETRY_SCHEDULE_MS, hashApiKey, verifySignature, type PurchaseEvent } from '@wolleen/core';
import type { DB } from '@wolleen/db';

vi.mock('server-only', () => ({}));
// Remplace l'instance PGlite du dépôt par une base en mémoire (le module réel ouvrirait .data/pglite).
vi.mock('@wolleen/db', async () => {
  const schema = await import('@wolleen/db/schema');
  const orm = await import('drizzle-orm');
  const { createTestDb } = await import('@wolleen/db/testing');
  return { ...schema, schema, ...orm, db: await createTestDb() };
});

const { db, deliveries, games, items, orders, studios, user, webhookAttempts, eq } = await import('@wolleen/db');
const delivery = await import('./delivery');
const events = await import('./events');
const { authenticateGame } = await import('./api-key');

/* ---------------------------------------------------------------- faux serveur de studio */

type Hit = { body: string; signature: string | undefined; deliveryHeader: string | undefined };
let server: Server;
let baseUrl = '';
let responder: (req: IncomingMessage) => number = () => 200;
const hits: Hit[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ body, signature: req.headers['wolleen-signature'] as string | undefined, deliveryHeader: req.headers['wolleen-delivery'] as string | undefined });
      res.statusCode = responder(req);
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const database = db as DB;
  await database.insert(user).values([{ id: 'usr_buyer', name: 'Acheteur', email: 'a@test.dev', emailVerified: true }]);
  await database.insert(studios).values([
    { id: 'std_a', name: 'A', slug: 'a' },
    { id: 'std_b', name: 'B', slug: 'b' },
  ]);
  const game = (id: string, studioId: string, webhookUrl: string | null) => ({
    id, studioId, slug: id, name: id, theme: DEFAULT_THEME, webhookUrl,
    webhookSecret: `whsec_${id}`, apiKeyHash: hashApiKey(`wk_${id}`), apiKeyPrefix: `wk_${id}`.slice(0, 12),
  });
  await database.insert(games).values([
    game('gam_hook', 'std_a', `${baseUrl}/webhook`),
    game('gam_sdk', 'std_a', null),
    game('gam_other', 'std_b', null),
  ]);
  await database.insert(items).values(
    ['gam_hook', 'gam_sdk', 'gam_other'].map((g) => ({
      id: `itm_${g}`, gameId: g, productId: 'gems_100', title: 'Gemmes', priceCents: 499, quantity: 100, type: 'consumable' as const,
      style: {} as never,
    })),
  );
}, 60_000);

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  hits.length = 0;
  responder = () => 200;
});

let orderSeq = 0;
async function paidOrder(gameId: string, playerId = 'player_1') {
  const id = `ord_t${++orderSeq}`;
  await (db as DB).insert(orders).values({
    id, userId: 'usr_buyer', gameId, itemId: `itm_${gameId}`, productId: 'gems_100', itemTitle: 'Gemmes', playerId,
    quantity: 100, amountCents: 499, platformFeeCents: 25, currency: 'EUR', status: 'paid', paidAt: new Date(),
  });
  return id;
}

async function getDelivery(id: string) {
  const [row] = await (db as DB).select().from(deliveries).where(eq(deliveries.id, id));
  return row!;
}

/** Rend une livraison immédiatement due (simule l'écoulement du délai de relance). */
async function makeDue(id: string) {
  await (db as DB).update(deliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(deliveries.id, id));
}

/* ---------------------------------------------------------------- tests */

describe('webhook signé', () => {
  it('POST le PurchaseEvent avec une signature vérifiable et passe en delivered sur 2xx', async () => {
    const id = await delivery.enqueueDelivery(await paidOrder('gam_hook'));
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    const payload = JSON.parse(hit.body) as PurchaseEvent;
    expect(payload).toMatchObject({ event: 'purchase.completed', delivery_id: id, game_id: 'gam_hook', product_id: 'gems_100', quantity: 100, amount_cents: 499 });
    expect(hit.deliveryHeader).toBe(id);
    expect(verifySignature(hit.body, hit.signature, 'whsec_gam_hook')).toBe(true);
    expect(verifySignature(hit.body, hit.signature, 'whsec_autre')).toBe(false);

    const d = await getDelivery(id);
    expect(d.status).toBe('delivered');
    expect(d.attempts).toBe(1);
    expect(d.deliveredAt).toBeInstanceOf(Date);
    expect(d.nextAttemptAt).toBeNull();
    const log = await (db as DB).select().from(webhookAttempts).where(eq(webhookAttempts.deliveryId, id));
    expect(log).toHaveLength(1);
    expect(log[0]!.statusCode).toBe(200);
  });

  it('enqueueDelivery est idempotent (une seule livraison, un seul envoi par commande)', async () => {
    const orderId = await paidOrder('gam_hook');
    const a = await delivery.enqueueDelivery(orderId);
    const b = await delivery.enqueueDelivery(orderId);
    expect(a).toBe(b);
    expect(hits).toHaveLength(1);
  });
});

describe('relances et abandon', () => {
  it('replanifie après un échec puis réussit à la relance', async () => {
    responder = () => 500;
    const before = Date.now();
    const id = await delivery.enqueueDelivery(await paidOrder('gam_hook'));
    let d = await getDelivery(id);
    expect(d.status).toBe('pending');
    expect(d.attempts).toBe(1);
    expect(d.lastError).toBe('HTTP 500');
    expect(d.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before + WEBHOOK_RETRY_SCHEDULE_MS[0]! - 1000);

    // Pas encore dû : le cron ne fait rien.
    await delivery.retryDueDeliveries();
    expect(hits).toHaveLength(1);

    responder = () => 204;
    await makeDue(id);
    const stats = await delivery.retryDueDeliveries();
    expect(stats.processed).toBeGreaterThanOrEqual(1);
    d = await getDelivery(id);
    expect(d.status).toBe('delivered');
    expect(d.attempts).toBe(2);
    expect(d.lastError).toBeNull();
  });

  it('abandonne (failed) quand le planning est épuisé', async () => {
    responder = () => 503;
    const id = await delivery.enqueueDelivery(await paidOrder('gam_hook'));
    for (let i = 0; i < WEBHOOK_RETRY_SCHEDULE_MS.length; i++) {
      expect((await getDelivery(id)).status).toBe('pending');
      await makeDue(id);
      await delivery.dispatchDelivery(id);
    }
    const d = await getDelivery(id);
    expect(d.status).toBe('failed');
    expect(d.attempts).toBe(WEBHOOK_RETRY_SCHEDULE_MS.length + 1);
    expect(d.nextAttemptAt).toBeNull();
    expect(hits).toHaveLength(WEBHOOK_RETRY_SCHEDULE_MS.length + 1);

    // Une livraison failed n'est plus relancée automatiquement…
    await makeDue(id);
    await delivery.dispatchDelivery(id);
    expect(hits).toHaveLength(WEBHOOK_RETRY_SCHEDULE_MS.length + 1);

    // …mais la relance manuelle du studio fait une nouvelle tentative.
    responder = () => 200;
    expect(await delivery.retryDelivery('gam_hook', id)).toBe('ok');
    expect((await getDelivery(id)).status).toBe('delivered');
  });

  it("une erreur réseau compte comme un échec", async () => {
    const orderId = await paidOrder('gam_hook');
    await (db as DB).update(games).set({ webhookUrl: 'http://127.0.0.1:1/injoignable' }).where(eq(games.id, 'gam_hook'));
    try {
      const id = await delivery.enqueueDelivery(orderId);
      const d = await getDelivery(id);
      expect(d.status).toBe('pending');
      expect(d.attempts).toBe(1);
      expect(d.lastError).toBeTruthy();
    } finally {
      await (db as DB).update(games).set({ webhookUrl: `${baseUrl}/webhook` }).where(eq(games.id, 'gam_hook'));
    }
  });

  it("n'envoie pas deux fois en parallèle (bail)", async () => {
    responder = () => 500;
    const id = await delivery.enqueueDelivery(await paidOrder('gam_hook'));
    hits.length = 0;
    await makeDue(id);
    await Promise.all([delivery.dispatchDelivery(id), delivery.dispatchDelivery(id), delivery.retryDueDeliveries()]);
    expect(hits).toHaveLength(1);
    expect((await getDelivery(id)).attempts).toBe(2);
  });
});

describe('SDK (sans webhook)', () => {
  it('reste pending, notifie le flux SSE, puis passe en delivered à la récupération', async () => {
    const received: PurchaseEvent[] = [];
    const unsubscribe = events.subscribe('gam_sdk', 'player_sse', (e) => received.push(e));
    const id = await delivery.enqueueDelivery(await paidOrder('gam_sdk', 'player_sse'));
    unsubscribe();
    expect(hits).toHaveLength(0);
    expect(received.map((e) => e.delivery_id)).toEqual([id]);
    let d = await getDelivery(id);
    expect(d.status).toBe('pending');
    expect(d.nextAttemptAt).toBeNull();

    const list = await delivery.takeOpenDeliveries({ id: 'gam_sdk', webhookUrl: null }, 'player_sse');
    expect(list.map((e) => e.delivery_id)).toEqual([id]);
    d = await getDelivery(id);
    expect(d.status).toBe('delivered');

    // Toujours listée tant qu'elle n'est pas acquittée.
    expect((await delivery.takeOpenDeliveries({ id: 'gam_sdk', webhookUrl: null }, 'player_sse')).length).toBe(1);
    await delivery.acknowledgeDelivery('gam_sdk', id);
    expect((await delivery.takeOpenDeliveries({ id: 'gam_sdk', webhookUrl: null }, 'player_sse')).length).toBe(0);
  });

  it('notifie aussi le SDK quand le jeu a un webhook', async () => {
    const received: PurchaseEvent[] = [];
    const unsubscribe = events.subscribe('gam_hook', 'player_both', (e) => received.push(e));
    const id = await delivery.enqueueDelivery(await paidOrder('gam_hook', 'player_both'));
    unsubscribe();
    expect(received.map((e) => e.delivery_id)).toEqual([id]);
  });
});

describe('ack', () => {
  it('est idempotent', async () => {
    const id = await delivery.enqueueDelivery(await paidOrder('gam_sdk', 'player_ack'));
    expect(await delivery.acknowledgeDelivery('gam_sdk', id)).toBe('ok');
    const first = await getDelivery(id);
    expect(first.status).toBe('acknowledged');
    expect(first.acknowledgedAt).toBeInstanceOf(Date);
    expect(first.deliveredAt).toBeInstanceOf(Date);

    expect(await delivery.acknowledgeDelivery('gam_sdk', id)).toBe('ok');
    const second = await getDelivery(id);
    expect(second.acknowledgedAt!.getTime()).toBe(first.acknowledgedAt!.getTime());
  });

  it("un ack ne fait pas régresser l'état si le webhook répond après", async () => {
    const id = await delivery.enqueueDelivery(await paidOrder('gam_hook', 'player_ack2'));
    await delivery.acknowledgeDelivery('gam_hook', id);
    await makeDue(id);
    await delivery.dispatchDelivery(id);
    expect((await getDelivery(id)).status).toBe('acknowledged');
  });
});

describe('isolement entre jeux', () => {
  it("un jeu ne voit ni n'acquitte les livraisons d'un autre jeu", async () => {
    const id = await delivery.enqueueDelivery(await paidOrder('gam_sdk', 'shared_player'));
    expect(await delivery.takeOpenDeliveries({ id: 'gam_other', webhookUrl: null }, 'shared_player')).toEqual([]);
    expect(await delivery.acknowledgeDelivery('gam_other', id)).toBe('not_found');
    expect(await delivery.retryDelivery('gam_other', id)).toBe('not_found');
    expect((await getDelivery(id)).status).toBe('pending');
    expect((await delivery.listRecentDeliveries('gam_other')).some((d) => d.id === id)).toBe(false);
  });

  it("les abonnés SSE d'un autre jeu ne reçoivent rien", async () => {
    const other: PurchaseEvent[] = [];
    const unsubscribe = events.subscribe('gam_other', 'iso_player', (e) => other.push(e));
    await delivery.enqueueDelivery(await paidOrder('gam_sdk', 'iso_player'));
    unsubscribe();
    expect(other).toEqual([]);
  });

  it('authenticateGame résout le bon jeu par clé API', async () => {
    const req = (key: string) => new Request('http://x/api/v1/deliveries', { headers: { authorization: `Bearer ${key}` } });
    expect((await authenticateGame(req('wk_gam_sdk')))?.id).toBe('gam_sdk');
    expect((await authenticateGame(req('wk_gam_other')))?.id).toBe('gam_other');
    expect(await authenticateGame(req('wk_inconnue'))).toBeNull();
  });
});

describe('événement de test', () => {
  it('envoie un payload signé sans créer de livraison', async () => {
    const before = (await (db as DB).select().from(deliveries)).length;
    const r = await delivery.sendTestWebhook('gam_hook');
    expect(r.ok).toBe(true);
    expect(r.statusCode).toBe(200);
    expect(verifySignature(hits[0]!.body, hits[0]!.signature, 'whsec_gam_hook')).toBe(true);
    expect((await (db as DB).select().from(deliveries)).length).toBe(before);
    expect((await delivery.sendTestWebhook('gam_sdk')).ok).toBe(false);
  });
});
