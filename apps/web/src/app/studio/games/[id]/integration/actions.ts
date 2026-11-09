'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hashApiKey, randomToken } from '@wolleen/core';
import { db, eq, games } from '@wolleen/db';
import { retryDelivery, sendTestWebhook } from '@/server/delivery';
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

/** Génère une nouvelle clé API (l'ancienne cesse immédiatement de fonctionner). La clé n'est renvoyée qu'une fois. */
export async function regenerateApiKey(gameId: string): Promise<ActionResult<{ apiKey: string; prefix: string }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const apiKey = randomToken('wk_live_');
  const prefix = apiKey.slice(0, 12);
  await db.update(games).set({ apiKeyHash: hashApiKey(apiKey), apiKeyPrefix: prefix, updatedAt: new Date() }).where(eq(games.id, gameId));
  revalidatePath(path(gameId));
  return { ok: true, apiKey, prefix };
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

const webhookUrlSchema = z
  .string()
  .trim()
  .max(2000, 'URL trop longue.')
  .refine((v) => {
    if (v === '') return true;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Saisissez une URL http(s) valide, ex. https://api.monjeu.com/wolleen/webhook');

export async function updateWebhookUrl(gameId: string, url: string): Promise<ActionResult<{ webhookUrl: string | null }>> {
  const denied = await guard(gameId);
  if (denied) return { ok: false, error: denied };
  const parsed = webhookUrlSchema.safeParse(url);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'URL invalide.' };
  const webhookUrl = parsed.data || null;
  await db.update(games).set({ webhookUrl, updatedAt: new Date() }).where(eq(games.id, gameId));
  revalidatePath(path(gameId));
  return { ok: true, webhookUrl };
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
  if (r === 'not_retryable') return { ok: false, error: 'Cette livraison est déjà livrée.' };
  return { ok: true };
}
