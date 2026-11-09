'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { randomToken } from '@wolleen/core';
import { db, eq, games } from '@wolleen/db';
import { generatePublishableKey, generateSecretApiKey } from '@/server/api-key';
import { resumeParkedDeliveries, retryDelivery, retryDueDeliveries, sendTestWebhook, validateWebhookUrl } from '@/server/delivery';
import { revokePlayerTokens } from '@/server/player-tokens';
import { requireGameAccess } from '@/server/session';

/** Rôles autorisés à modifier l'intégration (le rôle « finance » peut seulement consulter). */
const EDITORS = ['owner', 'admin', 'developer'] as const;

const path = (gameId: string) => `/studio/games/${gameId}/integration`;

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function guard(gameId: string): Promise<string | null> {
  try {
    await requireGameAccess(gameId, [...EDITORS]);
    return null;
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return "Vous n'avez pas les droits pour modifier l'intégration de ce jeu.";
    throw e; // redirection vers /login, etc.
  }
}

/**
 * Génère une nouvelle clé SECRÈTE (`wk_secret_…`) ; l'ancienne cesse immédiatement de fonctionner.
 * La clé n'est renvoyée qu'une fois (seule son empreinte est stockée).
 */
export async function regenerateApiKey(gameId: string): Promise<ActionResult<{ apiKey: string; prefix: string }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const { key, hash, prefix } = generateSecretApiKey();
  await db.update(games).set({ apiKeyHash: hash, apiKeyPrefix: prefix, updatedAt: new Date() }).where(eq(games.id, gameId));
  revalidatePath(path(gameId));
  return { ok: true, apiKey: key, prefix };
}

/** Nouvelle clé PUBLIQUE (`wk_pub_…`) : les versions du jeu qui embarquent l'ancienne ne pourront plus lier de compte ni recevoir d'achats. */
export async function regeneratePublishableKey(gameId: string): Promise<ActionResult<{ publishableKey: string }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const publishableKey = generatePublishableKey();
  await db.update(games).set({ publishableKey, updatedAt: new Date() }).where(eq(games.id, gameId));
  revalidatePath(path(gameId));
  return { ok: true, publishableKey };
}

export async function revealWebhookSecret(gameId: string): Promise<ActionResult<{ secret: string }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const [g] = await db.select({ secret: games.webhookSecret }).from(games).where(eq(games.id, gameId));
  if (!g) return { ok: false, error: 'Jeu introuvable.' };
  return { ok: true, secret: g.secret };
}

export async function regenerateWebhookSecret(gameId: string): Promise<ActionResult<{ secret: string }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const secret = randomToken('whsec_');
  await db.update(games).set({ webhookSecret: secret, updatedAt: new Date() }).where(eq(games.id, gameId));
  revalidatePath(path(gameId));
  return { ok: true, secret };
}

/**
 * Enregistre l'URL du webhook (vide = livraison par le SDK seulement). Validation anti-SSRF : https obligatoire et
 * aucune adresse interne (après résolution DNS) en production. Les livraisons créées avant l'URL et toujours en
 * attente sont reprises : elles partent vers le webhook au prochain passage de la file de relance.
 */
export async function updateWebhookUrl(gameId: string, url: string): Promise<ActionResult<{ webhookUrl: string | null; resumed: number }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const raw = z.string().max(2000).safeParse(url);
  if (!raw.success) return { ok: false, error: 'URL trop longue.' };
  const value = raw.data.trim();
  if (value) {
    const check = await validateWebhookUrl(value);
    if (!check.ok) return { ok: false, error: check.message };
  }
  const webhookUrl = value || null;
  await db.update(games).set({ webhookUrl, updatedAt: new Date() }).where(eq(games.id, gameId));
  const resumed = webhookUrl ? await resumeParkedDeliveries(gameId) : 0;
  if (resumed > 0) {
    // Envoi immédiat après la réponse (le cron et la boucle de dev les reprendraient de toute façon).
    after(() => retryDueDeliveries().then(() => undefined, (e) => console.error('[integration] reprise des livraisons', e)));
  }
  revalidatePath(path(gameId));
  return { ok: true, webhookUrl, resumed };
}

export async function sendTestEvent(gameId: string): Promise<ActionResult<{ statusCode: number | null; durationMs: number; error: string | null }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const r = await sendTestWebhook(gameId);
  return { ok: true, statusCode: r.statusCode, durationMs: r.durationMs, error: r.ok ? null : r.error };
}

export async function retryDeliveryAction(gameId: string, deliveryId: string): Promise<ActionResult> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const r = await retryDelivery(gameId, deliveryId);
  revalidatePath(path(gameId));
  if (r === 'not_found') return { ok: false, error: 'Livraison introuvable.' };
  if (r === 'not_retryable') return { ok: false, error: 'Cette livraison ne peut pas être relancée (déjà livrée, ou commande remboursée).' };
  return { ok: true };
}

const playerIdInput = z.string().trim().min(1, 'Saisissez un identifiant joueur.').max(200, 'Identifiant trop long.');

/** Révoque tous les jetons joueur (appareils liés via le SDK client) d'un joueur. */
export async function revokePlayerTokensAction(gameId: string, playerId: string): Promise<ActionResult<{ revoked: number }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const parsed = playerIdInput.safeParse(playerId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Identifiant invalide.' };
  const revoked = await revokePlayerTokens(gameId, parsed.data);
  revalidatePath(path(gameId));
  return { ok: true, revoked };
}
