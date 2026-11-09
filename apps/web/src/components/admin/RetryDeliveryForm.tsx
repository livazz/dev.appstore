'use client';

import { useActionState } from 'react';
import { retryDeliveryAction } from '@/app/admin/actions';
import { ActionForm, ActionResult } from './ActionForm';

/** Relance manuelle ; reste monté quand la livraison aboutit (le bouton disparaît, le résultat reste affiché). */
export function RetryDeliveryForm({ orderId, retryable }: { orderId: string; retryable: boolean }) {
  const [state, formAction, pending] = useActionState(retryDeliveryAction, null);
  return (
    <div className="flex flex-col gap-3">
      <ActionResult state={state} />
      {retryable ? (
        <ActionForm
          formAction={formAction}
          pending={pending}
          hidden={{ orderId }}
          submitLabel="Relancer la livraison"
          pendingLabel="Relance en cours…"
          confirm="Relancer la livraison maintenant ? Le jeu dédoublonne grâce à delivery_id : aucun double crédit."
        >
          <p className="text-xs text-ink-2">Nouvelle tentative immédiate (webhook signé) ; le jeu reçoit le même delivery_id et ne crédite pas deux fois.</p>
        </ActionForm>
      ) : state ? null : (
        <p className="text-xs text-ink-2">Livraison aboutie : rien à relancer.</p>
      )}
    </div>
  );
}
