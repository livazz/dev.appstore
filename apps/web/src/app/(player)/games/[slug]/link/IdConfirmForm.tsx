'use client';

import { useActionState, useState } from 'react';
import { confirmPlayerAction, lookupPlayerAction, type ConfirmFormState, type LookupFormState } from './actions';

const initialLookup: LookupFormState = {};
const initialConfirm: ConfirmFormState = {};

export function IdConfirmForm({ slug, item }: { slug: string; item?: string }) {
  const [lookup, lookupAction, searching] = useActionState(lookupPlayerAction, initialLookup);
  const [confirm, confirmAction, confirming] = useActionState(confirmPlayerAction, initialConfirm);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const candidate = lookup.candidate && lookup.candidate.attemptId !== dismissed ? lookup.candidate : null;

  if (candidate) {
    const { player } = candidate;
    const confirmError = confirm.attemptId === candidate.attemptId ? confirm.error : undefined;
    return (
      <div className="mt-4 rounded-lg border border-line bg-bg p-4">
        <div className="flex items-center gap-3">
          {player.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL fournie par le studio, non optimisable
            <img src={player.avatar_url} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-full border border-line object-cover" />
          ) : (
            <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-ink">
              {player.display_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-base text-ink">
              Est-ce bien vous : <strong className="font-semibold">{player.display_name}</strong>
              {player.level !== undefined && <>, niveau {player.level}</>} ?
            </p>
            <p className="truncate text-xs text-ink-3">
              ID joueur : <span className="font-mono">{player.player_id}</span>
            </p>
          </div>
        </div>
        {confirmError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {confirmError}
          </p>
        )}
        <form action={confirmAction} className="mt-4 flex justify-end gap-3">
          <input type="hidden" name="slug" value={slug} />
          {item && <input type="hidden" name="item" value={item} />}
          <input type="hidden" name="attemptId" value={candidate.attemptId} />
          <button
            type="button"
            onClick={() => setDismissed(candidate.attemptId)}
            className="rounded-lg bg-cancel px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={confirming}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {confirming ? 'Liaison…' : "Oui, c'est moi"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={lookupAction} className="mt-4">
      <input type="hidden" name="slug" value={slug} />
      <label htmlFor="player-id" className="mb-1.5 block text-sm font-medium text-ink-2">
        Identifiant joueur
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="player-id"
          name="playerId"
          required
          maxLength={64}
          defaultValue={lookup.playerId}
          placeholder="ex. #2PP8QL9"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={lookup.error ? true : undefined}
          aria-describedby={lookup.error ? 'player-id-error' : undefined}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 font-mono placeholder:text-ink-3/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {searching ? 'Recherche…' : 'Rechercher'}
        </button>
      </div>
      {lookup.error && (
        <p id="player-id-error" role="alert" className="mt-2 text-sm text-danger">
          {lookup.error}
        </p>
      )}
    </form>
  );
}
