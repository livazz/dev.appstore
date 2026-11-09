'use server';

import { revalidatePath } from 'next/cache';
import { AdminError, approveGame, disableUser, enableUser, reactivateGame, retryOrderDelivery, suspendGame } from '@/server/admin';
import type { AdminActionState } from '@/components/admin/action-state';

/*
 * Server Actions du back-office. Chaque fonction de @/server/admin vérifie elle-même l'accès (404 sinon)
 * et journalise l'action : ces enveloppes ne font que lire le formulaire et traduire les erreurs métier.
 */

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
}

async function run(fn: () => Promise<string>, paths: string[]): Promise<AdminActionState> {
  try {
    const message = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, message, at: Date.now() };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, message: e.message, at: Date.now() };
    throw e; // 404 (notFound) et erreurs inattendues
  }
}

export async function approveGameAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  const id = field(form, 'gameId');
  return run(async () => {
    const r = await approveGame(id, field(form, 'note'));
    return `Revue approuvée : le jeu est en ligne.${r.notified ? ' Le studio a été prévenu par e-mail.' : ' L’e-mail au studio n’a pas pu partir (voir l’historique).'}`;
  }, [`/admin/games/${id}`, '/admin/games', '/admin']);
}

export async function suspendGameAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  const id = field(form, 'gameId');
  return run(async () => {
    const r = await suspendGame(id, { ground: field(form, 'ground') as never, reason: field(form, 'reason') });
    return `Jeu suspendu.${r.notified ? ' Le motif a été communiqué au studio par e-mail.' : ' L’e-mail au studio n’a pas pu partir : le motif reste visible dans son espace studio.'}`;
  }, [`/admin/games/${id}`, '/admin/games', '/admin']);
}

export async function reactivateGameAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  const id = field(form, 'gameId');
  return run(async () => {
    const r = await reactivateGame(id, field(form, 'note'));
    return `Jeu réactivé : il est de nouveau en ligne.${r.notified ? ' Le studio a été prévenu par e-mail.' : ''}`;
  }, [`/admin/games/${id}`, '/admin/games', '/admin']);
}

const DELIVERY_RESULT: Record<string, string> = {
  pending: 'en attente (nouvelle tentative planifiée ou récupération par le SDK)',
  delivered: 'livrée',
  acknowledged: 'confirmée par le jeu',
  failed: 'en échec',
};

export async function retryDeliveryAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  const id = field(form, 'orderId');
  return run(async () => {
    const r = await retryOrderDelivery(id);
    return `Livraison relancée : ${DELIVERY_RESULT[r.status] ?? r.status}${r.lastError ? ` — ${r.lastError}` : ''}.`;
  }, [`/admin/orders/${id}`]);
}

export async function disableUserAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  const id = field(form, 'userId');
  return run(async () => {
    const r = await disableUser(id, { reason: field(form, 'reason') });
    return `Compte désactivé. ${r.revokedSessions} session${r.revokedSessions > 1 ? 's' : ''} révoquée${r.revokedSessions > 1 ? 's' : ''}.`;
  }, [`/admin/users/${id}`, '/admin/users']);
}

export async function enableUserAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  const id = field(form, 'userId');
  return run(async () => {
    await enableUser(id, field(form, 'note'));
    return 'Compte réactivé.';
  }, [`/admin/users/${id}`, '/admin/users']);
}
