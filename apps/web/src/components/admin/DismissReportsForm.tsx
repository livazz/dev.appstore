'use client';

import { useActionState } from 'react';
import { dismissReportsAction } from '@/app/admin/reports/actions';
import { REASON_MIN } from '@/server/admin-logic';
import { ActionForm, ActionResult, TextAreaField } from './ActionForm';

/** « Classer sans suite » les signalements affichés d'un jeu, avec le motif communiqué aux signalants. */
export function DismissReportsForm({ gameId, reportIds }: { gameId: string; reportIds: string[] }) {
  const [state, formAction, pending] = useActionState(dismissReportsAction, null);
  return (
    <div className="flex flex-col gap-3">
      <ActionResult state={state} />
      {state?.ok ? null : (
        <ActionForm
          formAction={formAction}
          pending={pending}
          hidden={{ gameId, reportIds: reportIds.join(',') }}
          tone="neutral"
          submitLabel="Classer sans suite"
          pendingLabel="Classement…"
          confirm={`Classer sans suite ${reportIds.length > 1 ? `ces ${reportIds.length} signalements` : 'ce signalement'} ? Chaque signalant recevra le motif par e-mail.`}
        >
          <TextAreaField
            name="reason"
            label="Motif communiqué aux signalants"
            required
            minLength={REASON_MIN}
            hint={`Au moins ${REASON_MIN} caractères. Le studio n’est pas prévenu.`}
          />
        </ActionForm>
      )}
    </div>
  );
}
