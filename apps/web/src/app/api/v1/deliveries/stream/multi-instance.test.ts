/*
 * Vague 6 « realtime » — flux SSE avec plusieurs instances du serveur web.
 * Deux bus (« instance A » qui reçoit le paiement, « instance B » qui porte le flux SSE) partagent une base PGlite
 * et communiquent par de vrais LISTEN/NOTIFY. Le flux de B doit recevoir l'achat publié par A, relu en base.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, hashApiKey, type PurchaseEvent } from '@devappstore/core';
import type { DB, ListenOptions, NotifyTransport } from '@devappstore/db';

vi.mock('server-only', () => ({}));
// Module réel (schéma, transports NOTIFY) avec une base PGlite en mémoire à la place de la base du dépôt.
vi.mock('@devappstore/db', async () => {
  const actual = await vi.importActual<typeof import('@devappstore/db')>('@devappstore/db');
  const { createTestDb } = await import('@devappstore/db/testing');
  return { ...actual, db: await createTestDb() };
});

const D = await import('@devappstore/db');
const db = D.db as DB;
const { createEventBus, setEventBus } = await import('@/server/events');
const streamRoute = await import('./route');

const SECRET = 'das_secret_multi_instance';
const pglite = (db as unknown as { $client: Parameters<typeof D.createPgliteNotifyTransport>[0] }).$client;

beforeAll(async () => {
  await db.insert(D.user).values({ id: 'usr_m', name: 'M', email: 'm@t.test', emailVerified: true });
  await db.insert(D.studios).values({ id: 'std_m', name: 'M', slug: 'm' });
  await db.insert(D.games).values({
    id: 'gam_m', studioId: 'std_m', slug: 'gam_m', name: 'gam_m', theme: DEFAULT_THEME, status: 'live',
    webhookSecret: 'whsec_m', apiKeyHash: hashApiKey(SECRET), apiKeyPrefix: SECRET.slice(0, 14), publishableKey: 'das_pub_multi_instance',
  });
  await db.insert(D.items).values({ id: 'itm_m', gameId: 'gam_m', productId: 'gems', title: 'Gemmes', priceCents: 199, style: {} as never });
}, 60_000);

let seq = 0;
/** Ce que fait l'instance qui reçoit le paiement : commande payée + livraison en base (sans passer par le bus de B). */
async function storePurchase(playerId: string, amountCents = 199): Promise<PurchaseEvent> {
  const n = ++seq;
  const orderId = `ord_mi${n}`;
  const id = `dlv_mi${n}`;
  await db.insert(D.orders).values({
    id: orderId, userId: 'usr_m', gameId: 'gam_m', itemId: 'itm_m', productId: 'gems', itemTitle: 'Gemmes', playerId,
    amountCents, platformFeeCents: 10, currency: 'EUR', status: 'paid', paidAt: new Date(),
  });
  const payload: PurchaseEvent = {
    event: 'purchase.completed', delivery_id: id, order_id: orderId, game_id: 'gam_m', player_id: playerId, product_id: 'gems',
    item_type: 'consumable', quantity: 1, amount_cents: amountCents, currency: 'EUR', created_at: new Date().toISOString(),
  };
  await db.insert(D.deliveries).values({ id, orderId, gameId: 'gam_m', playerId, payload });
  return payload;
}

function openStream(playerId: string) {
  const ctrl = new AbortController();
  const req = new Request(`http://devappstore.test/api/v1/deliveries/stream?player_id=${playerId}`, {
    headers: { authorization: `Bearer ${SECRET}`, 'x-forwarded-for': `10.0.0.${++seq}` },
    signal: ctrl.signal,
  });
  return streamRoute.GET(req).then((res) => {
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const s = {
      text: '',
      async readUntil(needle: string, ms = 3000) {
        const deadline = Date.now() + ms;
        while (!s.text.includes(needle) && Date.now() < deadline) {
          const r = await Promise.race([reader.read(), new Promise<null>((ok) => setTimeout(() => ok(null), deadline - Date.now()))]);
          if (!r || r.done) break;
          s.text += dec.decode(r.value);
        }
        return s.text.includes(needle);
      },
      async close() {
        ctrl.abort();
        await reader.cancel().catch(() => {});
      },
    };
    return s;
  });
}

