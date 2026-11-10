import 'server-only';
import { hashApiKey, randomToken } from '@devappstore/core';
import { and, db, eq, games, gt, isNull, lt, or, playerTokens, sql } from '@devappstore/db';

/*
 * Authentification de l'API publique /api/v1 (D-05 du modèle de menaces : séparation des clés).
 *
 * - Clé SECRÈTE `das_secret_…` (anciennes clés `das_live_…` / `das_test_…` toujours acceptées) : serveur du studio
 *   uniquement. Seule son empreinte SHA-256 est stockée. Donne accès à tout le jeu : codes de liaison, livraisons de
 *   tous les joueurs (`player_id` en paramètre), flux, ack, révocation des jetons joueur.
 * - Clé PUBLIQUE `das_pub_…` (non secrète, embarquée dans le client du jeu) : demande de codes de liaison et
 *   échange d'une demande de liaison contre un jeton joueur. Les livraisons, le flux et l'ack exigent en plus le
 *   jeton joueur (`DevAppStore-Player-Token: das_pt_…`) et sont restreints à SON joueur (et au compte Dev AppStore qui l'a lié).
 *
 * Aucune clé n'est jamais acceptée dans l'URL. Un jeu suspendu est refusé.
 */

export const SECRET_KEY_PREFIX = 'das_secret_';
export const PUBLISHABLE_KEY_PREFIX = 'das_pub_';
export const PLAYER_TOKEN_PREFIX = 'das_pt_';
export const PLAYER_TOKEN_HEADER = 'DevAppStore-Player-Token';
/** Longueur max d'une clé / d'un jeton acceptée avant toute requête en base. */
const MAX_CREDENTIAL_LENGTH = 200;
/** `lastUsedAt` d'un jeton ou d'une clé n'est réécrit qu'au plus toutes les 5 min. */
const TOKEN_TOUCH_MS = 5 * 60_000;
/**
 * Expiration glissante des jetons joueur (revue 2026-11, F12) : un jeton inutilisé depuis ce délai est refusé
 * (`401 player_token_required` : le SDK l'oublie et repasse en attente de liaison). L'usage le prolonge.
 */
export const PLAYER_TOKEN_IDLE_TTL_MS = 90 * 24 * 3600_000;
/** Rotation de la clé secrète (F9) : l'ancienne clé reste acceptée pendant ce délai par défaut. */
export const SECRET_KEY_OVERLAP_MS = 24 * 3600_000;

/** Jeu authentifié, sans aucun secret (ni `webhookSecret`, ni `apiKeyHash`). */
export interface ApiGame {
  id: string;
  studioId: string;
  status: (typeof games.$inferSelect)['status'];
  linkMethods: (typeof games.$inferSelect)['linkMethods'];
  webhookUrl: string | null;
  currency: (typeof games.$inferSelect)['currency'];
}

export interface PlayerTokenAuth {
  tokenId: string;
  playerId: string;
  userId: string;
}

export type ApiAuth =
  | { kind: 'secret'; game: ApiGame }
  /** `player` : jeton joueur valide fourni, sinon null (seuls link-codes et link-requests sont alors permis). */
  | { kind: 'publishable'; game: ApiGame; player: PlayerTokenAuth | null };

const gameColumns = {
  id: games.id,
  studioId: games.studioId,
  status: games.status,
  linkMethods: games.linkMethods,
  webhookUrl: games.webhookUrl,
  currency: games.currency,
};

function bearer(req: Request): string {
  const h = req.headers.get('authorization') ?? '';
  const key = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return key.length <= MAX_CREDENTIAL_LENGTH ? key : '';
}

/** Nouvelle clé secrète : valeur claire (affichée une seule fois), empreinte et préfixe affichable. */
export function generateSecretApiKey() {
  const key = randomToken(SECRET_KEY_PREFIX);
  return { key, hash: hashApiKey(key), prefix: key.slice(0, SECRET_KEY_PREFIX.length + 4) };
}

/** Nouvelle clé publique (non secrète, stockée en clair). */
export function generatePublishableKey() {
  return randomToken(PUBLISHABLE_KEY_PREFIX, 18);
}

/** Nouveau jeton joueur : valeur claire (renvoyée une seule fois au SDK) et empreinte stockée. */
export function generatePlayerToken() {
  const token = randomToken(PLAYER_TOKEN_PREFIX, 32);
  return { token, hash: hashApiKey(token) };
}

/** Clé publique du jeu ; la génère si le jeu n'en a pas encore (jeux créés avant son introduction). */
export async function ensurePublishableKey(gameId: string): Promise<string | null> {
  const [g] = await db.select({ key: games.publishableKey }).from(games).where(eq(games.id, gameId));
  if (!g) return null;
  if (g.key) return g.key;
  await db.update(games).set({ publishableKey: generatePublishableKey() }).where(and(eq(games.id, gameId), isNull(games.publishableKey)));
  const [after] = await db.select({ key: games.publishableKey }).from(games).where(eq(games.id, gameId));
  return after?.key ?? null;
}

