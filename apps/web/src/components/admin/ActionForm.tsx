'use client';

import { useActionState, useId } from 'react';
import type { AdminActionState } from './action-state';

type Action = (prev: AdminActionState, form: FormData) => Promise<AdminActionState>;

const TONES = {
  primary: 'bg-primary text-white hover:opacity-90',
  danger: 'bg-danger text-white hover:opacity-90',
  neutral: 'bg-surface text-ink ring-1 ring-line hover:bg-bg',
} as const;

/**
 * Formulaire d'action d'administration (Server Action + useActionState) : champs cachés, contenu libre,
 * bouton désactivé pendant l'envoi, résultat annoncé aux lecteurs d'écran.
 */
export function ActionForm({
  action,
  hidden,
  submitLabel,
  pendingLabel,
  tone = 'primary',
  confirm,
  children,
  className = '',
}: {
  action: Action;
  hidden: Record<string, string>;
  submitLabel: string;
  pendingLabel: string;
  tone?: keyof typeof TONES;
  /** Demande de confirmation avant l'envoi. */
  confirm?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const resultId = useId();
  return (
    <form
      action={formAction}
      className={`flex flex-col gap-3 ${className}`}
      aria-describedby={state ? resultId : undefined}
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
      <p id={resultId} role={state && !state.ok ? 'alert' : 'status'} className={`text-sm ${state ? (state.ok ? 'text-ok' : 'text-danger') : 'sr-only'}`}>
        {state?.message ?? ''}
      </p>
    </form>
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

export function SelectField({ name, label, options, required }: { name: string; label: string; options: [string, string][]; required?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <select id={id} name={name} required={required} defaultValue="" className={fieldBase}>
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
