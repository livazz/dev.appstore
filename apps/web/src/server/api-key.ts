import 'server-only';
import { hashApiKey, randomToken } from '@devappstore/core';
import { and, db, eq, games, isNull, lt, or, playerTokens } from '@devappstore/db';

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
/** `lastUsedAt` d'un jeton n'est réécrit qu'au plus toutes les 5 min. */
const TOKEN_TOUCH_MS = 5 * 60_000;

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

/** Jeton joueur valide (non révoqué) pour ce jeu, ou null. */
export async function resolvePlayerToken(gameId: string, raw: string | null | undefined, now = new Date()): Promise<PlayerTokenAuth | null> {
  const token = raw?.trim() ?? '';
  if (!token.startsWith(PLAYER_TOKEN_PREFIX) || token.length > MAX_CREDENTIAL_LENGTH) return null;
  const [row] = await db
    .select({ tokenId: playerTokens.id, playerId: playerTokens.playerId, userId: playerTokens.userId })
    .from(playerTokens)
    .where(and(eq(playerTokens.gameId, gameId), eq(playerTokens.tokenHash, hashApiKey(token)), isNull(playerTokens.revokedAt)));
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
  const [game] = await db.select(gameColumns).from(games).where(eq(games.apiKeyHash, hashApiKey(key)));
  if (!game || game.status === 'suspended') return null;
  return { kind: 'secret', game };
}

/**
 * CONTRAT PARTAGÉ (historique) — authentifie un appel par la clé SECRÈTE du jeu uniquement.
 * En-tête : `Authorization: Bearer das_…`. Renvoie le jeu, ou null (→ répondre 401) : clé inconnue, clé publique,
 * jeu suspendu. Préférez `authenticateApi`, qui ne renvoie aucun secret.
 */
export async function authenticateGame(req: Request) {
  const key = bearer(req);
  if (!key || key.startsWith(PUBLISHABLE_KEY_PREFIX)) return null;
  const [game] = await db.select().from(games).where(eq(games.apiKeyHash, hashApiKey(key)));
  return game && game.status !== 'suspended' ? game : null;
}

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
