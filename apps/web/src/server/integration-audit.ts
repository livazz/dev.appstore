import 'server-only';
import type { StudioRole } from '@devappstore/core';
import { newId } from '@devappstore/core';
import { db, desc, eq, integrationAuditLog } from '@devappstore/db';

/*
 * Journal d'audit des changements d'intégration (revue de sécurité 2026-11, F8 / T-DLV-10) : qui a changé l'URL du
 * webhook ou de recherche, fait tourner une clé ou le secret, ou affiché le secret. Jamais de secret en clair dans
 * `details` (préfixes et URL sans query string seulement).
 */

/** Rôles autorisés à faire tourner les clés et le secret, et à changer les URL appelées (matrice des rôles, A-08). */
export const INTEGRATION_ADMINS: StudioRole[] = ['owner', 'admin'];

export type IntegrationAuditAction =
  | 'secret_key.rotated'
  | 'secret_key.previous_revoked'
  | 'publishable_key.rotated'
  | 'webhook_secret.rotated'
  | 'webhook_secret.revealed'
  | 'webhook_url.updated'
  | 'lookup_url.updated';

export interface AuditActor {
  user: { id: string };
  studioId: string;
  role: StudioRole;
}

/** URL sans identifiants, query string ni fragment. */
export function auditUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.replaceAll('{player_id}', 'PLAYER_ID'));
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.href.replace('PLAYER_ID', '{player_id}');
  } catch {
    return '(URL invalide)';
  }
}

export async function recordIntegrationAudit(
  gameId: string,
  actor: AuditActor,
  action: IntegrationAuditAction,
  details: Record<string, string | number | boolean | null> = {},
) {
  await db.insert(integrationAuditLog).values({
    id: newId('iau'),
    gameId,
    studioId: actor.studioId,
    actorUserId: actor.user.id,
    actorRole: actor.role,
    action,
    details,
  });
}

/** Dernières entrées du journal d'un jeu (onglet Intégration). */
export async function listIntegrationAudit(gameId: string, limit = 20) {
  return db
    .select()
    .from(integrationAuditLog)
    .where(eq(integrationAuditLog.gameId, gameId))
    .orderBy(desc(integrationAuditLog.createdAt))
    .limit(limit);
}
