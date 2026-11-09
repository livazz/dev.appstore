'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { StudioRole } from '@devappstore/core';
import { db, eq, games } from '@devappstore/db';
import { requireGameAccess } from './session';
import { StudioError } from './studio-logic';
import {
  deleteStoreCredentials,
  discountBpsSchema,
  fetchCatalogFor,
  importSelectionFor,
  priceForWeb,
  saveStoreCredentials,
  storeSourceSchema,
  type CatalogPreview,
  type CredentialStatus,
  type ImportOutcome,
} from './import-logic';

/*
 * Server Actions de la page « Importer depuis les stores » (/studio/games/[id]/import).
 * Chaque action passe par requireGameAccess(gameId, rôles d'édition) ; validation zod ici et dans import-logic.ts.
 * Les erreurs attendues reviennent sous forme { ok: false, error } (message en français).
 * Les identifiants des stores ne sont jamais renvoyés au navigateur : seulement un rappel non secret.
 */

export type ImportActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Le rôle « finance » consulte, mais ne modifie pas la boutique. */
const EDIT_ROLES: StudioRole[] = ['owner', 'admin', 'developer'];

const gameIdSchema = z.string().min(1).max(64);

async function guarded<T>(gameId: unknown, fn: (gameId: string, userId: string) => Promise<T>): Promise<ImportActionResult<T>> {
  try {
    const id = gameIdSchema.safeParse(gameId);
    if (!id.success) throw new StudioError('Jeu introuvable.');
    const { user } = await requireGameAccess(id.data, EDIT_ROLES);
    return { ok: true, data: await fn(id.data, user.id) };
  } catch (e) {
    if (e instanceof StudioError) return { ok: false, error: e.message };
    if (e instanceof Error && e.message === 'FORBIDDEN') return { ok: false, error: "Vous n'avez pas le droit de modifier ce jeu." };
    throw e; // redirect() de requireUser, erreurs inattendues
  }
}

/** Enregistre (chiffrés) les identifiants App Store Connect ou Google Play du jeu. */
export async function saveStoreCredentialsAction(gameId: string, source: string, input: unknown): Promise<ImportActionResult<CredentialStatus>> {
  return guarded(gameId, async (id) => {
    const s = storeSourceSchema.safeParse(source);
    if (!s.success) throw new StudioError('Store inconnu.');
    return saveStoreCredentials(db, id, s.data, input);
  });
}

export async function deleteStoreCredentialsAction(gameId: string, source: string): Promise<ImportActionResult<CredentialStatus>> {
  return guarded(gameId, async (id) => {
    const s = storeSourceSchema.safeParse(source);
    if (!s.success) throw new StudioError('Store inconnu.');
    return deleteStoreCredentials(db, id, s.data);
  });
}

const fetchInputSchema = z.object({ demo: z.boolean().default(false), discountBps: discountBpsSchema });

/** « Récupérer le catalogue » (identifiants enregistrés) ou « Essayer avec un catalogue d'exemple » (demo: true). */
export async function fetchCatalogAction(gameId: string, input: { demo?: boolean; discountBps: number }): Promise<ImportActionResult<CatalogPreview>> {
  return guarded(gameId, async (id, userId) => {
    const parsed = fetchInputSchema.safeParse(input);
    if (!parsed.success) throw new StudioError(parsed.error.issues[0]?.message ?? 'Paramètres invalides.');
    return fetchCatalogFor(db, id, { mode: parsed.data.demo ? 'demo' : 'live', userId, discountBps: parsed.data.discountBps });
  });
}

const repriceSchema = z.object({ discountBps: discountBpsSchema, prices: z.array(z.number().int().positive().max(10_000_000)).max(1000) });

/** Recalcule les prix web suggérés quand le studio change la remise (sans rappeler les stores). */
export async function repriceAction(
  gameId: string,
  input: { discountBps: number; prices: number[] },
): Promise<ImportActionResult<{ suggestedCents: number | null; webPriceCents: number; note?: string }[]>> {
  return guarded(gameId, async () => {
    const parsed = repriceSchema.safeParse(input);
    if (!parsed.success) throw new StudioError(parsed.error.issues[0]?.message ?? 'Paramètres invalides.');
    return parsed.data.prices.map((p) => priceForWeb(p, parsed.data.discountBps));
  });
}

/** « Importer la sélection » : crée les articles cochés dans la boutique. */
export async function importSelectionAction(gameId: string, input: unknown): Promise<ImportActionResult<ImportOutcome>> {
  return guarded(gameId, async (id) => {
    const outcome = await importSelectionFor(db, id, input);
    if (outcome.created.length) {
      const [game] = await db.select({ slug: games.slug }).from(games).where(eq(games.id, id));
      revalidatePath(`/studio/games/${id}`, 'layout');
      if (game) revalidatePath(`/games/${game.slug}`);
    }
    return outcome;
  });
}
