'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { db, eq, games } from '@devappstore/db';
import { generatePublishableKey, revokePreviousSecretApiKey, rotateSecretApiKey } from '@/server/api-key';
import { resumeParkedDeliveries, retryDelivery, retryDueDeliveries, sendTestWebhook, validateWebhookUrl } from '@/server/delivery';
import { INTEGRATION_ADMINS, auditUrl, recordIntegrationAudit, type AuditActor } from '@/server/integration-audit';
import { revokePlayerTokens } from '@/server/player-tokens';
import { requireGameAccess } from '@/server/session';
import { loadWebhookSecrets, rotateWebhookSecret } from '@/server/webhook-secrets';

/** Rôles autorisés aux actions courantes (événement de test, relances, révocation de jetons, affichage du secret). */
const EDITORS = ['owner', 'admin', 'developer'] as const;

const path = (gameId: string) => `/studio/games/${gameId}/integration`;

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Contrôle d'accès. `admins` : rotations de clés / secret et changement d'URL réservés à owner / admin (matrice des
 * rôles — revue 2026-11, A-08 / F8) ; le rôle « developer » garde les actions courantes, « finance » consulte.
 */
async function guard(gameId: string, scope: 'editors' | 'admins' = 'editors'): Promise<{ actor: AuditActor } | { error: string }> {
  try {
    const actor = await requireGameAccess(gameId, scope === 'admins' ? INTEGRATION_ADMINS : [...EDITORS]);
    return { actor };
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return {
        error:
          scope === 'admins'
            ? 'Seuls les propriétaires et administrateurs du studio peuvent faire tourner les clés et secrets ou changer cette URL.'
            : "Vous n'avez pas les droits pour modifier l'intégration de ce jeu.",
      };
    }
    throw e; // redirection vers /login, etc.
  }
}

/**
 * Génère une nouvelle clé SECRÈTE (`das_secret_…`). Par défaut l'ancienne reste acceptée 24 h (rotation sans coupure) ;
 * `immediate` la révoque tout de suite (fuite). La clé n'est renvoyée qu'une fois (seule son empreinte est stockée).
 */
export async function regenerateApiKey(gameId: string, opts: { immediate?: boolean } = {}): Promise<ActionResult<{ apiKey: string; prefix: string; previousExpiresAt: string | null }>> {
  const g = await guard(gameId, 'admins');
  if ('error' in g) return { ok: false, error: g.error };
  const r = await rotateSecretApiKey(gameId, opts.immediate ? { overlapMs: 0 } : {});
  if (!r) return { ok: false, error: 'Jeu introuvable.' };
  const [after] = await db.select({ until: games.apiKeyPreviousExpiresAt }).from(games).where(eq(games.id, gameId));
  await recordIntegrationAudit(gameId, g.actor, 'secret_key.rotated', { prefix: r.prefix, immediate: !!opts.immediate });
  revalidatePath(path(gameId));
  return { ok: true, apiKey: r.key, prefix: r.prefix, previousExpiresAt: after?.until?.toISOString() ?? null };
}

/** Révoque tout de suite l'ancienne clé secrète encore acceptée après une rotation. */
export async function revokePreviousApiKey(gameId: string): Promise<ActionResult<{ revoked: boolean }>> {
  const g = await guard(gameId, 'admins');
  if ('error' in g) return { ok: false, error: g.error };
  const revoked = await revokePreviousSecretApiKey(gameId);
  if (revoked) await recordIntegrationAudit(gameId, g.actor, 'secret_key.previous_revoked');
  revalidatePath(path(gameId));
  return { ok: true, revoked };
}

/** Nouvelle clé PUBLIQUE (`das_pub_…`) : les versions du jeu qui embarquent l'ancienne ne pourront plus lier de compte ni recevoir d'achats. */
export async function regeneratePublishableKey(gameId: string): Promise<ActionResult<{ publishableKey: string }>> {
  const g = await guard(gameId, 'admins');
  if ('error' in g) return { ok: false, error: g.error };
  const publishableKey = generatePublishableKey();
  await db.update(games).set({ publishableKey, updatedAt: new Date() }).where(eq(games.id, gameId));
  await recordIntegrationAudit(gameId, g.actor, 'publishable_key.rotated', { prefix: publishableKey.slice(0, 12) });
  revalidatePath(path(gameId));
  return { ok: true, publishableKey };
}

