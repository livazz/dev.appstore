import 'server-only';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { AiStyleError, generateCardStyle, type AiStyleClient, type GenerateResult } from '@devappstore/ai-style';
import { newId } from '@devappstore/core';
import { aiStyleGenerations, and, count, desc, eq, games, gt, items, ne, type DB } from '@devappstore/db';
import {
  AI_STYLE_MAX_SIDE_PX,
  AI_STYLE_MAX_UPLOAD_BYTES,
  type AiStyleActionResult,
  type AiStyleErrorCode,
  type AiStyleResult,
} from '@/lib/ai-style-types';

/*
 * Génération du style d'une carte article depuis une capture du jeu (@devappstore/ai-style), côté serveur.
 * Logique testable (base et client IA injectés) ; la Server Action est dans ./ai-style-action.ts.
 */

/** Générations autorisées par studio sur 24 h glissantes (surchargeable par AI_STYLE_DAILY_LIMIT). */
export const DEFAULT_AI_STYLE_DAILY_LIMIT = 20;
export const AI_STYLE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function aiStyleDailyLimit(env: NodeJS.ProcessEnv = process.env) {
  const n = Number.parseInt(env.AI_STYLE_DAILY_LIMIT ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_AI_STYLE_DAILY_LIMIT;
}

export function isAiStyleConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !!env.ANTHROPIC_API_KEY?.trim();
}

/** Dépendances remplaçables en test (client IA simulé). */
export const aiStyleDeps: { createClient: () => AiStyleClient } = {
  createClient: () => new Anthropic(),
};

export class AiStyleActionError extends Error {
  constructor(
    readonly code: AiStyleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiStyleActionError';
  }
}

export const MESSAGES = {
  forbidden: "Vous n'avez pas accès à ce jeu.",
  not_configured: "Fonction non configurée : la génération par IA n'est pas activée sur ce serveur (ANTHROPIC_API_KEY absente).",
  no_file: 'Aucune image reçue : choisissez une capture PNG, JPEG ou WebP.',
  too_large: `Image trop lourde (maximum ${AI_STYLE_MAX_UPLOAD_BYTES / 1024 / 1024} Mo) : recadrez la capture sur l'article.`,
  invalid_image: 'Image illisible : utilisez une capture PNG, JPEG ou WebP.',
  rate_limited: (limit: number) => `Limite atteinte : ${limit} générations par studio sur 24 h. Réessayez plus tard.`,
  service_busy: 'Service IA saturé, réessayez dans une minute.',
  refusal: "Le modèle a refusé d'analyser cette image. Essayez avec une capture recadrée sur l'article.",
  failed: "La génération a échoué. Réessayez, ou réglez la carte à la main.",
} as const;

/* ---------------- Image ---------------- */

/**
 * Valide puis normalise la capture avant l'envoi : orientation EXIF appliquée, côté long ramené à
 * AI_STYLE_MAX_SIDE_PX (sans agrandir), première image d'un GIF animé, réencodage WebP (alpha conservé).
 * Moins de pixels = moins de jetons facturés, sans perte utile pour lire couleurs et mise en page.
 */