describe('flux SSE multi-instance (LISTEN/NOTIFY PGlite)', () => {
  const instanceA = createEventBus({ transport: D.createPgliteNotifyTransport(pglite), instanceId: 'A' });
  const instanceB = createEventBus({ transport: D.createPgliteNotifyTransport(pglite), instanceId: 'B' });

  beforeAll(() => setEventBus(instanceB)); // le flux SSE tourne sur l'instance B
  afterAll(async () => {
    await instanceA.close();
    await instanceB.close();
  });

  it('un achat publié par l’instance A est poussé au flux ouvert sur l’instance B, relu en base', async () => {
    const stream = await openStream('P_multi');
    expect(await stream.readUntil('retry: 5000')).toBe(true);
    await instanceB.ready();

    const stored = await storePurchase('P_multi', 299);
    // L'événement en mémoire de A est faussé exprès : B ne doit pousser que ce qui est en base.
    instanceA.publish('gam_m', 'P_multi', { ...stored, amount_cents: 1 }, { userId: 'usr_m' });
    expect(await stream.readUntil(stored.delivery_id)).toBe(true);
    expect(stream.text).toContain('"amount_cents":299');
    expect(stream.text).not.toContain('"amount_cents":1,');

    // Livraison sans webhook : le flux de B l'a marquée reçue par le SDK.
    await instanceB.idle();
    await new Promise((r) => setTimeout(r, 30));
    const [row] = await db.select({ status: D.deliveries.status }).from(D.deliveries).where(D.eq(D.deliveries.id, stored.delivery_id));
    expect(row?.status).toBe('delivered');
    await stream.close();
  });

  it('un achat pour un autre joueur ne fuit pas dans le flux', async () => {
    const stream = await openStream('P_seul');
    await stream.readUntil('retry: 5000');
    const other = await storePurchase('P_voisin');
    instanceA.publish('gam_m', 'P_voisin', other, { userId: 'usr_m' });
    const mine = await storePurchase('P_seul');
    instanceA.publish('gam_m', 'P_seul', mine, { userId: 'usr_m' });
    expect(await stream.readUntil(mine.delivery_id)).toBe(true);
    expect(stream.text).not.toContain(other.delivery_id);
    await stream.close();
  });
});

describe('flux SSE : rattrapage en base à la reconnexion de LISTEN', () => {
  it('les achats manqués pendant la coupure sont envoyés dès que l’écoute est rétablie', async () => {
    let onReady: ListenOptions['onReady'];
    const flaky: NotifyTransport = {
      kind: 'postgres',
      async listen(_c, _fn, opts) {
        onReady = opts?.onReady;
        onReady?.({ reconnect: false });
        return async () => {};
      },
      async notify() {
        throw new Error('connexion coupée'); // aucune notification ne passe pendant la coupure
      },
      async close() {},
    };
    const bus = createEventBus({ transport: flaky, instanceId: 'B2' });
    setEventBus(bus);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const stream = await openStream('P_coupure');
    await stream.readUntil('retry: 5000');
    await bus.ready();
    const missed = await storePurchase('P_coupure'); // créée sur une autre instance, NOTIFY perdu
    await new Promise((r) => setTimeout(r, 50));
    expect(stream.text).not.toContain(missed.delivery_id);

    onReady!({ reconnect: true }); // postgres-js a rétabli la connexion LISTEN
    expect(await stream.readUntil(missed.delivery_id)).toBe(true);
    // Pas de doublon si un second rattrapage a lieu.
    onReady!({ reconnect: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(stream.text.split(`id: ${missed.delivery_id}`).length - 1).toBe(1);
    await stream.close();
    warn.mockRestore();
    await bus.close();
  });
});
