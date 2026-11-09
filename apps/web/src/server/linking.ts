import 'server-only';
import { lookup as dnsLookup, promises as dnsPromises, type LookupAddress } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { z } from 'zod';
import {
  LINK_CODE_TTL_MS,
  SIGNATURE_HEADER,
  generateLinkCode,
  newId,
  normalizeLinkCode,
  signPayload,
  type LinkMethod,
  type PlayerLookupResponse,
} from '@wolleen/core';
import { and, asc, db, desc, eq, gameLinks, games, gt, isNull, items, linkAttempts, linkCodes, lt, studioMembers, type DB } from '@wolleen/db';

/*
 * Liaison d'un compte Wolleen à un compte de jeu (tâche « linking »). Point de sécurité critique :
 *
 * - `code` (vérifié) : le jeu demande un code via POST /api/v1/link-codes ; le joueur le saisit sur
 *   /games/[slug]/link. Le code est consommé atomiquement (UPDATE … WHERE consumed_at IS NULL AND expires_at > now),
 *   une seule fois, uniquement pour le jeu qui l'a émis. Les saisies erronées sont limitées par utilisateur.
 *
 * - `id_confirm` (déclaratif) : le joueur saisit son ID ; Wolleen appelle l'endpoint « player lookup » du studio
 *   (protégé contre le SSRF) puis demande « Est-ce bien vous ? ». La confirmation ne fait confiance qu'à la recherche
 *   enregistrée côté serveur (link_attempts), jamais au nom renvoyé par le navigateur.
 *
 * Format de l'appel « player lookup » (à implémenter par le studio) :
 *
 *   GET <games.playerLookupUrl, « {player_id} » remplacé par encodeURIComponent(player_id)>
 *   Accept: application/json
 *   User-Agent: Wolleen-PlayerLookup/1.0
 *   Wolleen-Signature: t=<unix>,v1=<hex>
 *
 *   où v1 = HMAC-SHA256(secret webhook du jeu, `${t}.${player_id}`) — c.-à-d. signPayload(player_id, secret) de
 *   @wolleen/core, le « corps » signé étant l'ID joueur brut (décodé, tel que saisi, espaces de bord retirés).
 *   Côté studio : verifySignature(decodeURIComponent(param), req.headers['wolleen-signature'], secret).
 *   Signer l'ID (et pas un corps vide) empêche de rejouer une signature pour un autre joueur.
 *
 *   Réponses : 200 + PlayerLookupResponse JSON `{ player_id, display_name, level?, avatar_url? }`, 404 si inconnu.
 *   Pas de redirection suivie, délai max 5 s, réponse max 16 Ko. Le `player_id` renvoyé fait foi (il peut
 *   canonicaliser la saisie, ex. pseudo → ID).
 */

type Game = typeof games.$inferSelect;
export type GameLink = typeof gameLinks.$inferSelect;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Executor = DB | Tx;

export const LINK_LIMITS = {
  /** Codes générés par jeu et par fenêtre (API /api/v1/link-codes). */
  codesPerGame: { max: 120, windowMs: 60_000 },
  /** Saisies de code erronées par utilisateur (tous jeux confondus) avant blocage temporaire. */
  codeFailuresPerUser: { max: 5, windowMs: 15 * 60_000 },
  /** Appels « player lookup » par utilisateur (anti énumération des joueurs, protège le serveur du studio). */
  lookupsPerUser: { max: 10, windowMs: 10 * 60_000 },
  /** Délai pour confirmer « Est-ce bien vous ? » après une recherche réussie. */
  lookupConfirmTtlMs: 10 * 60_000,
  lookupTimeoutMs: 5_000,
  lookupMaxBytes: 16 * 1024,
  /** Les codes expirés depuis plus longtemps sont purgés à la création d'un nouveau code. */
  codeRetentionMs: 24 * 3600_000,
};

export const LINK_METHOD_LABELS: Record<LinkMethod, string> = {
  code: 'Code affiché dans le jeu',
  id_confirm: 'Identifiant joueur',
  oauth: 'Connexion au compte du jeu',
};

export type LinkErrorCode =
  | 'method_disabled'
  | 'invalid_input'
  | 'invalid_format'
  | 'invalid_code'
  | 'rate_limited'
  | 'not_configured'
  | 'unsafe_url'
  | 'player_not_found'
  | 'lookup_failed'
  | 'invalid_response'
  | 'expired';

