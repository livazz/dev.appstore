'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PlayerLookupResponse } from '@devappstore/core';
import { clientIp } from '@/server/client-ip';
import { emailNotVerifiedMessage, isEmailVerified } from '@/server/email-verification';
import { confirmIdLink, getLinkableGame, linkReturnPath, redeemLinkCode, startIdConfirm } from '@/server/linking';
import { requireUser } from '@/server/session';

export interface CodeFormState {
  error?: string;
  code?: string;
  /** Code demandé par le jeu sans serveur (clé publique) : compte de jeu à confirmer avant la liaison. */
  confirm?: { playerId: string; playerName: string | null };
}
export interface LookupFormState {
  error?: string;
  playerId?: string;
  candidate?: { attemptId: string; player: PlayerLookupResponse };
}
export interface ConfirmFormState {
  error?: string;
  attemptId?: string;
}

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};

/** Utilisateur connecté + jeu (le slug et l'article viennent du formulaire : tout est revérifié côté serveur). */
async function context(fd: FormData) {
  const slug = field(fd, 'slug');
  const user = await requireUser(`/games/${encodeURIComponent(slug)}/link`);
  const game = slug ? await getLinkableGame(slug, user.id) : null;
  // Revue de sécurité A-04 : liaison d'un compte de jeu réservée aux adresses vérifiées.
  const unverified = (await isEmailVerified(user.id)) ? undefined : emailNotVerifiedMessage('pour lier un compte de jeu');
  return { user, game, item: field(fd, 'item') || null, unverified };
}

export async function redeemCodeAction(_prev: CodeFormState, fd: FormData): Promise<CodeFormState> {
  const code = field(fd, 'code').slice(0, 32);
  const confirmed = field(fd, 'confirm') === '1';
  const { user, game, item, unverified } = await context(fd);
  if (unverified) return { error: unverified, code };
  if (!game) return { error: 'Jeu introuvable.', code };
  const r = await redeemLinkCode(user.id, game, code, { ip: clientIp(await headers()), confirmed });
  if (!r.ok) {
    if (r.error === 'confirmation_required' && r.candidate) return { code, confirm: r.candidate };
    return { error: r.message, code };
  }
  redirect(await linkReturnPath(game, item));
}

export async function lookupPlayerAction(_prev: LookupFormState, fd: FormData): Promise<LookupFormState> {
  const playerId = field(fd, 'playerId').slice(0, 128);
  const { user, game, unverified } = await context(fd);
  if (unverified) return { error: unverified, playerId };
  if (!game) return { error: 'Jeu introuvable.', playerId };
  const r = await startIdConfirm(user.id, game, playerId, { ip: clientIp(await headers()) });
  if (!r.ok) return { error: r.message, playerId };
  return { playerId, candidate: { attemptId: r.attemptId, player: r.player } };
}

export async function confirmPlayerAction(_prev: ConfirmFormState, fd: FormData): Promise<ConfirmFormState> {
  const attemptId = field(fd, 'attemptId');
  const { user, game, item, unverified } = await context(fd);
  if (unverified) return { error: unverified, attemptId };
  if (!game) return { error: 'Jeu introuvable.', attemptId };
  const r = await confirmIdLink(user.id, game, attemptId);
  if (!r.ok) return { error: r.message, attemptId };
  redirect(await linkReturnPath(game, item));
}
