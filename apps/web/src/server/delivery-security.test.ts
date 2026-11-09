/*
 * Tests de non-régression « sec/delivery-keys » — livraison : invariant `paid` (CHK-DLV-01), création atomique
 * (CHK-DLV-02), bail / cron concurrents (CHK-DLV-05), anti-SSRF du webhook (CHK-SSRF-02/03/04/05/07, CHK-DLV-15),
 * reprise des livraisons en attente quand une URL est enregistrée, événements purchase.refunded, protection du cron
 * (CHK-DLV-11).
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, hashApiKey, verifySignature, type PurchaseEvent } from '@devappstore/core';
import type { DB } from '@devappstore/db';

vi.mock('server-only', () => ({}));

// Noms « publics » résolus localement (aucun accès réseau) : l'un vers une IP publique, l'autre vers 127.0.0.1 (DNS rebinding).
const { REBIND_HOST, PUBLIC_HOST } = vi.hoisted(() => ({ REBIND_HOST: 'rebind.devappstore.test', PUBLIC_HOST: 'hooks.studio.test' }));
vi.mock('node:dns', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:dns')>();
  type Addr = { address: string; family: number };
  type Cb = (err: NodeJS.ErrnoException | null, addresses: Addr[]) => void;
  const fake = (host: string): Addr[] | null =>
    host === REBIND_HOST ? [{ address: '127.0.0.1', family: 4 }] : host === PUBLIC_HOST ? [{ address: '93.184.216.34', family: 4 }] : null;
  const lookup = (host: string, opts: object, cb: Cb) => {
    const f = fake(host);
    return f ? cb(null, f) : (real.lookup as unknown as (h: string, o: object, c: Cb) => void)(host, opts, cb);
  };
  const promises = { ...real.promises, lookup: async (host: string, opts?: object) => fake(host) ?? real.promises.lookup(host, opts as never) };
  return { ...real, default: { ...real, lookup, promises }, lookup, promises };
});

vi.mock('@devappstore/db', async () => {
  const schema = await import('@devappstore/db/schema');
  const orm = await import('drizzle-orm');
  const { createTestDb } = await import('@devappstore/db/testing');
  return { ...schema, schema, ...orm, db: await createTestDb() };
});

const D = await import('@devappstore/db');
const db = D.db as DB;
const delivery = await import('./delivery');
const events = await import('./events');
const { isCronAuthorized } = await import('./delivery-http');

/* ---------------------------------------------------------------- faux serveur de studio */

