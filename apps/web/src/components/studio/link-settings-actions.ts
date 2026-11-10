'use server';

import { revalidatePath } from 'next/cache';
import { INTEGRATION_ADMINS, auditUrl, recordIntegrationAudit } from '@/server/integration-audit';
import { getLinkSettings, updateLinkSettings } from '@/server/linking';
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

/** Server action du composant LinkSettings (à lier avec .bind(null, gameId)). Rôles : owner, admin, developer (URL : owner, admin). */
export async function saveLinkSettingsAction(gameId: string, prev: LinkSettingsState, fd: FormData): Promise<LinkSettingsState> {
  const version = (prev?.version ?? 0) + 1;
  const values: LinkSettingsValues = {
    methods: fd.getAll('methods').filter((v): v is string => typeof v === 'string'),
    playerLookupUrl: typeof fd.get('playerLookupUrl') === 'string' ? String(fd.get('playerLookupUrl')) : '',
  };
  let actor: Awaited<ReturnType<typeof requireGameAccess>>;
  try {
    actor = await requireGameAccess(gameId, ['owner', 'admin', 'developer']);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return { version, error: "Vous n'avez pas les droits pour modifier ce jeu.", values };
    throw e; // redirection vers /login, etc.
  }
  // Changer l'URL appelée par Dev AppStore est réservé à owner / admin et journalisé (revue 2026-11, F8 / T-DLV-10).
  const before = await getLinkSettings(gameId);
  const urlChanged = (before?.playerLookupUrl ?? '') !== values.playerLookupUrl.trim();
  if (urlChanged && !INTEGRATION_ADMINS.includes(actor.role)) {
    return { version, error: "Seuls les propriétaires et administrateurs du studio peuvent changer l'URL de recherche.", values };
  }
  const r = await updateLinkSettings(gameId, values);
  if (!r.ok) return { version, error: r.message, values };
  if (urlChanged) {
    await recordIntegrationAudit(gameId, actor, 'lookup_url.updated', { from: auditUrl(before?.playerLookupUrl), to: auditUrl(r.playerLookupUrl) });
  }
  revalidatePath(`/studio/games/${gameId}/integration`);
  return { version, ok: true, values: { methods: r.linkMethods, playerLookupUrl: r.playerLookupUrl ?? '' } };
}
