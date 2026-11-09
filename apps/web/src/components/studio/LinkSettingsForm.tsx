'use client';

import { useActionState, useState } from 'react';
import type { LinkSettingsState, LinkSettingsValues } from './link-settings-actions';

type Action = (prev: LinkSettingsState, fd: FormData) => Promise<LinkSettingsState>;

const initialState: LinkSettingsState = { version: 0 };

export function LinkSettingsForm({ action, initial }: { action: Action; initial: LinkSettingsValues }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="mt-5">
      {/* Remonté à chaque envoi pour repartir des valeurs enregistrées (ou saisies, en cas d'erreur). */}
      <Fields key={state.version} values={state.values ?? initial} />
      <div className="mt-5 flex items-center justify-end gap-3">
        {state.error && (
          <p role="alert" className="mr-auto text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.ok && !pending && (
          <p role="status" className="mr-auto text-sm text-ok">
            Réglages enregistrés.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function Fields({ values }: { values: LinkSettingsValues }) {
  const [idConfirm, setIdConfirm] = useState(values.methods.includes('id_confirm'));
  return (
    <>
      <fieldset>
        <legend className="text-sm font-medium text-ink">Méthodes proposées aux joueurs</legend>
        <div className="mt-2 space-y-2">
          <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 transition hover:bg-bg">
            <input type="checkbox" name="methods" value="code" defaultChecked={values.methods.includes('code')} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
            <span>
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                Code affiché dans le jeu
                <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs text-ok">vérifié · recommandé</span>
              </span>
              <span className="mt-0.5 block text-sm text-ink-2">
                Le jeu appelle <code className="font-mono text-xs">POST /api/v1/link-codes</code> et affiche le code (valable 10 min) ; le
                joueur le saisit sur Dev AppStore.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 transition hover:bg-bg">
            <input
              type="checkbox"
              name="methods"
              value="id_confirm"
              checked={idConfirm}
              onChange={(e) => setIdConfirm(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                Identifiant joueur + confirmation
                <span className="rounded-full bg-ink-3/10 px-2 py-0.5 text-xs text-ink-2">déclaratif</span>
              </span>
              <span className="mt-0.5 block text-sm text-ink-2">
                Le joueur saisit son identifiant ; Dev AppStore interroge votre serveur puis lui demande « Est-ce bien vous ? ».
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <label htmlFor="player-lookup-url" className="mt-5 block text-sm font-medium text-ink">
        URL de recherche du joueur {idConfirm ? '' : <span className="font-normal text-ink-3">(facultative)</span>}
      </label>
      <input
        id="player-lookup-url"
        name="playerLookupUrl"
        type="text"
        inputMode="url"
        defaultValue={values.playerLookupUrl}
        required={idConfirm}
        maxLength={2048}
        placeholder="https://api.monjeu.com/devappstore/players/{player_id}"
        spellCheck={false}
        className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm placeholder:text-ink-3/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <p className="mt-1.5 text-xs text-ink-3">
        <code className="font-mono">{'{player_id}'}</code> est remplacé par l&apos;identifiant saisi (encodé). Requête GET signée
        (en-tête <code className="font-mono">DevAppStore-Signature</code>), délai maximal 5 s.
      </p>
    </>
  );
}
