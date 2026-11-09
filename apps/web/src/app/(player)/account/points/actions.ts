'use server';

import { revalidatePath } from 'next/cache';
import { redeemReward } from '@/server/loyalty';
import { requireUser } from '@/server/session';

export interface RedeemState {
  status: 'idle' | 'ok' | 'error';
  message: string;
}

/** Échange de points contre une récompense, pour l'utilisateur connecté uniquement. */
export async function redeemAction(_prev: RedeemState, fd: FormData): Promise<RedeemState> {
  const user = await requireUser('/account/points');
  const rewardId = fd.get('rewardId');
  if (typeof rewardId !== 'string' || !rewardId) return { status: 'error', message: 'Récompense inconnue.' };
  const r = await redeemReward(user.id, rewardId);
  if (!r.ok) return { status: 'error', message: r.message };
  revalidatePath('/account/points');
  return {
    status: 'ok',
    message:
      r.kind === 'discount'
        ? `Bon obtenu pour ${r.pointsSpent} points : il apparaît dans « Mes bons de réduction ».`
        : `Objet obtenu pour ${r.pointsSpent} points : il est en route vers votre jeu.`,
  };
}
