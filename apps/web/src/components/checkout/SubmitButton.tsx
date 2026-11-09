'use client';

import { useFormStatus } from 'react-dom';

/** Bouton de formulaire (server action) désactivé pendant l'envoi — évite les doubles soumissions. */
export function SubmitButton({ children, pendingLabel, className }: { children: React.ReactNode; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} disabled:cursor-wait disabled:opacity-70`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
