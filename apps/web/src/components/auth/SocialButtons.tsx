'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';

const LABELS = { google: 'Continuer avec Google', apple: 'Continuer avec Apple' } as const;
export type SocialProvider = keyof typeof LABELS;

/** Boutons de connexion Google / Apple — affichés seulement pour les fournisseurs configurés côté serveur. */
export function SocialButtons({ providers, next }: { providers: SocialProvider[]; next: string }) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (providers.length === 0) return null;

  async function go(provider: SocialProvider) {
    setBusy(provider);
    setError(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: next, errorCallbackURL: '/login?error=social' });
    if (error) {
      setError('La connexion a échoué. Réessayez ou utilisez votre e-mail.');
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => go(p)}
          disabled={busy !== null}
          className={`inline-flex h-10 items-center justify-center rounded-[var(--radius)] border text-sm font-semibold transition hover:opacity-90 disabled:opacity-60 ${
            p === 'apple' ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink'
          }`}
        >
          {busy === p ? 'Redirection…' : LABELS[p]}
        </button>
      ))}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="my-2 flex items-center gap-3 text-xs text-ink-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        ou
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