export async function revealWebhookSecret(gameId: string): Promise<ActionResult<{ secret: string }>> {
  const g = await guard(gameId);
  if ('error' in g) return { ok: false, error: g.error };
  let secret: string | null;
  try {
    secret = (await loadWebhookSecrets(gameId))?.current ?? null;
  } catch {
    return { ok: false, error: 'Secret illisible (clé de chiffrement changée) : régénérez-le.' };
  }
  if (!secret) return { ok: false, error: 'Jeu introuvable.' };
  await recordIntegrationAudit(gameId, g.actor, 'webhook_secret.revealed');
  return { ok: true, secret };
}

/**
 * Nouveau secret webhook. Par défaut l'ancien signe encore 24 h (deux `v1=` dans l'en-tête, le temps de déployer) ;
 * `immediate` le révoque tout de suite (fuite).
 */
export async function regenerateWebhookSecret(gameId: string, opts: { immediate?: boolean } = {}): Promise<ActionResult<{ secret: string }>> {
  const g = await guard(gameId, 'admins');
  if ('error' in g) return { ok: false, error: g.error };
  const secret = await rotateWebhookSecret(gameId, opts.immediate ? { overlapMs: 0 } : {});
  if (!secret) return { ok: false, error: 'Jeu introuvable.' };
  await recordIntegrationAudit(gameId, g.actor, 'webhook_secret.rotated', { immediate: !!opts.immediate });
  revalidatePath(path(gameId));
  return { ok: true, secret };
}

/**
 * Enregistre l'URL du webhook (vide = livraison par le SDK seulement). Validation anti-SSRF : https obligatoire et
 * aucune adresse interne (après résolution DNS) en production. Les livraisons créées avant l'URL et toujours en
 * attente sont reprises : elles partent vers le webhook au prochain passage de la file de relance.
 */
export async function updateWebhookUrl(gameId: string, url: string): Promise<ActionResult<{ webhookUrl: string | null; resumed: number }>> {
  const g = await guard(gameId, 'admins');
  if ('error' in g) return { ok: false, error: g.error };
  const raw = z.string().max(2000).safeParse(url);
  if (!raw.success) return { ok: false, error: 'URL trop longue.' };
  const value = raw.data.trim();
  if (value) {
    const check = await validateWebhookUrl(value);
    if (!check.ok) return { ok: false, error: check.message };
  }
  const webhookUrl = value || null;
  const [before] = await db.select({ url: games.webhookUrl }).from(games).where(eq(games.id, gameId));
  await db.update(games).set({ webhookUrl, updatedAt: new Date() }).where(eq(games.id, gameId));
  if ((before?.url ?? null) !== webhookUrl) {
    await recordIntegrationAudit(gameId, g.actor, 'webhook_url.updated', { from: auditUrl(before?.url), to: auditUrl(webhookUrl) });
  }
  const resumed = webhookUrl ? await resumeParkedDeliveries(gameId) : 0;
  if (resumed > 0) {
    // Envoi immédiat après la réponse (le cron et la boucle de dev les reprendraient de toute façon).
    after(() => retryDueDeliveries().then(() => undefined, (e) => console.error('[integration] reprise des livraisons', e)));
  }
  revalidatePath(path(gameId));
  return { ok: true, webhookUrl, resumed };
}

export async function sendTestEvent(gameId: string): Promise<ActionResult<{ statusCode: number | null; durationMs: number; error: string | null }>> {
  const g = await guard(gameId);
  if ('error' in g) return { ok: false, error: g.error };
  const r = await sendTestWebhook(gameId);
  return { ok: true, statusCode: r.statusCode, durationMs: r.durationMs, error: r.ok ? null : r.error };
}

export async function retryDeliveryAction(gameId: string, deliveryId: string): Promise<ActionResult> {
  const g = await guard(gameId);
  if ('error' in g) return { ok: false, error: g.error };
  const r = await retryDelivery(gameId, deliveryId);
  revalidatePath(path(gameId));
  if (r === 'not_found') return { ok: false, error: 'Livraison introuvable.' };
  if (r === 'not_retryable') return { ok: false, error: 'Cette livraison ne peut pas être relancée (déjà livrée, ou commande remboursée).' };
  return { ok: true };
}

const playerIdInput = z.string().trim().min(1, 'Saisissez un identifiant joueur.').max(200, 'Identifiant trop long.');

/** Révoque tous les jetons joueur (appareils liés via le SDK client) d'un joueur. */
export async function revokePlayerTokensAction(gameId: string, playerId: string): Promise<ActionResult<{ revoked: number }>> {
  const g = await guard(gameId);
  if ('error' in g) return { ok: false, error: g.error };
  const parsed = playerIdInput.safeParse(playerId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Identifiant invalide.' };
  const revoked = await revokePlayerTokens(gameId, parsed.data);
  revalidatePath(path(gameId));
  return { ok: true, revoked };
}
