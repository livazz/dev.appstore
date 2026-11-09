'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Réponse de GET /api/checkout?gameId=… */
interface BuyContext {
  signedIn: boolean;
  link: { playerId: string; playerName: string | null } | null;
}

/**
 * Bouton « Acheter » d'un article (tâche « payments »).
 * Non connecté → /login?next=… ; compte de jeu non lié → /games/[slug]/link?item=… ;
 * sinon POST /api/checkout puis redirection vers Stripe Checkout (ou /checkout/mock en simulation).
 */
export function BuyButton({ gameId, gameSlug, itemId }: { gameId: string; gameSlug: string; itemId: string }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<BuyContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemPath = `/games/${encodeURIComponent(gameSlug)}?item=${encodeURIComponent(itemId)}`;
  const linkPath = `/games/${encodeURIComponent(gameSlug)}/link?item=${encodeURIComponent(itemId)}`;
  const loginPath = `/login?next=${encodeURIComponent(itemPath)}`;

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/checkout?gameId=${encodeURIComponent(gameId)}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<BuyContext>) : null))
      .then((c) => c && setCtx(c))
      .catch(() => {
        /* le POST gère de toute façon connexion et liaison */
      });
    return () => ac.abort();
  }, [gameId]);

  // Retour arrière depuis Stripe (page restaurée du cache) : réactive le bouton.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setBusy(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  async function buy() {
    setError(null);
    if (ctx && !ctx.signedIn) return router.push(loginPath);
    if (ctx && !ctx.link) return router.push(linkPath);
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; redirect?: string; error?: { message?: string } };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      if (data.redirect?.startsWith('/')) {
        router.push(data.redirect);
        setBusy(false);
        return;
      }
      setError(data.error?.message ?? 'Le paiement n’a pas pu démarrer. Réessayez.');
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau puis réessayez.');
    }
    setBusy(false);
  }

  const label = busy
    ? 'Redirection…'
    : ctx && !ctx.signedIn
      ? 'Se connecter pour acheter'
      : ctx && !ctx.link
        ? 'Lier mon compte et acheter'
        : 'Acheter';

  return (
    <div className="flex w-full flex-col gap-1.5">
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary px-6 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70"
      >
        {busy && (
          <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {label}
      </button>

      <p className="min-h-4 text-center text-xs text-balance text-ink-2" aria-live="polite">
        {ctx?.link ? (
          <>
            Achat pour le joueur{' '}
            <strong className="font-semibold break-all text-ink" title={`ID joueur : ${ctx.link.playerId}`}>
              {ctx.link.playerName || ctx.link.playerId}
            </strong>
            {' · '}
            <Link href={linkPath} className="text-primary hover:underline">
              Changer
            </Link>
          </>
        ) : ctx?.signedIn ? (
          'Liez votre compte de jeu pour recevoir l’achat.'
        ) : ctx ? (
          'Connectez-vous pour acheter.'
        ) : null}
      </p>

      {error && (
        <p role="alert" className="text-center text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
