'use client';

import { useActionState } from 'react';
import { redeemCodeAction, type CodeFormState } from './actions';

const initial: CodeFormState = {};

export function CodeForm({ slug, item }: { slug: string; item?: string }) {
  const [state, formAction, pending] = useActionState(redeemCodeAction, initial);
  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="slug" value={slug} />
      {item && <input type="hidden" name="item" value={item} />}
      <label htmlFor="link-code" className="mb-1.5 block text-sm font-medium text-ink-2">
        Code de liaison
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="link-code"
          name="code"
          required
          defaultValue={state.code}
          maxLength={12}
          placeholder="K7QF-M2XA"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'link-code-error' : undefined}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-lg uppercase tracking-[0.2em] placeholder:text-ink-3/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {pending ? 'Vérification…' : 'Lier mon compte'}
        </button>
      </div>
      {state.confirm && (
        <div role="alertdialog" aria-labelledby="link-confirm-title" className="mt-4 rounded-lg border border-line bg-surface p-4 text-sm">
          <p id="link-confirm-title" className="font-semibold text-ink">
            Vos achats seront livrés au compte de jeu <span className="font-mono">{state.confirm.playerId}</span>
          </p>
          {state.confirm.playerName && (
            <p className="mt-1 text-ink-2">
              Nom déclaré par le jeu (non vérifié) : <strong>{state.confirm.playerName}</strong>
            </p>
          )}
          <p className="mt-2 text-ink-3">
            Ce code a été demandé depuis le jeu, sans vérification par le serveur du studio. Ne confirmez que s’il
            s’affiche dans <strong>votre</strong> jeu : n’entrez jamais un code transmis par quelqu’un d’autre.
          </p>
          <button
            type="submit"
            name="confirm"
            value="1"
            disabled={pending}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            Oui, c’est mon compte de jeu
          </button>
        </div>
      )}
      {state.error && (
        <p id="link-code-error" role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