type Hit = { path: string; body: string; signature: string | undefined };
let server: Server;
let base = '';
let port = 0;
let responder: (req: IncomingMessage) => { status: number; headers?: Record<string, string> } = () => ({ status: 200 });
const hits: Hit[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ path: req.url ?? '', body, signature: req.headers['devappstore-signature'] as string | undefined });
      const r = responder(req);
      res.writeHead(r.status, r.headers ?? {});
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;

  await db.insert(D.user).values([
    { id: 'usr_a', name: 'A', email: 'a@t.test', emailVerified: true },
    { id: 'usr_b', name: 'B', email: 'b@t.test', emailVerified: true },
  ]);
  await db.insert(D.studios).values({ id: 'std_t', name: 'T', slug: 't' });
  const game = (id: string, webhookUrl: string | null) => ({
    id, studioId: 'std_t', slug: id, name: id, theme: DEFAULT_THEME, webhookUrl,
    webhookSecret: `whsec_${id}`, apiKeyHash: hashApiKey(`das_${id}`), apiKeyPrefix: 'das_test',
  });
  await db.insert(D.games).values([game('gam_hook', `${base}/webhook`), game('gam_sdk', null), game('gam_late', null)]);
  await db.insert(D.items).values(
    ['gam_hook', 'gam_sdk', 'gam_late'].map((g) => ({
      id: `itm_${g}`, gameId: g, productId: 'gems_100', title: 'Gemmes', priceCents: 499, quantity: 100, type: 'consumable' as const, style: {} as never,
    })),
  );
}, 60_000);

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  hits.length = 0;
  responder = () => ({ status: 200 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

let seq = 0;
async function order(gameId: string, status: 'pending' | 'paid' | 'refunded' = 'paid', playerId = 'p1', userId = 'usr_a') {
  const id = `ord_s${++seq}`;
  await db.insert(D.orders).values({
    id, userId, gameId, itemId: `itm_${gameId}`, productId: 'gems_100', itemTitle: 'Gemmes', playerId,
    quantity: 1, amountCents: 499, platformFeeCents: 25, currency: 'EUR', status, paidAt: status === 'pending' ? null : new Date(),
  });
  return id;
}
const setOrderStatus = (id: string, status: 'paid' | 'refunded') => db.update(D.orders).set({ status }).where(D.eq(D.orders.id, id));
const deliveryRow = async (id: string) => (await db.select().from(D.deliveries).where(D.eq(D.deliveries.id, id)))[0]!;
const refundRow = async (id: string) => (await db.select().from(D.refundDeliveries).where(D.eq(D.refundDeliveries.id, id)))[0]!;
const makeDue = (id: string) => db.update(D.deliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(D.eq(D.deliveries.id, id));

/* ---------------------------------------------------------------- 1. invariant paid + atomicité */

describe('enqueueDelivery — invariant paid (CHK-DLV-01, D-06)', () => {
  it.each(['pending', 'refunded'] as const)('refuse une commande %s : exception, aucune livraison, aucun envoi', async (status) => {
    const id = await order('gam_hook', status);
    await expect(delivery.enqueueDelivery(id)).rejects.toMatchObject({ name: 'DeliveryError', code: 'order_not_paid' });
    expect(await db.select().from(D.deliveries).where(D.eq(D.deliveries.orderId, id))).toHaveLength(0);
    expect(hits).toHaveLength(0);
  });

  it('refuse une commande inconnue', async () => {
    await expect(delivery.enqueueDelivery('ord_inconnue')).rejects.toMatchObject({ code: 'order_not_found' });
  });
});

describe('enqueueDelivery — création atomique (CHK-DLV-02, D-07)', () => {
  it('appels concurrents : un seul id, une seule ligne, un seul envoi', async () => {
    const id = await order('gam_hook');
    const ids = await Promise.all(Array.from({ length: 5 }, () => delivery.enqueueDelivery(id)));
    expect(new Set(ids).size).toBe(1);
    const rows = await db.select().from(D.deliveries).where(D.eq(D.deliveries.orderId, id));
    expect(rows.map((r) => r.id)).toEqual([ids[0]]);
    expect(hits.filter((h) => h.path === '/webhook')).toHaveLength(1);
  });

  it("jeu sans webhook : le flux SSE n'est notifié qu'une fois malgré des envois concurrents", async () => {
    const received: PurchaseEvent[] = [];
    const off = events.subscribe('gam_sdk', 'p_once', (e) => received.push(e));
    try {
      const id = await delivery.enqueueDelivery(await order('gam_sdk', 'paid', 'p_once'));
      await db.update(D.deliveries).set({ nextAttemptAt: new Date() }).where(D.eq(D.deliveries.id, id));
      received.length = 0;
      await Promise.all([delivery.dispatchDelivery(id), delivery.dispatchDelivery(id), delivery.dispatchDelivery(id)]);
      expect(received).toHaveLength(1);
      expect((await deliveryRow(id)).nextAttemptAt).toBeNull();
    } finally {
      off();
    }
  });

  it("la notification SSE porte l'acheteur (filtrage des flux à jeton joueur)", async () => {
    const metas: (string | null)[] = [];
    const off = events.subscribe('gam_sdk', 'p_meta', (_e, meta) => metas.push(meta.userId));
    try {
      await delivery.enqueueDelivery(await order('gam_sdk', 'paid', 'p_meta', 'usr_b'));
      expect(metas).toEqual(['usr_b']);
    } finally {
      off();
    }
  });
});

describe('cron — réservation atomique (CHK-DLV-05, T-DLV-03)', () => {
  it('deux crons et un envoi manuel concurrents : chaque livraison due part une seule fois', async () => {
    responder = () => ({ status: 500 });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push(await delivery.enqueueDelivery(await order('gam_hook', 'paid', `p_cron${i}`)));
    responder = () => ({ status: 200 });
    hits.length = 0;
    for (const id of ids) await makeDue(id);
    await Promise.all([delivery.retryDueDeliveries(10), delivery.retryDueDeliveries(10), delivery.dispatchDelivery(ids[0]!)]);
    const sent = hits.map((h) => (JSON.parse(h.body) as PurchaseEvent).delivery_id).sort();
    expect(sent).toEqual([...ids].sort());
    for (const id of ids) expect((await deliveryRow(id)).status).toBe('delivered');
  });

  it("une livraison réservée (bail en cours) n'est pas reprise par un autre cron", async () => {
    responder = () => ({ status: 500 });
    const id = await delivery.enqueueDelivery(await order('gam_hook', 'paid', 'p_lease'));
    hits.length = 0;
    // Bail posé par un autre processus : la prochaine tentative est dans le futur.
    await db.update(D.deliveries).set({ nextAttemptAt: new Date(Date.now() + 30_000) }).where(D.eq(D.deliveries.id, id));
    await delivery.retryDueDeliveries(10);
    await delivery.dispatchDelivery(id);
    expect(hits).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- 2. SSRF */

describe('webhook — anti-SSRF (CHK-SSRF-02/03/04/05/07)', () => {
  it.each([
    ['http://api.studio.com/hook', 'https://'],
    ['https://127.0.0.1/hook', 'internes'],
    ['https://169.254.169.254/latest/meta-data/', 'internes'],
    ['https://10.0.0.5/hook', 'internes'],
    ['https://[::1]/hook', 'internes'],
    ['https://localhost/hook', 'internes'],
    ['https://2130706433/hook', 'internes'],
    ['https://user:pass@api.studio.com/hook', 'identifiants'],
    ['file:///etc/passwd', 'https://'],
    ['gopher://api.studio.com/', 'https://'],
  ])('production : refuse %s', (url, reason) => {
    const r = delivery.checkWebhookUrl(url, { production: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(reason);
  });

  it('production : accepte une URL https publique ; développement : localhost autorisé', () => {
    expect(delivery.checkWebhookUrl('https://api.studio.com/devappstore/webhook', { production: true }).ok).toBe(true);
    expect(delivery.checkWebhookUrl('http://localhost:4100/devappstore/webhook', { production: false }).ok).toBe(true);
  });

  it("à l'enregistrement, en production, résout le nom et refuse une adresse interne", async () => {
    expect(await delivery.validateWebhookUrl(`https://${REBIND_HOST}/hook`, { production: true })).toMatchObject({ ok: false });
    expect(await delivery.validateWebhookUrl(`https://${PUBLIC_HOST}/hook`, { production: true })).toMatchObject({ ok: true });
  });

  it("production : n'appelle jamais une URL http ni une IP interne (livraison et événement de test)", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = await delivery.postSignedWebhook(`${base}/webhook`, 'whsec_x', '{}');
    expect(r).toMatchObject({ ok: false, statusCode: null });
    expect(r.error).toContain('URL refusée');
    const t = await delivery.sendTestWebhook('gam_hook');
    expect(t.ok).toBe(false);
    expect(hits).toHaveLength(0);
  });

  it('production : nom public résolu vers 127.0.0.1 au moment de la connexion (DNS rebinding) → refusé sans connexion', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = await delivery.postSignedWebhook(`https://${REBIND_HOST}:${port}/webhook`, 'whsec_x', '{}');
    expect(r).toMatchObject({ ok: false, error: 'Adresse refusée (réseau interne ou privé).' });
    expect(hits).toHaveLength(0);
  });

  it("ne suit pas les redirections (302 vers l'IP de métadonnées = échec)", async () => {
    responder = (req) => (req.url === '/redirect' ? { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } } : { status: 200 });
    const r = await delivery.postSignedWebhook(`${base}/redirect`, 'whsec_x', '{}');
    expect(r).toMatchObject({ ok: false, statusCode: 302, error: 'Redirection refusée (HTTP 302)' });
    expect(hits.map((h) => h.path)).toEqual(['/redirect']);
  });

  it('normalise les erreurs réseau et journalise l’URL sans query string (CHK-DLV-15)', async () => {
    const id = await order('gam_hook', 'paid', 'p_err');
    await db.update(D.games).set({ webhookUrl: 'http://127.0.0.1:1/hook?token=secret123' }).where(D.eq(D.games.id, 'gam_hook'));
    try {
      const dlv = await delivery.enqueueDelivery(id);
      expect((await deliveryRow(dlv)).lastError).toBe('Connexion refusée');
      const [attempt] = await db.select().from(D.webhookAttempts).where(D.eq(D.webhookAttempts.deliveryId, dlv));
      expect(attempt!.url).toBe('http://127.0.0.1:1/hook');
      expect(attempt!.error).toBe('Connexion refusée');
    } finally {
      await db.update(D.games).set({ webhookUrl: `${base}/webhook` }).where(D.eq(D.games.id, 'gam_hook'));
    }
  });

  it('la signature porte sur le corps exact envoyé (CHK-DLV-03)', async () => {
    const dlv = await delivery.enqueueDelivery(await order('gam_hook', 'paid', 'p_sig'));
    const hit = hits.find((h) => h.path === '/webhook')!;
    expect(verifySignature(hit.body, hit.signature, 'whsec_gam_hook')).toBe(true);
    expect((JSON.parse(hit.body) as PurchaseEvent).delivery_id).toBe(dlv);
  });
});

/* ---------------------------------------------------------------- 3. reprise quand l'URL est enregistrée */

describe('livraisons en attente créées avant l’ajout du webhook', () => {
  it('sont reprises et envoyées quand une URL de webhook est enregistrée', async () => {
    const a = await delivery.enqueueDelivery(await order('gam_late', 'paid', 'p_late1'));
    const b = await delivery.enqueueDelivery(await order('gam_late', 'paid', 'p_late2'));
    expect((await deliveryRow(a)).nextAttemptAt).toBeNull(); // hors de la file de relance (attend le SDK)
    expect(await delivery.retryDueDeliveries(10)).toMatchObject({ processed: 0 });
    expect(hits).toHaveLength(0);

    // Sans URL : rien à reprendre.
    expect(await delivery.resumeParkedDeliveries('gam_late')).toBe(0);

    await db.update(D.games).set({ webhookUrl: `${base}/late` }).where(D.eq(D.games.id, 'gam_late'));
    expect(await delivery.resumeParkedDeliveries('gam_late')).toBe(2);
    await delivery.retryDueDeliveries(10);
    expect(hits.filter((h) => h.path === '/late').map((h) => (JSON.parse(h.body) as PurchaseEvent).delivery_id).sort()).toEqual([a, b].sort());
    expect((await deliveryRow(a)).status).toBe('delivered');
    expect((await deliveryRow(b)).status).toBe('delivered');
  });
});

/* ---------------------------------------------------------------- 4. remboursements */

describe('enqueueRefund — purchase.refunded par le même canal', () => {
  it('refuse une commande non remboursée ; null si rien n’a jamais été livré', async () => {
    const paid = await order('gam_hook', 'paid', 'p_r0');
    await expect(delivery.enqueueRefund(paid)).rejects.toMatchObject({ code: 'order_not_refunded' });
    const never = await order('gam_hook', 'refunded', 'p_r0');
    expect(await delivery.enqueueRefund(never)).toBeNull();
  });

  it('webhook : envoie un événement signé (même order_id, delivery_id propre), idempotent, journalisé', async () => {
    const o = await order('gam_hook', 'paid', 'p_r1');
    const purchaseId = await delivery.enqueueDelivery(o);
    await setOrderStatus(o, 'refunded');
    hits.length = 0;
    const [r1, r2] = await Promise.all([delivery.enqueueRefund(o), delivery.enqueueRefund(o)]);
    expect(r1).toBe(r2);
    expect(r1).not.toBe(purchaseId);
    expect(hits).toHaveLength(1);
    const ev = JSON.parse(hits[0]!.body) as PurchaseEvent;
    expect(ev).toMatchObject({ event: 'purchase.refunded', order_id: o, delivery_id: r1, product_id: 'gems_100', player_id: 'p_r1' });
    expect(verifySignature(hits[0]!.body, hits[0]!.signature, 'whsec_gam_hook')).toBe(true);
    expect((await refundRow(r1!)).status).toBe('delivered');
    expect((await deliveryRow(purchaseId)).status).toBe('delivered'); // achat déjà livré : inchangé
    const attempts = await db.select().from(D.webhookAttempts).where(D.eq(D.webhookAttempts.refundDeliveryId, r1!));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.deliveryId).toBe(purchaseId);
    expect((await delivery.listDeliveryLog('gam_hook')).some((d) => d.id === r1 && d.kind === 'refund')).toBe(true);
  });

  it('SDK : un achat non confirmé est arrêté, le remboursement est listé puis acquitté', async () => {
    const o = await order('gam_sdk', 'paid', 'p_r2');
    const purchaseId = await delivery.enqueueDelivery(o);
    await setOrderStatus(o, 'refunded');
    const received: PurchaseEvent[] = [];
    const off = events.subscribe('gam_sdk', 'p_r2', (e) => received.push(e));
    let refundId: string | null;
    try {
      refundId = await delivery.enqueueRefund(o);
    } finally {
      off();
    }
    expect(received.map((e) => e.event)).toEqual(['purchase.refunded']);
    expect((await deliveryRow(purchaseId)).status).toBe('failed'); // plus jamais livré après le remboursement
    expect(await delivery.retryDelivery('gam_sdk', purchaseId)).toBe('not_retryable');
    await expect(delivery.enqueueDelivery(o)).rejects.toMatchObject({ code: 'order_not_paid' });

    const list = await delivery.takeOpenDeliveries({ id: 'gam_sdk', webhookUrl: null }, 'p_r2');
    expect(list.map((e) => [e.event, e.delivery_id])).toEqual([['purchase.refunded', refundId]]);
    expect(await delivery.acknowledgeDelivery('gam_sdk', refundId!)).toBe('ok');
    expect((await refundRow(refundId!)).status).toBe('acknowledged');
    expect(await delivery.takeOpenDeliveries({ id: 'gam_sdk', webhookUrl: null }, 'p_r2')).toEqual([]);
  });

  it('liste : le remboursement suit son achat ; un autre jeu ne voit ni n’acquitte rien', async () => {
    const o = await order('gam_sdk', 'paid', 'p_r3');
    const purchaseId = await delivery.enqueueDelivery(o);
    await delivery.takeOpenDeliveries({ id: 'gam_sdk', webhookUrl: null }, 'p_r3'); // l'achat a été récupéré (delivered)
    await setOrderStatus(o, 'refunded');
    const refundId = await delivery.enqueueRefund(o);
    const list = await delivery.takeOpenDeliveries({ id: 'gam_sdk', webhookUrl: null }, 'p_r3');
    expect(list.map((e) => e.delivery_id)).toEqual([purchaseId, refundId]);
    expect(await delivery.acknowledgeDelivery('gam_hook', refundId!)).toBe('not_found');
    expect(await delivery.retryDelivery('gam_hook', refundId!)).toBe('not_found');
  });
});

/* ---------------------------------------------------------------- 5. cron */

describe('cron — CRON_SECRET (CHK-DLV-11)', () => {
  const req = (auth?: string) => new Request('http://x/api/cron/deliveries', { headers: auth ? { authorization: auth } : {} });
  it('exige le secret ; sans secret configuré, refusé en production et toléré en développement', () => {
    expect(isCronAuthorized(req('Bearer s3cret'), 's3cret', 'production')).toBe(true);
    expect(isCronAuthorized(req('Bearer autre'), 's3cret', 'production')).toBe(false);
    expect(isCronAuthorized(req(), 's3cret', 'production')).toBe(false);
    expect(isCronAuthorized(req('Bearer undefined'), undefined, 'production')).toBe(false);
    expect(isCronAuthorized(req(), '', 'production')).toBe(false);
    expect(isCronAuthorized(req(), undefined, 'development')).toBe(true);
  });
});