export interface LinkFailure {
  ok: false;
  error: LinkErrorCode;
  message: string;
  retryAfterS?: number;
  remaining?: number;
}
export type LinkResult<T extends object> = ({ ok: true } & T) | LinkFailure;

function fail(error: LinkErrorCode, message: string, extra: Pick<LinkFailure, 'retryAfterS' | 'remaining'> = {}): LinkFailure {
  return { ok: false, error, message, ...extra };
}

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms);
const minutes = (s: number) => Math.max(1, Math.ceil(s / 60));

/* ------------------------------------------------------------------------------------------------ */
/* Codes de liaison (méthode `code`)                                                                 */
/* ------------------------------------------------------------------------------------------------ */

/** Corps de POST /api/v1/link-codes. */
export const linkCodeRequestSchema = z.object({
  player_id: z.string().trim().min(1).max(128),
  player_name: z.string().trim().max(64).nullish(),
});

/**
 * Émet un code pour un joueur du jeu (appelé par l'API, jeu déjà authentifié par sa clé).
 * Unique par jeu, valable LINK_CODE_TTL_MS ; invalide les codes encore actifs du même joueur.
 */
export async function createLinkCode(
  game: Pick<Game, 'id' | 'linkMethods'>,
  input: { playerId: string; playerName?: string | null },
  opts: { now?: Date; generate?: () => string } = {},
): Promise<LinkResult<{ code: string; expiresAt: Date }>> {
  if (!game.linkMethods.includes('code')) return fail('method_disabled', 'La liaison par code est désactivée pour ce jeu.');
  const now = opts.now ?? new Date();
  const { max, windowMs } = LINK_LIMITS.codesPerGame;
  const recent = await db
    .select({ createdAt: linkCodes.createdAt })
    .from(linkCodes)
    .where(and(eq(linkCodes.gameId, game.id), gt(linkCodes.createdAt, ago(now, windowMs))))
    .orderBy(desc(linkCodes.createdAt))
    .limit(max);
  if (recent.length >= max) {
    const retry = Math.ceil((recent[max - 1].createdAt.getTime() + windowMs - now.getTime()) / 1000);
    return fail('rate_limited', 'Trop de codes demandés pour ce jeu, réessayez dans un instant.', { retryAfterS: Math.max(1, retry) });
  }

  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  const generate = opts.generate ?? generateLinkCode;
  const code = await db.transaction(async (tx) => {
    // Un seul code actif par joueur : les précédents non consommés expirent immédiatement.
    await tx
      .update(linkCodes)
      .set({ expiresAt: now })
      .where(and(eq(linkCodes.gameId, game.id), eq(linkCodes.playerId, input.playerId), isNull(linkCodes.consumedAt), gt(linkCodes.expiresAt, now)));
    // Purge des vieux codes du jeu (garde la table petite et libère l'espace des codes).
    await tx.delete(linkCodes).where(and(eq(linkCodes.gameId, game.id), lt(linkCodes.expiresAt, ago(now, LINK_LIMITS.codeRetentionMs))));
    for (let i = 0; i < 10; i++) {
      const [row] = await tx
        .insert(linkCodes)
        .values({ id: newId('lnc'), gameId: game.id, playerId: input.playerId, playerName: input.playerName || null, code: generate(), expiresAt, createdAt: now })
        .onConflictDoNothing()
        .returning({ code: linkCodes.code });
      if (row) return row.code;
    }
    throw new Error('Impossible de générer un code de liaison unique');
  });
  return { ok: true, code, expiresAt };
}

/** Fenêtre glissante sur link_attempts pour un utilisateur. */
async function attemptWindow(userId: string, kind: 'code' | 'lookup', now: Date, limit: { max: number; windowMs: number }, failuresOnly: boolean) {
  const rows = await db
    .select({ createdAt: linkAttempts.createdAt })
    .from(linkAttempts)
    .where(
      and(
        eq(linkAttempts.userId, userId),
        eq(linkAttempts.kind, kind),
        gt(linkAttempts.createdAt, ago(now, limit.windowMs)),
        failuresOnly ? eq(linkAttempts.ok, 0) : undefined,
      ),
    )
    .orderBy(desc(linkAttempts.createdAt))
    .limit(limit.max);
  const blocked = rows.length >= limit.max;
  const retryAfterS = blocked ? Math.max(1, Math.ceil((rows[limit.max - 1].createdAt.getTime() + limit.windowMs - now.getTime()) / 1000)) : 0;
  return { count: rows.length, blocked, retryAfterS };
}

