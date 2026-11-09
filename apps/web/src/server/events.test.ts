/*
 * Bus d'événements multi-instance (vague 6 « realtime ») : deux « instances » = deux bus dans le même test.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PurchaseEvent } from '@devappstore/core';
import { MemoryNotifyHub, createMemoryNotifyTransport, type ListenOptions, type NotifyTransport } from '@devappstore/db';

vi.mock('server-only', () => ({}));

const { createEventBus, defaultTransport } = await import('./events');

const ev = (id: string, extra: Partial<PurchaseEvent> = {}): PurchaseEvent => ({
  event: 'purchase.completed', delivery_id: id, order_id: `ord_${id}`, game_id: 'gam_x', player_id: 'p1', product_id: 'gems',
  item_type: 'consumable', quantity: 1, amount_cents: 499, currency: 'EUR', created_at: '2026-11-09T00:00:00.000Z', ...extra,
});

const until = async (cond: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
};

/** « Base » partagée par les instances : la livraison telle qu'enregistrée. */
function fakeDb(rows: Record<string, { gameId: string; playerId: string; event: PurchaseEvent; userId: string | null }>) {
  const calls: string[] = [];
  const resolve = async (id: string) => {
    calls.push(id);
    const r = rows[id];
    return r ? { gameId: r.gameId, playerId: r.playerId, event: r.event, meta: { userId: r.userId } } : null;
  };
  return { resolve, calls };
}

describe('bus local (compatibilité)', () => {
  it('notifie synchronément les abonnés de l’instance, désabonnement, compteur', () => {
    const bus = createEventBus({ transport: null });
    const got: string[] = [];
    const off = bus.subscribe('gam_x', 'p1', (e) => got.push(e.delivery_id));
    expect(bus.subscriberCount('gam_x', 'p1')).toBe(1);
    expect(bus.publish('gam_x', 'p1', ev('dlv_1'))).toBe(1);
    expect(got).toEqual(['dlv_1']);
    expect(bus.publish('gam_x', 'p2', ev('dlv_2'))).toBe(0);
    off();
    off();
    expect(bus.subscriberCount('gam_x', 'p1')).toBe(0);
  });

  it('un abonné en erreur n’empêche pas les autres', () => {
    const bus = createEventBus({ transport: null });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const got: string[] = [];
    bus.subscribe('gam_x', 'p1', () => {
      throw new Error('boum');
    });
    bus.subscribe('gam_x', 'p1', (e) => got.push(e.delivery_id));
    expect(bus.publish('gam_x', 'p1', ev('dlv_1'))).toBe(1);
    expect(got).toEqual(['dlv_1']);
    err.mockRestore();
  });

  it('sous vitest, le transport par défaut est la mémoire (aucune connexion)', async () => {
    expect(await defaultTransport({ VITEST: 'true', DATABASE_URL: 'postgres://x' })).toBeNull();
    expect(await defaultTransport({ EVENTS_TRANSPORT: 'memory' })).toBeNull();
    await expect(defaultTransport({ EVENTS_TRANSPORT: 'redis' })).rejects.toThrow(/inconnu/);
    await expect(defaultTransport({ EVENTS_TRANSPORT: 'pglite', DATABASE_URL: 'postgres://x' })).rejects.toThrow(/DATABASE_URL/);
  });
});

