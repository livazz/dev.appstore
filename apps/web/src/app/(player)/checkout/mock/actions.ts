'use server';

import { redirect } from 'next/navigation';
import { payMockOrder, SimulationError, successPath } from '@/server/payments';
import { requireUser } from '@/server/session';

/** Bouton « Payer » du mode simulation → markOrderPaid (refusé en production ou si Stripe est configuré). */
export async function payMockOrderAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get('order') ?? '');
  const user = await requireUser(`/checkout/mock?order=${encodeURIComponent(orderId)}`);
  try {
    await payMockOrder(user.id, orderId);
  } catch (e) {
    if (e instanceof SimulationError) redirect(`/checkout/mock?order=${encodeURIComponent(orderId)}&error=${e.code}`);
    throw e;
  }
  redirect(successPath(orderId));
}