/**
 * Saisie d'un code sur /games/[slug]/link : consommation atomique (une seule fois, non expiré, bon jeu),
 * puis création/remplacement du lien vérifié. Les échecs sont comptés pour l'anti force brute.
 */
export async function redeemLinkCode(
  userId: string,
  game: Pick<Game, 'id' | 'linkMethods'>,
  rawCode: string,
  opts: { now?: Date } = {},
): Promise<LinkResult<{ link: GameLink }>> {
  if (!game.linkMethods.includes('code')) return fail('method_disabled', 'La liaison par code est désactivée pour ce jeu.');
  const code = normalizeLinkCode(rawCode);
  if (!code) return fail('invalid_format', 'Le code comporte 8 caractères, par exemple K7QF-M2XA.');
  const now = opts.now ?? new Date();
  const limit = LINK_LIMITS.codeFailuresPerUser;
  const win = await attemptWindow(userId, 'code', now, limit, true);
  if (win.blocked) {
    return fail('rate_limited', `Trop de codes erronés. Réessayez dans ${minutes(win.retryAfterS)} min.`, { retryAfterS: win.retryAfterS, remaining: 0 });
  }

  return db.transaction(async (tx): Promise<LinkResult<{ link: GameLink }>> => {
    const [consumed] = await tx
      .update(linkCodes)
      .set({ consumedAt: now, consumedBy: userId }) // consumedBy : rattache le jeton joueur du SDK (sec/delivery-keys)
      .where(and(eq(linkCodes.gameId, game.id), eq(linkCodes.code, code), isNull(linkCodes.consumedAt), gt(linkCodes.expiresAt, now)))
      .returning();
    if (!consumed) {
      await tx.insert(linkAttempts).values({ id: newId('lat'), userId, gameId: game.id, kind: 'code', ok: 0, createdAt: now });
      const remaining = Math.max(0, limit.max - win.count - 1);
      return fail(
        'invalid_code',
        remaining > 0
          ? `Code invalide ou expiré. Vérifiez le code affiché dans le jeu (encore ${remaining} essai${remaining > 1 ? 's' : ''}).`
          : `Code invalide ou expiré. Trop d'essais : réessayez dans ${minutes(limit.windowMs / 1000)} min.`,
        { remaining },
      );
    }
    await tx.insert(linkAttempts).values({
      id: newId('lat'), userId, gameId: game.id, kind: 'code', ok: 1, playerId: consumed.playerId, playerName: consumed.playerName, usedAt: now, createdAt: now,
    });
    const link = await upsertGameLink(tx, {
      userId, gameId: game.id, playerId: consumed.playerId, playerName: consumed.playerName, method: 'code', verified: 1, now,
    });
    return { ok: true, link };
  });
}

/** Crée ou remplace (« Changer de compte ») le lien unique utilisateur ↔ jeu. */
async function upsertGameLink(
  ex: Executor,
  v: { userId: string; gameId: string; playerId: string; playerName: string | null; method: LinkMethod; verified: 0 | 1; now: Date },
) {
  const set = { playerId: v.playerId, playerName: v.playerName, method: v.method, verified: v.verified, createdAt: v.now };
  const [row] = await ex
    .insert(gameLinks)
    .values({ id: newId('lnk'), userId: v.userId, gameId: v.gameId, ...set })
    .onConflictDoUpdate({ target: [gameLinks.userId, gameLinks.gameId], set })
    .returning();
  return row;
}

/* ------------------------------------------------------------------------------------------------ */
/* Protection SSRF                                                                                   */
/* ------------------------------------------------------------------------------------------------ */

const blockList = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockList.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blockList.addSubnet(net, prefix, 'ipv6');

/** IPv6 → 8 mots de 16 bits (gère « :: » et un suffixe IPv4 pointé), ou null. */
function ipv6Words(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  const dotted = s.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number);
    s = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':').map((h) => parseInt(h, 16)) : []);
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
  const words = [...head, ...Array<number>(fill).fill(0), ...tail];
  return words.some((w) => Number.isNaN(w) || w < 0 || w > 0xffff) ? null : words;
}

