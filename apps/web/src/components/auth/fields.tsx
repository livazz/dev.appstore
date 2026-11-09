'use client';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import type { InputHTMLAttributes, ReactNode } from 'react';

/** Champ de formulaire accessible : libellé associé, aide, erreur annoncée et reliée via aria-describedby. */
export function Field({
  label,
  name,
  error,
  hint,
  ...input
}: { label: string; name: string; error?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-10 rounded-[var(--radius)] border bg-surface px-3 text-[15px] text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...input}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Message d'erreur global, annoncé aux lecteurs d'écran. */
export function FormError({ message }: { message?: string }) {
  return (
    <div aria-live="assertive" aria-atomic="true">
      {message ? (
        <p role="alert" className="rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Rangée Annuler (violet) + action principale (bleu), comme dans les maquettes. */
export function FormActions({ label, pendingLabel, cancelHref = '/' }: { label: string; pendingLabel: string; cancelHref?: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-2 flex items-center justify-end gap-3">
      <Link
        href={cancelHref}
        className="inline-flex h-10 items-center rounded-[var(--radius)] bg-cancel px-5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cancel"
      >
        Annuler
      </Link>
      <button
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        className="inline-flex h-10 items-center rounded-[var(--radius)] bg-primary px-5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}
