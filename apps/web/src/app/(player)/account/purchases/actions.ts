'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/session';
import { WithdrawalError, withdrawOrder } from '@/server/withdrawal';

/**
 * « Confirmer la rétractation » (2e étape du bouton de rétractation, /account/purchases?withdraw=<commande>).
 * Seul l'acheteur connecté peut se rétracter de SA commande ; l'éligibilité est revérifiée côté serveur.
 */
export async function confirmWithdrawal(formData: FormData) {
  const user = await requireUser('/account/purchases');
  const orderId = String(formData.get('orderId') ?? '');
  let outcome: string;
  try {
    await withdrawOrder(user.id, orderId);
    outcome = `withdrawn=${encodeURIComponent(orderId)}`;
  } catch (e) {
    if (!(e instanceof WithdrawalError)) throw e;
    outcome = `withdrawal_error=${e.code}`;
  }
  revalidatePath('/account/purchases');
  redirect(`/account/purchases?${outcome}`);
}