describe('deux instances (NOTIFY)', () => {
  function twoInstances(rows: Parameters<typeof fakeDb>[0]) {
    const hub = new MemoryNotifyHub();
    const sent: string[] = [];
    const tA = createMemoryNotifyTransport(hub);
    const spyA: NotifyTransport = { ...tA, notify: async (c, p) => (sent.push(p), tA.notify(c, p)) };
    const dbA = fakeDb(rows);
    const dbB = fakeDb(rows);
    const a = createEventBus({ transport: spyA, instanceId: 'A', resolve: dbA.resolve });
    const b = createEventBus({ transport: createMemoryNotifyTransport(hub), instanceId: 'B', resolve: dbB.resolve });
    return { a, b, sent, dbA, dbB };
  }

  it('un NOTIFY de l’instance A réveille l’abonné de l’instance B, qui relit la base', async () => {
    // En base : le montant réel. L'événement publié par A est volontairement différent : B doit relire la base.
    const stored = ev('dlv_9', { amount_cents: 1999 });
    const { a, b, sent, dbB } = twoInstances({ dlv_9: { gameId: 'gam_x', playerId: 'p1', event: stored, userId: 'usr_1' } });
    const got: { e: PurchaseEvent; user: string | null }[] = [];
    b.subscribe('gam_x', 'p1', (e, meta) => got.push({ e, user: meta.userId }));
    await b.ready();

    expect(a.publish('gam_x', 'p1', ev('dlv_9', { amount_cents: 1 }), { userId: 'usr_1' })).toBe(0); // personne sur A
    await a.idle();
    await until(() => got.length > 0);
    await b.idle();
    expect(got).toEqual([{ e: stored, user: 'usr_1' }]);
    expect(dbB.calls).toEqual(['dlv_9']);

    // Charge utile minimale : identifiants seulement (ni montant, ni acheteur, ni secret).
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toEqual({ v: 1, o: 'A', g: 'gam_x', p: 'p1', d: 'dlv_9' });
    await a.close();
    await b.close();
  });

  it('l’émetteur ne double pas ses propres abonnés ; une instance sans flux pour ce joueur ne relit rien', async () => {
    const { a, b, dbA, dbB } = twoInstances({ dlv_1: { gameId: 'gam_x', playerId: 'p1', event: ev('dlv_1'), userId: null } });
    const gotA: string[] = [];
    a.subscribe('gam_x', 'p1', (e) => gotA.push(e.delivery_id));
    b.subscribe('gam_x', 'autre', () => {});
    await Promise.all([a.ready(), b.ready()]);
    expect(a.publish('gam_x', 'p1', ev('dlv_1'))).toBe(1);
    await a.idle();
    await new Promise((r) => setTimeout(r, 30));
    await b.idle();
    expect(gotA).toEqual(['dlv_1']);
    expect(dbA.calls).toEqual([]);
    expect(dbB.calls).toEqual([]);
  });

  it('ignore une livraison inconnue ou qui ne correspond pas au (jeu, joueur) annoncé, et les messages invalides', async () => {
    const hub = new MemoryNotifyHub();
    const db = fakeDb({ dlv_other: { gameId: 'gam_x', playerId: 'p2', event: ev('dlv_other'), userId: null } });
    const b = createEventBus({ transport: createMemoryNotifyTransport(hub), instanceId: 'B', resolve: db.resolve });
    const got: string[] = [];
    b.subscribe('gam_x', 'p1', (e) => got.push(e.delivery_id));
    await b.ready();
    const raw = createMemoryNotifyTransport(hub);
    await raw.notify('devappstore_deliveries', JSON.stringify({ v: 1, o: 'Z', g: 'gam_x', p: 'p1', d: 'dlv_other' }));
    await raw.notify('devappstore_deliveries', JSON.stringify({ v: 1, o: 'Z', g: 'gam_x', p: 'p1', d: 'dlv_absente' }));
    await raw.notify('devappstore_deliveries', 'pas du json');
    await raw.notify('devappstore_deliveries', JSON.stringify({ v: 2, o: 'Z', g: 'gam_x', p: 'p1', d: 'dlv_other' }));
    await until(() => db.calls.length >= 2);
    await new Promise((r) => setTimeout(r, 20));
    await b.idle();
    expect(db.calls).toEqual(['dlv_other', 'dlv_absente']);
    expect(got).toEqual([]);
  });

  it('les réceptions sont traitées dans l’ordre (le remboursement après l’achat)', async () => {
    const hub = new MemoryNotifyHub();
    const rows = {
      dlv_p: { gameId: 'gam_x', playerId: 'p1', event: ev('dlv_p'), userId: null },
      rfd_p: { gameId: 'gam_x', playerId: 'p1', event: ev('rfd_p', { event: 'purchase.refunded' }), userId: null },
    };
    // L'achat est plus lent à relire que le remboursement.
    const resolve = async (id: string) => {
      await new Promise((r) => setTimeout(r, id === 'dlv_p' ? 40 : 1));
      const r = rows[id as keyof typeof rows];
      return { gameId: r.gameId, playerId: r.playerId, event: r.event, meta: { userId: null } };
    };
    const a = createEventBus({ transport: createMemoryNotifyTransport(hub), instanceId: 'A', resolve });
    const b = createEventBus({ transport: createMemoryNotifyTransport(hub), instanceId: 'B', resolve });
    const got: string[] = [];
    b.subscribe('gam_x', 'p1', (e) => got.push(e.delivery_id));
    await b.ready();
    a.publish('gam_x', 'p1', rows.dlv_p.event);
    a.publish('gam_x', 'p1', rows.rfd_p.event);
    await a.idle();
    await until(() => got.length === 2);
    expect(got).toEqual(['dlv_p', 'rfd_p']);
  });
});

