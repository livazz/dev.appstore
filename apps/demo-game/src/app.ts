import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { DevAppStore, DevAppStoreError, type PlayerLookupResponse, type PurchaseEvent } from '@devappstore/sdk';
import { SIGNATURE_HEADER, signWebhookPayload, verifyLookupSignature, verifyWebhookSignature } from '@devappstore/sdk/server';
import { findPlayer, GRANTS, PLAYERS, STARTING_INVENTORY } from './catalog';
import type { DemoConfig, DemoGame, GameKey } from './config';
import { sdkModule } from './sdk-bundle';
import { InventoryStore } from './store';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const STATIC: Record<string, string> = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/game.js': 'game.js',
  '/game.css': 'game.css',
};
const MIME: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
const MAX_BODY = 64 * 1024;

export interface DemoAppOptions {
  config: DemoConfig;
  store?: InventoryStore;
  /** fetch utilisé pour parler à Dev AppStore (proxy, codes de liaison, acks). */
  fetch?: typeof fetch;
  /** Après un webhook crédité, le serveur confirme aussi via l'API (statut « acknowledged »). Défaut : true. */
  ackWebhooks?: boolean;
  log?: (msg: string) => void;
}

export interface DemoApp {
  server: Server;
  store: InventoryStore;
  /** Traite un webhook brut (exposé pour les tests). */
  handleWebhook(rawBody: string, signature: string | undefined, options?: { ack?: boolean }): Promise<{ status: number; body: unknown }>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'payload_too_large', 'Corps trop volumineux.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Corps JSON invalide.');
  }
}

function isPurchaseEvent(e: unknown): e is PurchaseEvent {
  const o = e as Record<string, unknown> | null;
  return (
    !!o &&
    (o.event === 'purchase.completed' || o.event === 'purchase.refunded') &&
    typeof o.delivery_id === 'string' &&
    typeof o.player_id === 'string' &&
    typeof o.product_id === 'string' &&
    typeof o.game_id === 'string' &&
    typeof o.quantity === 'number'
  );
}

