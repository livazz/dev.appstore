'use client';

import { useActionState } from 'react';
import { ActionForm, ActionResult } from '@/components/admin/ActionForm';
import type { AdminActionState } from '@/components/admin/action-state';
import { moderateReviewAction } from '@/app/admin/reviews/actions';

/** Bouton « Masquer » / « Réafficher » d'un avis (back-office), avec motif facultatif pour le masquage. */
export function ReviewModerationForm({ reviewId, status }: { reviewId: string; status: 'visible' | 'hidden' }) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(moderateReviewAction, null);
  // Statut affiché : celui renvoyé par la dernière action réussie, sinon celui de la page.
  const current = state?.ok ? (state.message === 'Avis masqué.' ? 'hidden' : state.message === 'Avis réaffiché.' ? 'visible' : status) : status;
  const next = current === 'hidden' ? 'visible' : 'hidden';
  return (
    <div className="flex flex-col gap-2">
      <ActionForm
        formAction={formAction}
        pending={pending}
        hidden={{ reviewId, status: next }}
        submitLabel={next === 'hidden' ? 'Masquer' : 'Réafficher'}
        pendingLabel="Enregistrement…"
        tone={next === 'hidden' ? 'danger' : 'neutral'}
        confirm={next === 'hidden' ? 'Masquer cet avis pour tous les joueurs ?' : undefined}
      >
        {next === 'hidden' && (
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Motif (facultatif, journalisé)
            <input name="reason" maxLength={500} className="rounded-[var(--radius)] border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
          </label>
        )}
      </ActionForm>
      <ActionResult state={state} />
    </div>
  );
}
