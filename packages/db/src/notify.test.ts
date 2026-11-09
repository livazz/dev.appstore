import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';
import {
  DELIVERY_CHANNEL,
  MemoryNotifyHub,
  createMemoryNotifyTransport,
  createPgliteNotifyTransport,
  createPostgresNotifyTransport,
  type PostgresNotifyClient,
} from './notify';

const until = async (cond: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
};

describe('transport mémoire', () => {
  it('relaie entre deux transports du même hub (deux instances), y compris vers l’émetteur', async () => {
    const hub = new MemoryNotifyHub();
    const a = createMemoryNotifyTransport(hub);
    const b = createMemoryNotifyTransport(hub);
    const gotA: string[] = [];
    const gotB: string[] = [];
    const ready = vi.fn();
    await a.listen(DELIVERY_CHANNEL, (p) => gotA.push(p));
    const stop = await b.listen(DELIVERY_CHANNEL, (p) => gotB.push(p), { onReady: ready });
    expect(ready).toHaveBeenCalledWith({ reconnect: false });
    await a.notify(DELIVERY_CHANNEL, 'x');
    expect(gotB).toEqual([]); // jamais synchrone
    await until(() => gotB.length > 0);
    expect(gotB).toEqual(['x']);
    expect(gotA).toEqual(['x']);
    await stop();
    await stop(); // idempotent
    await a.notify(DELIVERY_CHANNEL, 'y');
    await until(() => gotA.length > 1);
    expect(gotB).toEqual(['x']);
    await a.close();
    expect(hub.listeners(DELIVERY_CHANNEL)).toBe(0);
  });

  it('refuse un canal invalide et une charge utile trop longue', async () => {
    const t = createMemoryNotifyTransport();
    await expect(t.notify('canal; drop table x', 'p')).rejects.toThrow(/canal/);
    await expect(t.notify(DELIVERY_CHANNEL, 'x'.repeat(8000))).rejects.toThrow(/trop longue/);
  });
});

describe('transport PGlite (LISTEN/NOTIFY réels)', () => {
  it('pg_notify réveille les écouteurs, y compris un second transport sur la même base', async () => {
    const pg = new PGlite();
    const a = createPgliteNotifyTransport(pg);
    const b = createPgliteNotifyTransport(pg);
    const got: string[] = [];
    const stop = await b.listen(DELIVERY_CHANNEL, (p) => got.push(p));
    await a.notify(DELIVERY_CHANNEL, '{"v":1}');
    await until(() => got.length > 0);
    expect(got).toEqual(['{"v":1}']);
    await stop();
    await a.notify(DELIVERY_CHANNEL, 'apres');
    await new Promise((r) => setTimeout(r, 50));
    expect(got).toHaveLength(1);
    await pg.close();
  });
});

describe('transport Postgres (postgres-js simulé)', () => {
  function fakeClient() {
    let onlisten: (() => void) | undefined;
    let onnotify: ((v: string) => void) | undefined;
    const client: PostgresNotifyClient & { reconnect(): void; deliver(v: string): void; notified: [string, string][]; ended: boolean } = {
      notified: [],
      ended: false,
      async listen(_c, fn, ol) {
        onnotify = fn;
        onlisten = ol;
        ol?.();
        return { unlisten: async () => void (onnotify = undefined) };
      },
      async notify(c, p) {
        client.notified.push([c, p]);
      },
      async end() {
        client.ended = true;
      },
      reconnect: () => onlisten?.(),
      deliver: (v) => onnotify?.(v),
    };
    return client;
  }

  it('signale la première écoute puis chaque reconnexion (rattrapage côté appelant)', async () => {
    const c = fakeClient();
    const t = createPostgresNotifyTransport(c);
    const ready: boolean[] = [];
    const got: string[] = [];
    const stop = await t.listen(DELIVERY_CHANNEL, (p) => got.push(p), { onReady: ({ reconnect }) => ready.push(reconnect) });
    c.reconnect();
    c.reconnect();
    expect(ready).toEqual([false, true, true]);
    c.deliver('m');
    expect(got).toEqual(['m']);
    await t.notify(DELIVERY_CHANNEL, 'p');
    expect(c.notified).toEqual([[DELIVERY_CHANNEL, 'p']]);
    await stop();
    c.deliver('n');
    expect(got).toEqual(['m']);
    await t.close();
    expect(c.ended).toBe(true);
  });
});
