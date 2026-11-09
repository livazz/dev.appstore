'use client';

import { useActionState } from 'react';
import type { GameStatus } from '@wolleen/core';
import { moderateGameAction } from '@/app/admin/actions';
import { REASON_MIN, SUSPENSION_GROUNDS } from '@/server/admin-logic';
import { ActionForm, ActionResult, SelectField, TextAreaField } from './ActionForm';

/**
 * Actions de modération d'un jeu, selon son statut. L'état de l'action appartient au panneau (qui reste monté) :
 * après succès, le statut change et le formulaire utilisé est remplacé par celui du nouveau statut, le résultat reste.
 */
export function ModerationPanel({ gameId, status, canModerate }: { gameId: string; status: GameStatus; canModerate: boolean }) {
  const [state, formAction, pending] = useActionState(moderateGameAction, null);
  if (!canModerate) return <p className="text-sm text-ink-2">Votre rôle permet de consulter ce jeu, pas de le modérer.</p>;
  const common = { formAction, pending };
  return (
    <div className="flex flex-col gap-6">
      <ActionResult state={state} />

      {status === 'review' ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Approuver la revue</h3>
          <ActionForm key="approve" {...common} hidden={{ gameId, intent: 'approve' }} submitLabel="Approuver et mettre en ligne" pendingLabel="Approbation…">
            <TextAreaField name="note" label="Note au studio" />
          </ActionForm>
        </div>
      ) : null}

      {status === 'suspended' ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Réactiver</h3>
          <ActionForm
            key="reactivate"
            {...common}
            hidden={{ gameId, intent: 'reactivate' }}
            submitLabel="Réactiver le jeu"
            pendingLabel="Réactivation…"
            confirm="Réactiver ce jeu ? Sa boutique redevient visible et les achats sont rouverts."
          >
            <TextAreaField name="note" label="Note au studio" />
          </ActionForm>
        </div>
      ) : (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Suspendre</h3>
          <p className="mb-3 text-xs text-ink-2">
            La boutique devient invisible et les achats sont bloqués. Le fondement et le motif sont communiqués au studio (règlement P2B), avec la voie de
            contestation : soyez précis et factuel.
          </p>
          <ActionForm
            key="suspend"
            {...common}
            hidden={{ gameId, intent: 'suspend' }}
            tone="danger"
            submitLabel="Suspendre le jeu"
            pendingLabel="Suspension…"
            confirm="Suspendre ce jeu ? Le studio recevra le motif par e-mail."
          >
            <SelectField name="ground" label="Fondement" required options={Object.entries(SUSPENSION_GROUNDS)} />
            <TextAreaField
              name="reason"
              label="Motif communiqué au studio"
              required
              minLength={REASON_MIN}
              hint={`Au moins ${REASON_MIN} caractères : faits constatés, dates, éléments concernés, et ce que le studio doit corriger.`}
            />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
