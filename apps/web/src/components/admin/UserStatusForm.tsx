'use client';

import { useActionState } from 'react';
import { userStatusAction } from '@/app/admin/actions';
import { REASON_MIN } from '@/server/admin-logic';
import { ActionForm, ActionResult, TextAreaField } from './ActionForm';

/** Désactivation (motif obligatoire) ou réactivation d'un compte. */
export function UserStatusForm({ userId, disabled }: { userId: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(userStatusAction, null);
  return (
    <div className="flex flex-col gap-3">
      <ActionResult state={state} />
      {disabled ? (
        <ActionForm
          key="enable"
          formAction={formAction}
          pending={pending}
          hidden={{ userId, intent: 'enable' }}
          submitLabel="Réactiver le compte"
          pendingLabel="Réactivation…"
          confirm="Réactiver ce compte ?"
        >
          <TextAreaField name="note" label="Note interne" />
        </ActionForm>
      ) : (
        <ActionForm
          key="disable"
          formAction={formAction}
          pending={pending}
          hidden={{ userId, intent: 'disable' }}
          tone="danger"
          submitLabel="Désactiver le compte"
          pendingLabel="Désactivation…"
          confirm="Désactiver ce compte ? Toutes ses sessions seront fermées et il ne pourra plus se connecter."
        >
          <p className="text-xs text-ink-2">Toutes les sessions sont fermées immédiatement ; la connexion est refusée tant que le compte est désactivé.</p>
          <TextAreaField name="reason" label="Motif (interne)" required minLength={REASON_MIN} hint={`Au moins ${REASON_MIN} caractères, conservés dans le journal d’audit.`} />
        </ActionForm>
      )}
    </div>
  );
}
