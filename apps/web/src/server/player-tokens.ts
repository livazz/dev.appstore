import 'server-only';
import { newId } from '@devappstore/core';
import { and, count, db, desc, eq, isNull, linkCodes, playerTokens, sql } from '@devappstore/db';
import { generatePlayerToken, type ApiAuth } from './api-key';

/*
 * Jetons joueur (sec/delivery-keys, D-05) — identité d'un client de jeu SANS serveur.
 *
 * 1. Le SDK demande un code avec la clé publique : POST /api/v1/link-codes → { code, expires_at, link_request_id }
 *    (link_request_id = id de la ligne link_codes, aléatoire 96 bits, connu du seul client qui a demandé le code).
 * 2. Le joueur saisit le code sur /games/[slug]/link (connecté à son compte Dev AppStore) : la ligne est consommée et
 *    `consumedBy` reçoit son userId.
 * 3. Le SDK interroge GET /api/v1/link-requests/{id} : au premier appel après la saisie, un jeton opaque `das_pt_…`
 *    est délivré UNE fois (échange atomique), lié à (jeu, player_id, compte Dev AppStore). Seule son empreinte est stockée.
 * 4. Avec la clé publique, deliveries / stream / ack exigent ce jeton et ne voient que les achats de ce joueur faits
 *    par ce compte : un tiers qui fabrique un code pour le player_id d'une victime n'obtient que ses propres achats.
 */

/** Délai pour échanger une demande de liaison consommée contre un jeton. */
export const LINK_REQUEST_CLAIM_TTL_MS = 60 * 60_000;

export type LinkRequestStatus =
  | { status: 'pending'; player_id: string; expires_at: string }
  | { status: 'expired' }
  /** Secret : liaison faite. Publique : `player_token` présent seulement lors de l'échange (une fois). */
  | { status: 'linked'; player_id: string; player_token?: string }
  /** Clé publique : le jeton de cette demande a déjà été délivré. */
  | { status: 'claimed'; player_id: string };

/** Marque l'origine d'un code tout juste créé et renvoie son identifiant de demande de liaison. */
export async function recordLinkRequest(gameId: string, code: string, source: 'secret' | 'publishable'): Promise<string | null> {
  const [row] = await db
    .update(linkCodes)
    .set({ source })
    .where(and(eq(linkCodes.gameId, gameId), eq(linkCodes.code, code)))
    .returning({ id: linkCodes.id });
  return row?.id ?? null;
}

/**
 * État d'une demande de liaison du jeu authentifié ; avec la clé publique, échange unique contre un jeton joueur.
 * null = inconnue (autre jeu, purgée, ou demandée par le serveur du studio quand l'appel vient de la clé publique).
 */
export async function getLinkRequest(auth: ApiAuth, linkRequestId: string, now = new Date()): Promise<LinkRequestStatus | null> {
  if (!linkRequestId || linkRequestId.length > 64) return null;
  const [lc] = await db.select().from(linkCodes).where(and(eq(linkCodes.id, linkRequestId), eq(linkCodes.gameId, auth.game.id)));
  if (!lc) return null;
  if (auth.kind === 'publishable' && lc.source !== 'publishable') return null;
  if (!lc.consumedAt) {
    return lc.expiresAt.getTime() <= now.getTime() ? { status: 'expired' } : { status: 'pending', player_id: lc.playerId, expires_at: lc.expiresAt.toISOString() };
  }
  if (auth.kind === 'secret') return { status: 'linked', player_id: lc.playerId };
  if (lc.tokenIssuedAt) return { status: 'claimed', player_id: lc.playerId };
  if (!lc.consumedBy || lc.consumedAt.getTime() < now.getTime() - LINK_REQUEST_CLAIM_TTL_MS) return { status: 'expired' };

  const userId = lc.consumedBy;
  const { token, hash } = generatePlayerToken();
  const issued = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(linkCodes)
      .set({ tokenIssuedAt: now })
      .where(and(eq(linkCodes.id, lc.id), isNull(linkCodes.tokenIssuedAt)))
      .returning({ id: linkCodes.id });
    if (!claimed) return false;
    await tx.insert(playerTokens).values({ id: newId('ptk'), gameId: lc.gameId, playerId: lc.playerId, userId, tokenHash: hash, linkCodeId: lc.id, createdAt: now });
    return true;
  });
  if (!issued) return { status: 'claimed', player_id: lc.playerId };
  return { status: 'linked', player_id: lc.playerId, player_token: token };
}

/** Révoque un jeton (le SDK se délie). */
export async function revokePlayerToken(tokenId: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(playerTokens)
    .set({ revokedAt: now })
    .where(and(eq(playerTokens.id, tokenId), isNull(playerTokens.revokedAt)))
    .returning({ id: playerTokens.id });
  return rows.length > 0;
}

/** Révoque tous les jetons actifs d'un joueur du jeu (serveur du studio, onglet Intégration). Renvoie le nombre révoqué. */
export async function revokePlayerTokens(gameId: string, playerId: string, now = new Date()): Promise<number> {
  const rows = await db
    .update(playerTokens)
    .set({ revokedAt: now })
    .where(and(eq(playerTokens.gameId, gameId), eq(playerTokens.playerId, playerId), isNull(playerTokens.revokedAt)))
    .returning({ id: playerTokens.id });
  return rows.length;
}

/** Résumé pour l'onglet Intégration : jetons actifs et derniers appareils liés. */
export async function playerTokenSummary(gameId: string, limit = 10) {
  const [{ active }] = await db
    .select({ active: count() })
    .from(playerTokens)
    .where(and(eq(playerTokens.gameId, gameId), isNull(playerTokens.revokedAt)));
  const recent = await db
    .select({ playerId: playerTokens.playerId, createdAt: playerTokens.createdAt, lastUsedAt: playerTokens.lastUsedAt })
    .from(playerTokens)
    .where(and(eq(playerTokens.gameId, gameId), isNull(playerTokens.revokedAt)))
    .orderBy(desc(sql`coalesce(${playerTokens.lastUsedAt}, ${playerTokens.createdAt})`))
    .limit(limit);
  return { active: Number(active), recent };
}