describe('reconnexion et pannes', () => {
  /** Transport piloté : échecs d'écoute / de NOTIFY et reconnexions à la demande. */
  function controlled() {
    let ready: ListenOptions['onReady'];
    const state = { listenFailures: 0, notifyFailures: 0, notified: [] as string[], listens: 0 };
    const t: NotifyTransport = {
      kind: 'postgres',
      async listen(_c, _fn, opts) {
        state.listens++;
        if (state.listenFailures > 0) {
          state.listenFailures--;
          throw new Error('connexion refusée');
        }
        ready = opts?.onReady;
        ready?.({ reconnect: false });
        return async () => {};
      },
      async notify(_c, p) {
        if (state.notifyFailures > 0) {
          state.notifyFailures--;
          throw new Error('coupure');
        }
        state.notified.push(p);
      },
      async close() {},
    };
    return { t, state, reconnect: () => ready?.({ reconnect: true }) };
  }

  it('chaque (r)établissement de l’écoute déclenche onResync chez tous les abonnés', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = controlled();
    const bus = createEventBus({ transport: c.t, instanceId: 'B', resolve: async () => null });
    const resyncs: string[] = [];
    bus.subscribe('gam_x', 'p1', () => {}, { onResync: () => resyncs.push('p1') });
    bus.subscribe('gam_x', 'p2', () => {}, { onResync: () => resyncs.push('p2') });
    await bus.ready();
    expect(resyncs.sort()).toEqual(['p1', 'p2']); // première écoute : rattrapage des flux ouverts avant elle
    resyncs.length = 0;
    c.reconnect();
    expect(resyncs.sort()).toEqual(['p1', 'p2']);
    expect(c.state.listens).toBe(1); // une seule connexion LISTEN par instance, quel que soit le nombre de flux
    warn.mockRestore();
  });

  it('écoute impossible au démarrage : nouvel essai, puis rattrapage', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = controlled();
    c.state.listenFailures = 2;
    const bus = createEventBus({ transport: c.t, instanceId: 'B', resolve: async () => null, listenRetryMs: 5 });
    let resyncs = 0;
    bus.subscribe('gam_x', 'p1', () => {}, { onResync: () => resyncs++ });
    await bus.ready(); // ne bloque pas les flux pendant la panne
    await until(() => resyncs > 0);
    expect(c.state.listens).toBe(3);
    expect(resyncs).toBe(1);
    err.mockRestore();
    warn.mockRestore();
  });

  it('NOTIFY en échec : nouvelles tentatives, puis abandon journalisé sans casser publish', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = controlled();
    const bus = createEventBus({ transport: c.t, instanceId: 'A', retryDelaysMs: [1, 1] });
    c.state.notifyFailures = 2;
    bus.publish('gam_x', 'p1', ev('dlv_ok'));
    await bus.idle();
    expect(c.state.notified.map((p) => JSON.parse(p).d)).toEqual(['dlv_ok']);
    c.state.notifyFailures = 5;
    expect(bus.publish('gam_x', 'p1', ev('dlv_ko'))).toBe(0);
    await bus.idle();
    expect(c.state.notified).toHaveLength(1);
    expect(err).toHaveBeenCalledWith('[events] NOTIFY abandonné', { delivery: 'dlv_ko' }, expect.any(Error));
    err.mockRestore();
  });

  it('transport indisponible : bus local seulement', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus({ transport: async () => Promise.reject(new Error('pas de base')) });
    const got: string[] = [];
    bus.subscribe('gam_x', 'p1', (e) => got.push(e.delivery_id));
    await bus.ready();
    expect(bus.publish('gam_x', 'p1', ev('dlv_1'))).toBe(1);
    await bus.idle();
    expect(got).toEqual(['dlv_1']);
    err.mockRestore();
  });
});