/** Adresse IP interdite pour un appel sortant (privée, loopback, lien local, réservée, multicast…). */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip.split('%')[0]);
  if (version === 4) return blockList.check(ip, 'ipv4');
  if (version !== 6) return true;
  const w = ipv6Words(ip);
  if (!w) return true;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // ::a.b.c.d (compatible, inclut :: et ::1) et ::ffff:a.b.c.d (mappée)
  if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0 || w[5] === 0xffff)) return blockList.check(v4(w[6], w[7]), 'ipv4');
  // 64:ff9b::a.b.c.d (NAT64)
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return blockList.check(v4(w[6], w[7]), 'ipv4');
  // 2002:AABB:CCDD::/48 (6to4)
  if (w[0] === 0x2002) return blockList.check(v4(w[1], w[2]), 'ipv4');
  return blockList.check(ip.split('%')[0], 'ipv6');
}

/** En production, les adresses internes sont refusées ; en dev on autorise localhost (démo sur :4100). */
export const allowPrivateTargets = () => process.env.NODE_ENV !== 'production';

/** Vérification statique d'une URL sortante (schéma, identifiants, hôte littéral). */
export function checkOutboundUrl(raw: string, allowPrivate = allowPrivateTargets()): { ok: true; url: URL } | { ok: false; message: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: 'URL invalide.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, message: 'Seules les URL http:// ou https:// sont autorisées.' };
  if (url.username || url.password) return { ok: false, message: "L'URL ne doit pas contenir d'identifiants." };
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    const internal = isIP(host) ? isBlockedAddress(host) : host === 'localhost' || host.endsWith('.localhost') || !host.includes('.');
    if (internal) return { ok: false, message: 'Les adresses internes ou privées sont refusées.' };
  }
  return { ok: true, url };
}

export class BlockedAddressError extends Error {
  code = 'EWOLLEEN_BLOCKED';
  constructor(host: string) {
    super(`Adresse refusée pour ${host}`);
  }
}

