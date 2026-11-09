'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { redeemAction, type RedeemState } from './actions';

const initial: RedeemState = { status: 'idle', message: '' };

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-2"
    >
      {pending ? 'Échange…' : label}
    </button>
  );
}

/** Bouton « Échanger » d'une récompense (confirmation explicite, message de résultat accessible). */
export function RedeemButton({ rewardId, title, pointsCost, blockedLabel }: { rewardId: string; title: string; pointsCost: number; blockedLabel: string | null }) {
  const [state, action] = useActionState(redeemAction, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Échanger ${pointsCost} points contre « ${title} » ? Les points échangés ne sont pas rendus.`)) e.preventDefault();
      }}
      className="mt-3"
    >
      <input type="hidden" name="rewardId" value={rewardId} />
      <Submit label={blockedLabel ?? `Échanger ${pointsCost} pts`} disabled={blockedLabel !== null} />
      <p role="status" aria-live="polite" className={`mt-2 text-xs ${state.status === 'error' ? 'text-danger' : 'text-ok'}`}>
        {state.message}
      </p>
    </form>
  );
}
