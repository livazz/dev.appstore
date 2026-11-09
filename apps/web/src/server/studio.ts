'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@devappstore/db';
import type { StudioRole } from '@devappstore/core';
import { requireGameAccess, requireUser } from './session';
import {
  StudioError,
  createGameFor,
  createItemFor,
  deleteGameById,
  deleteItemFor,
  getGame,
  moveItemFor,
  reorderItemsFor,
  setGameStatus,
  updateGameInfo,
  updateItemFor,
  type GameInfoInput,
  type GameRow,
  type ItemInput,
  type NewGameInput,
} from './studio-logic';
import { toEditorGame, toEditorItem, type EditorGame, type EditorItem } from '@/lib/studio-types';

/*
 * Server Actions de l'espace studio (tâche studio-editor).
 * Chaque action sur un jeu passe d'abord par requireGameAccess(gameId) ; la logique et la
 * validation (zod) sont dans studio-logic.ts. Les erreurs attendues sont renvoyées sous forme
 * { ok: false, error } (message en français) plutôt que levées, pour être affichées telles quelles.
 */

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const FORBIDDEN_MSG = "Vous n'avez pas accès à ce jeu.";

/*
 * Matrice des rôles (modèle de menaces § 6.6, CHK-MT-06) : finance ne modifie pas la boutique ;
 * seuls owner/admin publient, dépublient ou suppriment un jeu.
 */
const EDIT_ROLES = ['owner', 'admin', 'developer'] as const satisfies StudioRole[];
const PUBLISH_ROLES = ['owner', 'admin'] as const satisfies StudioRole[];

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof StudioError) return { ok: false, error: e.message };
    if (e instanceof Error && e.message === 'FORBIDDEN') return { ok: false, error: FORBIDDEN_MSG };
    throw e; // redirect() de requireUser, erreurs inattendues
  }
}

async function guarded<T>(gameId: string, fn: () => Promise<T>, roles: readonly StudioRole[]) {
  return run(async () => {
    if (typeof gameId !== 'string' || !gameId) throw new StudioError('Jeu introuvable.');
    await requireGameAccess(gameId, [...roles]);
    return fn();
  });
}

function revalidateGame(game: Pick<GameRow, 'id' | 'slug'>) {
  revalidatePath(`/studio/games/${game.id}`, 'layout');
  revalidatePath(`/games/${game.slug}`);
  revalidatePath('/studio');
}

/* ---------------- Jeux ---------------- */

/** Crée un jeu (brouillon). La clé API en clair n'est renvoyée qu'ici, une seule fois. */
export async function createGame(input: NewGameInput): Promise<ActionResult<{ id: string; slug: string; apiKey: string; webhookSecret: string }>> {
  return run(async () => {
    const user = await requireUser('/studio/games/new');
    const { game, apiKey } = await createGameFor(db, user.id, input);
    revalidatePath('/studio');
    return { id: game.id, slug: game.slug, apiKey, webhookSecret: game.webhookSecret };
  });
}

/** Nom, sous-titre, éditeur, icône, bannière, thème (dégradé + grille). */
export async function updateGame(gameId: string, patch: GameInfoInput): Promise<ActionResult<EditorGame>> {
  return guarded(gameId, async () => {
    const game = await updateGameInfo(db, gameId, patch);
    revalidateGame(game);
    return toEditorGame(game);
  }, EDIT_ROLES);
}

/** Phase 1 : « Soumettre / publier » passe directement le jeu en ligne. */
export async function publishGame(gameId: string): Promise<ActionResult<EditorGame>> {
  return guarded(gameId, async () => {
    const game = await setGameStatus(db, gameId, 'live');
    revalidateGame(game);
    return toEditorGame(game);
  }, PUBLISH_ROLES);
}

export async function unpublishGame(gameId: string): Promise<ActionResult<EditorGame>> {
  return guarded(gameId, async () => {
    const game = await setGameStatus(db, gameId, 'draft');
    revalidateGame(game);
    return toEditorGame(game);
  }, PUBLISH_ROLES);
}

/** Réservé aux owner/admin du studio. */
export async function deleteGame(gameId: string): Promise<ActionResult> {
  return guarded(
    gameId,
    async () => {
      const game = await getGame(db, gameId);
      await deleteGameById(db, gameId);
      revalidateGame(game);
      return undefined;
    },
    PUBLISH_ROLES,
  );
}

/* ---------------- Articles ---------------- */

export async function createItem(gameId: string, input: ItemInput): Promise<ActionResult<EditorItem>> {
  return guarded(gameId, async () => {
    const item = await createItemFor(db, gameId, input);
    revalidateGame(await getGame(db, gameId));
    return toEditorItem(item);
  }, EDIT_ROLES);
}

export async function updateItem(gameId: string, itemId: string, input: ItemInput): Promise<ActionResult<EditorItem>> {
  return guarded(gameId, async () => {
    const item = await updateItemFor(db, gameId, String(itemId), input);
    revalidateGame(await getGame(db, gameId));
    return toEditorItem(item);
  }, EDIT_ROLES);
}

export async function deleteItem(gameId: string, itemId: string): Promise<ActionResult<{ archived: boolean }>> {
  return guarded(gameId, async () => {
    const r = await deleteItemFor(db, gameId, String(itemId));
    revalidateGame(await getGame(db, gameId));
    return r;
  }, EDIT_ROLES);
}

export async function moveItem(gameId: string, itemId: string, direction: 'up' | 'down'): Promise<ActionResult<string[]>> {
  return guarded(gameId, async () => {
    if (direction !== 'up' && direction !== 'down') throw new StudioError('Direction invalide.');
    const order = await moveItemFor(db, gameId, String(itemId), direction);
    revalidateGame(await getGame(db, gameId));
    return order;
  }, EDIT_ROLES);
}

export async function reorderItems(gameId: string, orderedIds: string[]): Promise<ActionResult<string[]>> {
  return guarded(gameId, async () => {
    const order = await reorderItemsFor(db, gameId, orderedIds);
    revalidateGame(await getGame(db, gameId));
    return order;
  }, EDIT_ROLES);
}