export async function prepareScreenshot(bytes: Uint8Array): Promise<Buffer> {
  if (bytes.byteLength === 0) throw new AiStyleActionError('invalid_input', MESSAGES.no_file);
  if (bytes.byteLength > AI_STYLE_MAX_UPLOAD_BYTES) throw new AiStyleActionError('image_too_large', MESSAGES.too_large);
  try {
    const img = sharp(bytes, { limitInputPixels: 50_000_000, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.format || !['png', 'jpeg', 'webp', 'gif'].includes(meta.format)) {
      throw new AiStyleActionError('invalid_image', MESSAGES.invalid_image);
    }
    return await img
      .rotate()
      .resize({ width: AI_STYLE_MAX_SIDE_PX, height: AI_STYLE_MAX_SIDE_PX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (e) {
    if (e instanceof AiStyleActionError) throw e;
    throw new AiStyleActionError('invalid_image', MESSAGES.invalid_image);
  }
}

/* ---------------- Limite de débit ---------------- */

interface Scope {
  studioId: string;
  gameId: string;
  userId: string | null;
}

/** Générations comptées pour le studio sur la fenêtre (réussies + en cours ; les échecs ne comptent pas). */
export async function countRecentGenerations(database: DB, studioId: string, now = new Date()) {
  const since = new Date(now.getTime() - AI_STYLE_WINDOW_MS);
  const [row] = await database
    .select({ n: count() })
    .from(aiStyleGenerations)
    .where(and(eq(aiStyleGenerations.studioId, studioId), ne(aiStyleGenerations.status, 'error'), gt(aiStyleGenerations.createdAt, since)));
  return Number(row?.n ?? 0);
}

/**
 * Réserve une génération : insère d'abord la ligne puis compte, pour que deux requêtes simultanées
 * ne dépassent pas la limite (au pire, les deux sont refusées). Renvoie l'id réservé et le solde restant.
 */
export async function reserveGeneration(database: DB, scope: Scope, limit: number, now = new Date()) {
  const id = newId('aig');
  await database.insert(aiStyleGenerations).values({ id, ...scope, status: 'pending', createdAt: now });
  const used = await countRecentGenerations(database, scope.studioId, now);
  if (used > limit) {
    await database.delete(aiStyleGenerations).where(eq(aiStyleGenerations.id, id));
    throw new AiStyleActionError('rate_limited', MESSAGES.rate_limited(limit));
  }
  return { id, remaining: Math.max(0, limit - used) };
}

async function finishGeneration(database: DB, id: string, r: GenerateResult) {
  await database
    .update(aiStyleGenerations)
    .set({
      status: 'ok',
      model: r.model,
      inputTokens: r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens,
      outputTokens: r.usage.outputTokens,
      costMicroUsd: r.estimatedCostUsd == null ? null : Math.round(r.estimatedCostUsd * 1e6),
    })
    .where(eq(aiStyleGenerations.id, id));
}

/** Un refus du modèle est facturé : il reste compté (statut ok + code). Les autres échecs libèrent le quota. */
async function failGeneration(database: DB, id: string, errorCode: string, billed: boolean) {
  await database
    .update(aiStyleGenerations)
    .set({ status: billed ? 'ok' : 'error', errorCode })
    .where(eq(aiStyleGenerations.id, id));
}

/* ---------------- Erreurs ---------------- */

function translateError(e: unknown): { code: AiStyleErrorCode; message: string; errorCode: string; billed: boolean } {
  if (e instanceof AiStyleError) {
    switch (e.code) {
      case 'image_too_large':
        return { code: 'image_too_large', message: MESSAGES.too_large, errorCode: e.code, billed: false };
      case 'invalid_image':
      case 'unsupported_media_type':
        return { code: 'invalid_image', message: MESSAGES.invalid_image, errorCode: e.code, billed: false };
      case 'refusal':
        return { code: 'refusal', message: MESSAGES.refusal, errorCode: e.code, billed: true };
      default:
        return { code: 'failed', message: MESSAGES.failed, errorCode: e.code, billed: true };
    }
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return { code: 'not_configured', message: MESSAGES.not_configured.replace('absente', 'absente ou invalide'), errorCode: 'auth', billed: false };
  }
  if (e instanceof Anthropic.RateLimitError) return { code: 'service_busy', message: MESSAGES.service_busy, errorCode: 'api_429', billed: false };
  if (e instanceof Anthropic.APIError) {
    const busy = e.status === 529 || e.status === 503;
    return { code: busy ? 'service_busy' : 'failed', message: busy ? MESSAGES.service_busy : MESSAGES.failed, errorCode: `api_${e.status ?? 'x'}`, billed: false };
  }
  return { code: 'failed', message: MESSAGES.failed, errorCode: 'unexpected', billed: false };
}

/* ---------------- Orchestration ---------------- */

/** Contexte et style de repli : nom du jeu et style du dernier article (cohérence de la boutique). */
async function gameContext(database: DB, gameId: string) {
  const game = await database.query.games.findFirst({ where: eq(games.id, gameId), columns: { name: true } });
  const last = await database.query.items.findFirst({
    where: eq(items.gameId, gameId),
    orderBy: [desc(items.position)],
    columns: { style: true, layout: true },
  });
  return { name: game?.name ?? '', last };
}

export interface RunParams extends Scope {
  database: DB;
  file: unknown;
  env?: NodeJS.ProcessEnv;
  client?: AiStyleClient;
  now?: Date;
}

/**
 * Enchaîne : configuration → fichier → redimensionnement → réservation de quota → appel IA → journal.
 * L'accès au jeu doit avoir été vérifié par l'appelant (requireGameAccess).
 */
export async function runAiStyleGeneration(p: RunParams): Promise<AiStyleActionResult> {
  try {
    const env = p.env ?? process.env;
    if (!isAiStyleConfigured(env)) throw new AiStyleActionError('not_configured', MESSAGES.not_configured);
    if (!(p.file instanceof Blob) || p.file.size === 0) throw new AiStyleActionError('invalid_input', MESSAGES.no_file);
    if (p.file.size > AI_STYLE_MAX_UPLOAD_BYTES) throw new AiStyleActionError('image_too_large', MESSAGES.too_large);

    const image = await prepareScreenshot(new Uint8Array(await p.file.arrayBuffer()));
    const limit = aiStyleDailyLimit(env);
    const { id, remaining } = await reserveGeneration(p.database, p, limit, p.now);

    let r: GenerateResult;
    try {
      const ctx = await gameContext(p.database, p.gameId);
      r = await generateCardStyle(
        { data: image, mediaType: 'image/webp' },
        {
          client: p.client ?? aiStyleDeps.createClient(),
          context: ctx.name ? `${ctx.name} — article de la boutique` : undefined,
          fallbackStyle: ctx.last?.style,
          fallbackLayout: ctx.last?.layout,
        },
      );
    } catch (e) {
      const t = translateError(e);
      await failGeneration(p.database, id, t.errorCode, t.billed);
      if (t.code !== 'failed') throw new AiStyleActionError(t.code, t.message);
      console.error('[ai-style] génération échouée', e);
      throw new AiStyleActionError('failed', t.message);
    }
    await finishGeneration(p.database, id, r);

    const data: AiStyleResult = {
      layout: r.layout,
      style: r.style,
      ...(r.title ? { title: r.title } : {}),
      ...(r.subtitle ? { subtitle: r.subtitle } : {}),
      warnings: r.warnings.map(({ code, field, message }) => ({ code, field, message })),
      remaining,
    };
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AiStyleActionError) return { ok: false, code: e.code, error: e.message };
    throw e;
  }
}
