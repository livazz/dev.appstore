'use server';

import { revalidatePath } from 'next/cache';
import { updateLinkSettings } from '@/server/linking';
import { requireGameAccess } from '@/server/session';

export interface LinkSettingsValues {
  methods: string[];
  playerLookupUrl: string;
}
export interface LinkSettingsState {
  version: number;
  ok?: boolean;
  error?: string;
  values?: LinkSettingsValues;
}

/** Server action du composant LinkSettings (à lier avec .bind(null, gameId)). Rôles : owner, admin, developer. */
export async function saveLinkSettingsAction(gameId: string, prev: LinkSettingsState, fd: FormData): Promise<LinkSettingsState> {
  const version = (prev?.version ?? 0) + 1;
  const values: LinkSettingsValues = {
    methods: fd.getAll('methods').filter((v): v is string => typeof v === 'string'),
    playerLookupUrl: typeof fd.get('playerLookupUrl') === 'string' ? String(fd.get('playerLookupUrl')) : '',
  };
  try {
    await requireGameAccess(gameId, ['owner', 'admin', 'developer']);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return { version, error: "Vous n'avez pas les droits pour modifier ce jeu.", values };
    throw e; // redirection vers /login, etc.
  }
  const r = await updateLinkSettings(gameId, values);
  if (!r.ok) return { version, error: r.message, values };
  revalidatePath(`/studio/games/${gameId}/integration`);
  return { version, ok: true, values: { methods: r.linkMethods, playerLookupUrl: r.playerLookupUrl ?? '' } };
}
