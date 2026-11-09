'use server';

import { db } from '@devappstore/db';
import type { StudioRole } from '@devappstore/core';
import { requireGameAccess } from './session';
import { MESSAGES, runAiStyleGeneration } from './ai-style-logic';
import type { AiStyleActionResult } from '@/lib/ai-style-types';

/*
 * Server Action : génère { layout, style, title?, subtitle?, warnings } depuis une capture de la
 * carte dans le jeu. Réservée aux membres du studio du jeu (hors rôle « finance »), limitée par
 * studio (AI_STYLE_DAILY_LIMIT, 20 / 24 h par défaut), désactivée sans ANTHROPIC_API_KEY.
 * Champ du FormData : « image » (PNG, JPEG, WebP ou GIF).
 */

const EDITOR_ROLES: StudioRole[] = ['owner', 'admin', 'developer'];

export async function generateStyleFromScreenshot(gameId: string, formData: FormData): Promise<AiStyleActionResult> {
  if (typeof gameId !== 'string' || !gameId) return { ok: false, code: 'invalid_input', error: 'Jeu introuvable.' };
  let access: Awaited<ReturnType<typeof requireGameAccess>>;
  try {
    access = await requireGameAccess(gameId, EDITOR_ROLES);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return { ok: false, code: 'forbidden', error: MESSAGES.forbidden };
    throw e; // redirect() vers /login
  }
  const file = formData instanceof FormData ? formData.get('image') : null;
  return runAiStyleGeneration({ database: db, studioId: access.studioId, gameId, userId: access.user.id, file });
}
