'use server';

import { revalidatePath } from 'next/cache';
import { unlinkGameLink } from '@/server/linking';
import { requireUser } from '@/server/session';

/** Délier un compte de jeu (uniquement un lien de l'utilisateur connecté). */
export async function unlinkAction(fd: FormData) {
  const user = await requireUser('/account');
  const linkId = fd.get('linkId');
  if (typeof linkId === 'string' && linkId) await unlinkGameLink(user.id, linkId);
  revalidatePath('/account');
}
