'use client';

import { useId, useState } from 'react';
import {
  FIELD_MAX_LENGTH,
  WITHDRAWAL_FIELD_LABELS,
  buildWithdrawalMailto,
  buildWithdrawalText,
  type WithdrawalFields,
} from '@/lib/withdrawal-form';

const FIELDS: { key: keyof WithdrawalFields; type?: string; autoComplete?: string; hint?: string }[] = [
  { key: 'item', hint: 'Ex. « Crystal Quest — 500 gemmes »' },
  { key: 'orderId', hint: 'Indiqué dans l’e-mail de confirmation et dans « Mes achats »' },
  { key: 'orderedAt', hint: 'Ex. 9 novembre 2026' },
  { key: 'name', autoComplete: 'name' },
  { key: 'address', autoComplete: 'street-address' },
  { key: 'email', type: 'email', autoComplete: 'email' },
  { key: 'date', hint: 'Date d’envoi du formulaire' },
];

/**
 * Formulaire type de rétractation, à remplir localement puis à copier, envoyer par e-mail ou imprimer.
 * Rien n'est transmis au serveur depuis cette page : la fonction de rétractation en ligne est le bouton
 * « Me rétracter » de « Mes achats ».
 */
export function WithdrawalForm() {
  const [fields, setFields] = useState<WithdrawalFields>({});
  const [status, setStatus] = useState('');
  const id = useId();
  const text = buildWithdrawalText(fields);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Texte copié dans le presse-papiers.');
    } catch {
      setStatus('Copie impossible : sélectionnez le texte de l’aperçu pour le copier.');
    }
  }

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <form className="space-y-3 print:hidden" onSubmit={(e) => e.preventDefault()} aria-describedby={`${id}-info`}>
        <p id={`${id}-info`} className="!mt-0 text-sm text-ink-2">
          Facultatif : remplissez les champs pour préparer votre formulaire. Les informations restent dans votre navigateur.
        </p>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`${id}-${f.key}`} className="block text-sm font-medium text-ink">
              {WITHDRAWAL_FIELD_LABELS[f.key]}
            </label>
            <input
              id={`${id}-${f.key}`}
              type={f.type ?? 'text'}
              autoComplete={f.autoComplete ?? 'off'}
              maxLength={FIELD_MAX_LENGTH}
              value={fields[f.key] ?? ''}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              aria-describedby={f.hint ? `${id}-${f.key}-hint` : undefined}
              className="mt-1 w-full rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary sm:text-sm"
            />
            {f.hint ? (
              <p id={`${id}-${f.key}-hint`} className="!mt-1 text-xs text-ink-3">
                {f.hint}
              </p>
            ) : null}
          </div>
        ))}
      </form>

      <div className="min-w-0">
        <h3 className="!mt-0 text-sm font-semibold text-ink print:hidden">Aperçu</h3>
        <pre
          aria-label="Aperçu du formulaire de rétractation"
          tabIndex={0}
          className="mt-2 whitespace-pre-wrap break-words rounded-[var(--radius)] border border-line bg-bg p-4 font-sans text-sm leading-6 text-ink [overflow-wrap:anywhere] print:border-0 print:bg-transparent print:p-0 print:text-base"
        >
          {text}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={copy}
            className="rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Copier le texte
          </button>
          <a
            href={buildWithdrawalMailto(fields)}
            className="rounded-[var(--radius)] border border-line bg-surface px-4 py-2 text-sm font-semibold !text-ink !no-underline hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Préparer un e-mail
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-[var(--radius)] border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Imprimer
          </button>
        </div>
        <p role="status" aria-live="polite" className="!mt-2 min-h-5 text-sm text-ok">
          {status}
        </p>
      </div>
    </div>
  );
}