/** Résolution DNS qui refuse les adresses internes au moment même de la connexion (anti DNS rebinding). */
function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err, '');
      if (!addresses.length || (!allowPrivate && addresses.some((a) => isBlockedAddress(a.address)))) {
        return callback(new BlockedAddressError(hostname), '');
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/**
 * GET sortant durci : http(s) seulement, adresses internes refusées (sauf allowPrivate), aucune redirection suivie,
 * délai global et taille de réponse bornés.
 */
export function safeHttpGet(
  url: URL,
  headers: Record<string, string>,
  o: { allowPrivate: boolean; timeoutMs: number; maxBytes: number },
): Promise<{ status: number; body: string }> {
  const shape = checkOutboundUrl(url.href, o.allowPrivate);
  if (!shape.ok) return Promise.reject(new BlockedAddressError(url.hostname));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err: Error | null, value?: { status: number; body: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value!);
    };
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, { method: 'GET', headers, agent: false, lookup: guardedLookup(o.allowPrivate) }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > o.maxBytes) {
          done(new Error('Réponse trop volumineuse'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => done(null, { status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', (e) => done(e));
    });
    const timer = setTimeout(() => {
      done(new Error('Délai dépassé'));
      req.destroy();
    }, o.timeoutMs);
    req.on('error', (e) => done(e));
    req.end();
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* Confirmation par ID (méthode `id_confirm`)                                                        */
/* ------------------------------------------------------------------------------------------------ */

export const playerIdSchema = z
  .string()
  .trim()
  .min(1, 'Saisissez votre identifiant joueur.')
  .max(64, 'Identifiant trop long.')
  .regex(/^[^\p{Cc}]+$/u, 'Identifiant invalide.');

const optionalLenient = <T extends z.ZodTypeAny>(schema: T) => schema.optional().catch(undefined);

/** Validation de la réponse du studio : strict sur les champs requis, tolérant sur les optionnels. */
export const playerLookupResponseSchema = z.object({
  player_id: z.union([z.string().trim().min(1).max(128), z.number().int().nonnegative()]).transform(String),
  display_name: z.string().trim().min(1).max(100),
  level: optionalLenient(z.number().int().min(0).max(1_000_000)),
  avatar_url: optionalLenient(z.string().max(2048).url().refine((u) => /^https?:\/\//i.test(u))),
});

/** Appelle l'endpoint « player lookup » du jeu (format documenté en tête de fichier). */
export async function fetchPlayerLookup(
  game: Pick<Game, 'playerLookupUrl' | 'webhookSecret'>,
  playerId: string,
  opts: { allowPrivate?: boolean; timeoutMs?: number; now?: Date } = {},
): Promise<LinkResult<{ player: PlayerLookupResponse }>> {
  const allowPrivate = opts.allowPrivate ?? allowPrivateTargets();
  const template = game.playerLookupUrl?.trim();
  if (!template || !template.includes('{player_id}')) return fail('not_configured', "La recherche par identifiant n'est pas configurée pour ce jeu.");
  const shape = checkOutboundUrl(template.replaceAll('{player_id}', encodeURIComponent(playerId)), allowPrivate);
  if (!shape.ok) return fail('unsafe_url', "L'adresse de recherche du jeu est refusée.");
  const ts = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  let res: { status: number; body: string };
  try {
    res = await safeHttpGet(
      shape.url,
      { accept: 'application/json', 'user-agent': 'Wolleen-PlayerLookup/1.0', [SIGNATURE_HEADER]: signPayload(playerId, game.webhookSecret, ts) },
      { allowPrivate, timeoutMs: opts.timeoutMs ?? LINK_LIMITS.lookupTimeoutMs, maxBytes: LINK_LIMITS.lookupMaxBytes },
    );
  } catch (e) {
    if (e instanceof BlockedAddressError) return fail('unsafe_url', "L'adresse de recherche du jeu est refusée.");
    return fail('lookup_failed', 'Le serveur du jeu ne répond pas. Réessayez dans un instant.');
  }
  if (res.status === 404) return fail('player_not_found', 'Aucun joueur ne correspond à cet identifiant.');
  if (res.status !== 200) return fail('lookup_failed', `Le serveur du jeu a répondu une erreur (${res.status}). Réessayez plus tard.`);
  let json: unknown;
  try {
    json = JSON.parse(res.body);
  } catch {
    return fail('invalid_response', 'Réponse inattendue du serveur du jeu.');
  }
  const parsed = playerLookupResponseSchema.safeParse(json);
  if (!parsed.success) return fail('invalid_response', 'Réponse inattendue du serveur du jeu.');
  const { player_id, display_name, level, avatar_url } = parsed.data;
  const player: PlayerLookupResponse = { player_id, display_name };
  if (level !== undefined) player.level = level;
  if (avatar_url !== undefined) player.avatar_url = avatar_url;
  return { ok: true, player };
}

/**
 * Étape 1 de `id_confirm` : recherche du joueur (limitée par utilisateur) et enregistrement de la recherche,
 * dont l'identifiant sert de jeton pour l'étape 2.
 */
export async function startIdConfirm(
  userId: string,
  game: Pick<Game, 'id' | 'linkMethods' | 'playerLookupUrl' | 'webhookSecret'>,
  rawPlayerId: string,
  opts: { now?: Date; allowPrivate?: boolean; timeoutMs?: number } = {},
): Promise<LinkResult<{ attemptId: string; player: PlayerLookupResponse }>> {
  if (!game.linkMethods.includes('id_confirm')) return fail('method_disabled', 'La liaison par identifiant est désactivée pour ce jeu.');
  const parsedId = playerIdSchema.safeParse(rawPlayerId);
  if (!parsedId.success) return fail('invalid_input', parsedId.error.issues[0]?.message ?? 'Identifiant invalide.');
  const playerId = parsedId.data;
  const now = opts.now ?? new Date();
  const win = await attemptWindow(userId, 'lookup', now, LINK_LIMITS.lookupsPerUser, false);
  if (win.blocked) return fail('rate_limited', `Trop de recherches. Réessayez dans ${minutes(win.retryAfterS)} min.`, { retryAfterS: win.retryAfterS });

  const r = await fetchPlayerLookup(game, playerId, opts);
  const id = newId('lat');
  await db.insert(linkAttempts).values({
    id, userId, gameId: game.id, kind: 'lookup', ok: r.ok ? 1 : 0,
    playerId: r.ok ? r.player.player_id : playerId, playerName: r.ok ? r.player.display_name : null, createdAt: now,
  });
  return r.ok ? { ok: true, attemptId: id, player: r.player } : r;
}

/** Étape 2 de `id_confirm` : « Oui, c'est moi » → lien déclaratif (verified = 0). Jeton à usage unique. */
export async function confirmIdLink(
  userId: string,
  game: Pick<Game, 'id' | 'linkMethods'>,
  attemptId: string,
  opts: { now?: Date } = {},
): Promise<LinkResult<{ link: GameLink }>> {
  if (!game.linkMethods.includes('id_confirm')) return fail('method_disabled', 'La liaison par identifiant est désactivée pour ce jeu.');
  const now = opts.now ?? new Date();
  return db.transaction(async (tx): Promise<LinkResult<{ link: GameLink }>> => {
    const [attempt] = await tx
      .update(linkAttempts)
      .set({ usedAt: now })
      .where(
        and(
          eq(linkAttempts.id, attemptId),
          eq(linkAttempts.userId, userId),
          eq(linkAttempts.gameId, game.id),
          eq(linkAttempts.kind, 'lookup'),
          eq(linkAttempts.ok, 1),
          isNull(linkAttempts.usedAt),
          gt(linkAttempts.createdAt, ago(now, LINK_LIMITS.lookupConfirmTtlMs)),
        ),
      )
      .returning();
    if (!attempt?.playerId) return fail('expired', 'Cette vérification a expiré. Recherchez à nouveau votre identifiant.');
    const link = await upsertGameLink(tx, {
      userId, gameId: game.id, playerId: attempt.playerId, playerName: attempt.playerName, method: 'id_confirm', verified: 0, now,
    });
    return { ok: true, link };
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* Pages joueur                                                                                      */
/* ------------------------------------------------------------------------------------------------ */

/** Jeu accessible à la liaison : publié, ou visible par les membres de son studio (tests avant publication). */
export async function getLinkableGame(slug: string, userId: string) {
  const [game] = await db.select().from(games).where(eq(games.slug, slug));
  if (!game) return null;
  if (game.status === 'live') return game;
  const [member] = await db
    .select({ userId: studioMembers.userId })
    .from(studioMembers)
    .where(and(eq(studioMembers.studioId, game.studioId), eq(studioMembers.userId, userId)));
  return member ? game : null;
}

/** Méthodes réellement proposées au joueur (oauth : phase 2 ; id_confirm sans URL : masqué). */
export function availableLinkMethods(game: Pick<Game, 'linkMethods' | 'playerLookupUrl'>): LinkMethod[] {
  return game.linkMethods.filter((m) => m === 'code' || (m === 'id_confirm' && !!game.playerLookupUrl));
}

/** Destination après liaison : /games/[slug]?buy=ITEM si l'article appartient bien au jeu, sinon /games/[slug]. */
export async function linkReturnPath(game: Pick<Game, 'id' | 'slug'>, itemId?: string | null) {
  const base = `/games/${encodeURIComponent(game.slug)}`;
  if (!itemId || itemId.length > 128) return base;
  const [item] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.gameId, game.id), eq(items.active, true)));
  return item ? `${base}?buy=${encodeURIComponent(item.id)}` : base;
}

/** « Mes jeux liés » sur /account. */
export async function listUserGameLinks(userId: string) {
  return db
    .select({
      id: gameLinks.id,
      playerId: gameLinks.playerId,
      playerName: gameLinks.playerName,
      method: gameLinks.method,
      verified: gameLinks.verified,
      createdAt: gameLinks.createdAt,
      gameId: games.id,
      gameName: games.name,
      gameSlug: games.slug,
      gameIconUrl: games.iconUrl,
    })
    .from(gameLinks)
    .innerJoin(games, eq(games.id, gameLinks.gameId))
    .where(eq(gameLinks.userId, userId))
    .orderBy(asc(games.name));
}

/** Délier : uniquement un lien appartenant à l'utilisateur. */
export async function unlinkGameLink(userId: string, linkId: string) {
  const rows = await db
    .delete(gameLinks)
    .where(and(eq(gameLinks.id, linkId), eq(gameLinks.userId, userId)))
    .returning({ id: gameLinks.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------------------------------------ */
/* Réglages studio (composant LinkSettings)                                                          */
/* ------------------------------------------------------------------------------------------------ */

export async function getLinkSettings(gameId: string) {
  const [row] = await db
    .select({ id: games.id, linkMethods: games.linkMethods, playerLookupUrl: games.playerLookupUrl })
    .from(games)
    .where(eq(games.id, gameId));
  return row ?? null;
}

/** Enregistre les méthodes de liaison et l'URL de lookup (l'appelant doit avoir vérifié requireGameAccess). */
export async function updateLinkSettings(
  gameId: string,
  input: { methods: string[]; playerLookupUrl: string },
  opts: { allowPrivate?: boolean } = {},
): Promise<LinkResult<{ linkMethods: LinkMethod[]; playerLookupUrl: string | null }>> {
  const allowPrivate = opts.allowPrivate ?? allowPrivateTargets();
  const methods = (['code', 'id_confirm'] as const).filter((m) => input.methods.includes(m));
  if (!methods.length) return fail('invalid_input', 'Activez au moins une méthode de liaison.');
  const url = input.playerLookupUrl.trim();
  if (methods.includes('id_confirm') && !url) return fail('invalid_input', "L'URL de recherche est obligatoire pour la confirmation par identifiant.");
  if (url) {
    if (url.length > 2048) return fail('invalid_input', 'URL trop longue.');
    if (!url.includes('{player_id}')) return fail('invalid_input', "L'URL doit contenir {player_id}, remplacé par l'identifiant saisi.");
    const shape = checkOutboundUrl(url.replaceAll('{player_id}', 'player'), allowPrivate);
    if (!shape.ok) return fail('unsafe_url', shape.message);
    const host = shape.url.hostname.replace(/^\[|\]$/g, '');
    if (!allowPrivate && !isIP(host)) {
      try {
        const addrs = await dnsPromises.lookup(host, { all: true });
        if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) return fail('unsafe_url', 'Ce nom de domaine pointe vers une adresse interne ou privée.');
      } catch {
        return fail('unsafe_url', 'Nom de domaine introuvable.');
      }
    }
  }
  const saved = { linkMethods: [...methods] as LinkMethod[], playerLookupUrl: url || null };
  const rows = await db.update(games).set({ ...saved, updatedAt: new Date() }).where(eq(games.id, gameId)).returning({ id: games.id });
  if (!rows.length) return fail('invalid_input', 'Jeu introuvable.');
  return { ok: true, ...saved };
}

/* ------------------------------------------------------------------------------------------------ */
/* Ajout « sec/delivery-keys » : requête sortante durcie générique (webhook de livraison, POST)      */
/* ------------------------------------------------------------------------------------------------ */

export interface SafeHttpResponse {
  status: number;
  /** Début du corps (au plus `maxBytes` octets). */
  body: string;
  /** Vrai si le corps dépassait `maxBytes` (lecture interrompue, le statut reste valable). */
  truncated: boolean;
}

/**
 * Même protection que safeHttpGet (http(s) seulement, adresses internes refusées à la résolution DNS même — anti
 * DNS rebinding —, aucune redirection suivie, délai global borné) pour une méthode et un corps quelconques.
 * Contrairement à safeHttpGet, un corps trop long n'est pas une erreur : il est tronqué (`truncated`).
 * Erreurs : BlockedAddressError (adresse refusée), Error « TimeoutError » (délai), erreurs réseau Node (code ECONNREFUSED…).
 */
export function safeHttpRequest(
  url: URL,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
  o: { allowPrivate: boolean; timeoutMs: number; maxBytes: number },
): Promise<SafeHttpResponse> {
  const shape = checkOutboundUrl(url.href, o.allowPrivate);
  if (!shape.ok) return Promise.reject(new BlockedAddressError(url.hostname));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err: Error | null, value?: SafeHttpResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value!);
    };
    const headers = { ...init.headers };
    if (init.body !== undefined) headers['content-length'] = String(Buffer.byteLength(init.body));
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, { method: init.method, headers, agent: false, lookup: guardedLookup(o.allowPrivate) }, (res) => {
      const status = res.statusCode ?? 0;
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        if (settled) return;
        const room = o.maxBytes - size;
        if (chunk.length > room) {
          chunks.push(chunk.subarray(0, Math.max(0, room)));
          done(null, { status, body: Buffer.concat(chunks).toString('utf8'), truncated: true });
          req.destroy();
          return;
        }
        size += chunk.length;
        chunks.push(chunk);
      });
      res.on('end', () => done(null, { status, body: Buffer.concat(chunks).toString('utf8'), truncated: false }));
      res.on('error', (e) => done(e));
    });
    const timer = setTimeout(() => {
      done(Object.assign(new Error('Délai dépassé'), { name: 'TimeoutError' }));
      req.destroy();
    }, o.timeoutMs);
    req.on('error', (e) => done(e));
    req.end(init.body);
  });
}
