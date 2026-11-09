'use client';

import { retryDeliveryAction } from '@/app/admin/actions';
import { ActionForm } from './ActionForm';

export function RetryDeliveryForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm
      action={retryDeliveryAction}
      hidden={{ orderId }}
      submitLabel="Relancer la livraison"
      pendingLabel="Relance en cours…"
      confirm="Relancer la livraison maintenant ? Le jeu dédoublonne grâce à delivery_id : aucun double crédit."
    >
      <p className="text-xs text-ink-2">Nouvelle tentative immédiate (webhook signé) ; le jeu reçoit le même delivery_id et ne crédite pas deux fois.</p>
    </ActionForm>
  );
}
