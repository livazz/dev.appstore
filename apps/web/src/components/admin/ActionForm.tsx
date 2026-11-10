'use client';

import { useId } from 'react';
import type { AdminActionState } from './action-state';

const TONES = {
  primary: 'bg-primary text-white hover:opacity-90',
  danger: 'bg-danger text-white hover:opacity-90',
  neutral: 'bg-surface text-ink ring-1 ring-line hover:bg-bg',
} as const;

/**
 * Formulaire d'action d'administration. L'état (`useActionState`) appartient au composant parent, qui reste monté :
 * après succès, le statut de la cible change et le formulaire peut être remplacé par un autre, sans perdre le résultat
 * (affiché par `ActionResult`). Bouton désactivé pendant l'envoi, confirmation facultative.
 */
export function ActionForm({
  formAction,
  pending,
  hidden,
  submitLabel,
  pendingLabel,
  tone = 'primary',
  confirm,
  children,
  className = '',
}: {
  formAction: (form: FormData) => void;
  pending: boolean;
  hidden: Record<string, string>;
  submitLabel: string;
  pendingLabel: string;
  tone?: keyof typeof TONES;
  /** Demande de confirmation avant l'envoi. */
  confirm?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      action={formAction}
      className={`flex flex-col gap-3 ${className}`}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70 ${TONES[tone]}`}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Résultat d'une action, annoncé aux lecteurs d'écran (zone toujours présente pour que l'annonce soit lue). */
export function ActionResult({ state }: { state: AdminActionState }) {
  return (
    <p role={state && !state.ok ? 'alert' : 'status'} className={`text-sm ${state ? (state.ok ? 'rounded-lg bg-ok/10 p-2 text-ok' : 'rounded-lg bg-danger/10 p-2 text-danger') : 'sr-only'}`}>
      {state?.message ?? ''}
    </p>
  );
}

const fieldBase =
  'w-full rounded-[var(--radius)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export function TextAreaField({
  name,
  label,
  hint,
  required,
  minLength,
  maxLength = 2000,
  placeholder,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger"> *</span> : <span className="font-normal text-ink-3"> (facultatif)</span>}
      </label>
      <textarea
        id={id}
        name={name}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        rows={3}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={fieldBase}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  options: [string, string][];
  required?: boolean;
  defaultValue?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <select id={id} name={name} required={required} defaultValue={defaultValue && options.some(([v]) => v === defaultValue) ? defaultValue : ''} className={fieldBase}>
        <option value="" disabled>
          Choisir…
        </option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