/** Jeton joueur valide (non révoqué, utilisé depuis moins de PLAYER_TOKEN_IDLE_TTL_MS) pour ce jeu, ou null. */
export async function resolvePlayerToken(gameId: string, raw: string | null | undefined, now = new Date()): Promise<PlayerTokenAuth | null> {
  const token = raw?.trim() ?? '';
  if (!token.startsWith(PLAYER_TOKEN_PREFIX) || token.length > MAX_CREDENTIAL_LENGTH) return null;
  const idleSince = new Date(now.getTime() - PLAYER_TOKEN_IDLE_TTL_MS);
  const [row] = await db
    .select({ tokenId: playerTokens.id, playerId: playerTokens.playerId, userId: playerTokens.userId })
    .from(playerTokens)
    .where(
      and(
        eq(playerTokens.gameId, gameId),
        eq(playerTokens.tokenHash, hashApiKey(token)),
        isNull(playerTokens.revokedAt),
        gt(sql`coalesce(${playerTokens.lastUsedAt}, ${playerTokens.createdAt})`, idleSince),
      ),
    );
  if (!row) return null;
  await db
    .update(playerTokens)
    .set({ lastUsedAt: now })
    .where(and(eq(playerTokens.id, row.tokenId), or(isNull(playerTokens.lastUsedAt), lt(playerTokens.lastUsedAt, new Date(now.getTime() - TOKEN_TOUCH_MS)))));
  return row;
}

/**
 * Authentifie un appel de l'API v1 : clé secrète (serveur du studio) ou clé publique (+ jeton joueur éventuel).
 * Renvoie null (→ 401) si la clé est absente, inconnue, ou si le jeu est suspendu.
 * (L'ancienne fonction `authenticateGame`, qui renvoyait la ligne complète avec les secrets, a été supprimée.)
 */
export async function authenticateApi(req: Request): Promise<ApiAuth | null> {
  const key = bearer(req);
  if (!key) return null;
  if (key.startsWith(PUBLISHABLE_KEY_PREFIX)) {
    const [game] = await db.select(gameColumns).from(games).where(eq(games.publishableKey, key));
    if (!game || game.status === 'suspended') return null;
    const player = await resolvePlayerToken(game.id, req.headers.get(PLAYER_TOKEN_HEADER));
    return { kind: 'publishable', game, player };
  }
  return authenticateSecretKey(key);
}

/**
 * Clé secrète : la clé courante, ou l'ancienne pendant la période de recouvrement d'une rotation (F9). Met à jour
 * la date de dernière utilisation de la clé employée (au plus toutes les 5 min).
 */
async function authenticateSecretKey(key: string, now = new Date()): Promise<ApiAuth | null> {
  const hash = hashApiKey(key);
  const [row] = await db
    .select({ ...gameColumns, currentHash: games.apiKeyHash })
    .from(games)
    .where(or(eq(games.apiKeyHash, hash), and(eq(games.apiKeyPreviousHash, hash), gt(games.apiKeyPreviousExpiresAt, now))));
  if (!row || row.status === 'suspended') return null;
  const { currentHash, ...game } = row;
  const stale = new Date(now.getTime() - TOKEN_TOUCH_MS);
  const column = currentHash === hash ? games.apiKeyLastUsedAt : games.apiKeyPreviousLastUsedAt;
  await db
    .update(games)
    .set(currentHash === hash ? { apiKeyLastUsedAt: now } : { apiKeyPreviousLastUsedAt: now })
    .where(and(eq(games.id, game.id), or(isNull(column), lt(column, stale))));
  return { kind: 'secret', game };
}

/**
 * Nouvelle clé secrète (F9) : l'ancienne reste acceptée `overlapMs` (0 = révocation immédiate, après une fuite).
 * Renvoie la clé en clair (affichée une seule fois), ou null si le jeu n'existe pas.
 */
export async function rotateSecretApiKey(gameId: string, opts: { now?: Date; overlapMs?: number } = {}) {
  const now = opts.now ?? new Date();
  const overlapMs = opts.overlapMs ?? SECRET_KEY_OVERLAP_MS;
  const [g] = await db
    .select({ hash: games.apiKeyHash, prefix: games.apiKeyPrefix, lastUsedAt: games.apiKeyLastUsedAt })
    .from(games)
    .where(eq(games.id, gameId));
  if (!g) return null;
  const { key, hash, prefix } = generateSecretApiKey();
  const keep = overlapMs > 0;
  await db
    .update(games)
    .set({
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      apiKeyLastUsedAt: null,
      apiKeyPreviousHash: keep ? g.hash : null,
      apiKeyPreviousPrefix: keep ? g.prefix : null,
      apiKeyPreviousExpiresAt: keep ? new Date(now.getTime() + overlapMs) : null,
      apiKeyPreviousLastUsedAt: keep ? g.lastUsedAt : null,
      updatedAt: now,
    })
    .where(eq(games.id, gameId));
  return { key, prefix };
}

/** Révoque immédiatement l'ancienne clé secrète encore en période de recouvrement. */
export async function revokePreviousSecretApiKey(gameId: string): Promise<boolean> {
  const rows = await db
    .update(games)
    .set({ apiKeyPreviousHash: null, apiKeyPreviousPrefix: null, apiKeyPreviousExpiresAt: null, apiKeyPreviousLastUsedAt: null, updatedAt: new Date() })
    .where(and(eq(games.id, gameId), sql`${games.apiKeyPreviousHash} is not null`))
    .returning({ id: games.id });
  return rows.length > 0;
}

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
