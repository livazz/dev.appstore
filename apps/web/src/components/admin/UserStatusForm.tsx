'use client';

import { disableUserAction, enableUserAction } from '@/app/admin/actions';
import { REASON_MIN } from '@/server/admin-logic';
import { ActionForm, TextAreaField } from './ActionForm';

/** Désactivation (motif obligatoire) ou réactivation d'un compte. */
export function UserStatusForm({ userId, disabled }: { userId: string; disabled: boolean }) {
  if (disabled) {
    return (
      <ActionForm action={enableUserAction} hidden={{ userId }} submitLabel="Réactiver le compte" pendingLabel="Réactivation…" confirm="Réactiver ce compte ?">
        <TextAreaField name="note" label="Note interne" />
      </ActionForm>
    );
  }
  return (
    <ActionForm
      action={disableUserAction}
      hidden={{ userId }}
      tone="danger"
      submitLabel="Désactiver le compte"
      pendingLabel="Désactivation…"
      confirm="Désactiver ce compte ? Toutes ses sessions seront fermées et il ne pourra plus se connecter."
    >
      <p className="text-xs text-ink-2">Toutes les sessions sont fermées immédiatement ; la connexion est refusée tant que le compte est désactivé.</p>
      <TextAreaField name="reason" label="Motif (interne)" required minLength={REASON_MIN} hint={`Au moins ${REASON_MIN} caractères, conservés dans le journal d’audit.`} />
    </ActionForm>
  );
}