export function createDemoApp(opts: DemoAppOptions): DemoApp {
  const { config } = opts;
  const store = opts.store ?? new InventoryStore();
  const log = opts.log ?? ((m: string) => console.log(`[demo-game] ${m}`));
  const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const games = Object.values(config.games);
  const gameByKey = (k: unknown): DemoGame => {
    const g = typeof k === 'string' ? config.games[k as GameKey] : undefined;
    if (!g) throw new HttpError(400, 'invalid_game', 'Paramètre game invalide (crystal ou farm).');
    return g;
  };
  /** Client SDK côté serveur (mode webhook) : codes de liaison et acks. */
  const sdkClients = new Map<GameKey, DevAppStore>();
  const serverSdk = (g: DemoGame) => {
    let c = sdkClients.get(g.key);
    if (!c) {
      c = new DevAppStore({ apiKey: g.apiKey, baseUrl: config.devAppStoreUrl, fetch: fetchImpl });
      sdkClients.set(g.key, c);
    }
    return c;
  };

  // ------------------------------------------------------------ Webhook

  async function handleWebhook(raw: string, signature: string | undefined, { ack = opts.ackWebhooks !== false } = {}) {
    // Le secret qui valide la signature désigne le jeu.
    const game = games.find((g) => verifyWebhookSignature(raw, signature, g.webhookSecret));
    if (!game) {
      log('webhook refusé : signature invalide ou absente');
      return { status: 401, body: { error: { code: 'invalid_signature', message: 'Signature Dev AppStore invalide.' } } };
    }
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return { status: 400, body: { error: { code: 'invalid_json', message: 'Corps JSON invalide.' } } };
    }
    if (!isPurchaseEvent(event) || event.game_id !== game.id) {
      return { status: 400, body: { error: { code: 'invalid_event', message: 'Événement inattendu.' } } };
    }
    const r = store.credit(game.key, event);
    if (r.duplicate) log(`webhook ${event.delivery_id} déjà traité (rejeu ignoré)`);
    else if (r.ignored) log(`remboursement ${event.delivery_id} : commande ${event.order_id} jamais créditée, rien à retirer`);
    else if (r.unknownProduct) log(`webhook ${event.delivery_id} : produit inconnu ${event.product_id}, rien crédité`);
    else log(`${game.name} : ${event.player_id} crédité de ${JSON.stringify(r.record?.delta)} (${event.delivery_id})`);
    if (!r.duplicate && ack) {
      serverSdk(game)
        .ack(event.delivery_id)
        .catch((e) => log(`ack ${event.delivery_id} non envoyé : ${e instanceof Error ? e.message : e}`));
    }
    return { status: 200, body: { ok: true, duplicate: r.duplicate } };
  }

  // ------------------------------------------------------- Player lookup

  function handleLookup(req: IncomingMessage, res: ServerResponse, rawParam: string) {
    let input: string;
    try {
      input = decodeURIComponent(rawParam);
    } catch {
      throw new HttpError(400, 'invalid_player_id', 'ID joueur mal encodé.');
    }
    const sig = req.headers[SIGNATURE_HEADER.toLowerCase()];
    if (sig !== undefined) {
      // Dev AppStore signe « devappstore-lookup-v1:<ID brut saisi> » (espaces de bord retirés) avec le secret webhook du jeu.
      const header = Array.isArray(sig) ? sig[0] : sig;
      const ok = games.some((g) => verifyLookupSignature(input.trim(), header, g.webhookSecret));
      if (!ok) throw new HttpError(401, 'invalid_signature', 'Signature Dev AppStore invalide.');
    }
    const p = findPlayer(input);
    if (!p) throw new HttpError(404, 'player_not_found', 'Joueur introuvable.');
    const body: PlayerLookupResponse = { player_id: p.id, display_name: p.name, level: p.level };
    json(res, 200, body);
  }

  // ------------------------------------------------------------ API du jeu

  function handleEvents(req: IncomingMessage, res: ServerResponse, url: URL) {
    const game = gameByKey(url.searchParams.get('game'));
    const player = url.searchParams.get('player') ?? '';
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
    res.write(`event: state\ndata: ${JSON.stringify(store.get(game.key, player))}\n\n`);
    const onUpdate = (u: { game: GameKey; playerId: string }) => {
      if (u.game === game.key && u.playerId === player) res.write(`event: inventory\ndata: ${JSON.stringify(u)}\n\n`);
    };
    store.on('update', onUpdate);
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(ping);
      store.off('update', onUpdate);
    });
  }

  async function handleLinkCode(req: IncomingMessage, res: ServerResponse) {
    const body = parseJson<{ game?: string; player_id?: string }>(await readBody(req));
    const game = gameByKey(body.game);
    const p = findPlayer(body.player_id ?? '');
    if (!p) throw new HttpError(400, 'invalid_player_id', 'Joueur inconnu.');
    try {
      const code = await serverSdk(game).requestLinkCode(p.id, p.name);
      log(`${game.name} : code de liaison ${code.code} pour ${p.id}`);
      json(res, 200, code);
    } catch (e) {
      const status = e instanceof DevAppStoreError && e.status ? e.status : 502;
      const message =
        e instanceof DevAppStoreError && e.status
          ? e.message
          : `Dev AppStore injoignable sur ${config.devAppStoreUrl} (lancez « npm run dev » dans le dépôt).`;
      json(res, status, { error: { code: e instanceof DevAppStoreError ? e.code : 'devappstore_unreachable', message } });
    }
  }

  /** Simule un achat Dev AppStore (webhook signé) sans passer par le site : utile hors ligne. */
  async function handleSimulate(req: IncomingMessage, res: ServerResponse) {
    const body = parseJson<{ player_id?: string; product_id?: string }>(await readBody(req));
    const p = findPlayer(body.player_id ?? '');
    const productId = body.product_id ?? 'gems_1200';
    if (!p || !GRANTS[productId]) throw new HttpError(400, 'invalid_request', 'Joueur ou produit inconnu.');
    const game = config.games.crystal;
    const event: PurchaseEvent = {
      event: 'purchase.completed',
      delivery_id: `dlv_sim_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      order_id: `ord_sim_${Date.now().toString(36)}`,
      game_id: game.id,
      player_id: p.id,
      product_id: productId,
      item_type: 'consumable',
      quantity: 0,
      amount_cents: 0,
      currency: 'EUR',
      created_at: new Date().toISOString(),
    };
    const raw = JSON.stringify(event);
    // Livraison fictive : rien à acquitter chez Dev AppStore.
    const r = await handleWebhook(raw, signWebhookPayload(raw, game.webhookSecret), { ack: false });
    json(res, r.status, r.body);
  }

  function handleConfig(res: ServerResponse) {
    json(res, 200, {
      devAppStoreUrl: config.devAppStoreUrl,
      players: PLAYERS,
      grants: GRANTS,
      startingInventory: STARTING_INVENTORY,
      games: Object.fromEntries(
        games.map((g) => [
          g.key,
          // Seule la clé PUBLIQUE du jeu en mode SDK est transmise au navigateur ; les clés secrètes restent sur ce serveur.
          { key: g.key, id: g.id, slug: g.slug, name: g.name, mode: g.mode, ...(g.mode === 'sdk' ? { publishableKey: g.publishableKey } : {}) },
        ]),
      ),
    });
  }

  // -------------------------------------------------- Proxy vers Dev AppStore

  /**
   * /proxy/api/v1/* → DEVAPPSTORE_URL/api/v1/* : relais même origine (facultatif — l'API v1 autorise CORS et la page du jeu
   * appelle Dev AppStore directement). Utile derrière un réseau qui bloque l'origine de Dev AppStore. Le flux SSE est relayé tel quel.
   */
  async function handleProxy(req: IncomingMessage, res: ServerResponse, url: URL) {
    const path = url.pathname.slice('/proxy'.length);
    if (!path.startsWith('/api/v1/')) throw new HttpError(404, 'not_found', 'Introuvable.');
    const headers: Record<string, string> = {};
    for (const h of ['authorization', 'content-type', 'accept', 'last-event-id', 'devappstore-player-token']) {
      const v = req.headers[h];
      if (typeof v === 'string') headers[h] = v;
    }
    const method = req.method ?? 'GET';
    const body = method === 'POST' ? await readBody(req) : undefined;
    const ctrl = new AbortController();
    res.on('close', () => ctrl.abort());
    let upstream: Response;
    try {
      upstream = await fetchImpl(config.devAppStoreUrl + path + url.search, { method, headers, body, signal: ctrl.signal });
    } catch {
      return json(res, 502, { error: { code: 'devappstore_unreachable', message: `Dev AppStore injoignable sur ${config.devAppStoreUrl}.` } });
    }
    const out: Record<string, string> = { 'cache-control': 'no-store' };
    const ct = upstream.headers.get('content-type');
    if (ct) out['content-type'] = ct;
    if (ct?.includes('text/event-stream')) out['x-accel-buffering'] = 'no';
    res.writeHead(upstream.status, out);
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body as unknown as NodeReadableStream<Uint8Array>)
      .on('error', () => res.end())
      .pipe(res);
  }

  // ------------------------------------------------------------ Routeur

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const p = url.pathname;

    if (method === 'GET' && STATIC[p]) {
      const file = STATIC[p]!;
      const content = await readFile(PUBLIC_DIR + file);
      res.writeHead(200, { 'content-type': MIME[file.split('.').pop()!]!, 'cache-control': 'no-cache' });
      return res.end(content);
    }
    if (method === 'GET' && p.startsWith('/sdk/')) {
      const js = await sdkModule(p.slice('/sdk/'.length));
      if (!js) throw new HttpError(404, 'not_found', 'Module inconnu.');
      res.writeHead(200, { 'content-type': MIME.js!, 'cache-control': 'no-cache' });
      return res.end(js);
    }
    if (method === 'GET' && p.startsWith('/devappstore/players/')) return handleLookup(req, res, p.slice('/devappstore/players/'.length));
    if (method === 'POST' && p === '/devappstore/webhook') {
      const raw = await readBody(req);
      const sig = req.headers[SIGNATURE_HEADER.toLowerCase()];
      const r = await handleWebhook(raw, Array.isArray(sig) ? sig[0] : sig);
      return json(res, r.status, r.body);
    }
    if (method === 'GET' && p === '/api/config') return handleConfig(res);
    if (method === 'GET' && p === '/api/state') {
      const game = gameByKey(url.searchParams.get('game'));
      return json(res, 200, store.get(game.key, url.searchParams.get('player') ?? ''));
    }
    if (method === 'GET' && p === '/api/events') return handleEvents(req, res, url);
    if (method === 'POST' && p === '/api/link-code') return handleLinkCode(req, res);
    if (method === 'POST' && p === '/api/dev/simulate') return handleSimulate(req, res);
    if (p.startsWith('/proxy/') && (method === 'GET' || method === 'POST' || method === 'DELETE')) return handleProxy(req, res, url);
    if (method === 'GET' && p === '/favicon.ico') return res.writeHead(204).end();
    throw new HttpError(404, 'not_found', 'Introuvable.');
  }

  const server = createServer((req, res) => {
    route(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return json(res, e.status, { error: { code: e.code, message: e.message } });
      log(`erreur : ${e instanceof Error ? e.stack : e}`);
      json(res, 500, { error: { code: 'internal', message: 'Erreur interne.' } });
    });
  });

  return { server, store, handleWebhook };
}
