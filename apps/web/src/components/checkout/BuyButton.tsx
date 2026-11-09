'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { formatMoney, type Currency } from '@wolleen/core';

/** Réponse de GET /api/checkout?gameId=…&itemId=… */
interface BuyContext {
  signedIn: boolean;
  link: { playerId: string; playerName: string | null } | null;
  item?: { priceCents: number; currency: Currency; title: string } | null;
}

/** Libellé de la case obligatoire (docs/legal/consumer.md § 2.3) — doit rester identique côté serveur. */
const WAIVER_LABEL = 'Je demande la livraison immédiate et renonce à mon droit de rétractation';

/**
 * Bouton « Acheter » d'un article (tâche « payments »).
 * Non connecté → /login?next=… ; compte de jeu non lié → /games/[slug]/link?item=… ;
 * sinon case NON pré-cochée « livraison immédiate / renonciation au droit de rétractation » (obligatoire),
 * bouton « Payer X € » (prix lu en base via GET /api/checkout), puis POST /api/checkout et redirection vers Stripe
 * Checkout (ou /checkout/mock en simulation). Le serveur refuse l'achat si la case n'est pas cochée.
 */
export function BuyButton({ gameId, gameSlug, itemId }: { gameId: string; gameSlug: string; itemId: string }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<BuyContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiver, setWaiver] = useState(false);
  const waiverRef = useRef<HTMLInputElement>(null);
  const waiverId = useId();

  const itemPath = `/games/${encodeURIComponent(gameSlug)}?item=${encodeURIComponent(itemId)}`;
  const linkPath = `/games/${encodeURIComponent(gameSlug)}/link?item=${encodeURIComponent(itemId)}`;
  const loginPath = `/login?next=${encodeURIComponent(itemPath)}`;

  useEffect(() => {
    const ac = new AbortController();
    setCtx(null);
    setWaiver(false);
    fetch(`/api/checkout?gameId=${encodeURIComponent(gameId)}&itemId=${encodeURIComponent(itemId)}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<BuyContext>) : null))
      .then((c) => c && setCtx(c))
      .catch(() => {
        /* le POST gère de toute façon connexion et liaison */
      });
    return () => ac.abort();
  }, [gameId, itemId]);

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
    if (!waiver) {
      setError('Cochez la case de livraison immédiate pour payer.');
      waiverRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, withdrawalWaiver: true }),
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

  // La case et le bouton « Payer » n'apparaissent que si l'achat peut partir (connecté et lié, ou contexte inconnu).
  const canPay = !ctx || (ctx.signedIn && !!ctx.link);
  const price = ctx?.item ? formatMoney(ctx.item.priceCents, ctx.item.currency) : null;
  const label = busy
    ? 'Redirection…'
    : ctx && !ctx.signedIn
      ? 'Se connecter pour acheter'
      : ctx && !ctx.link
        ? 'Lier mon compte et acheter'
        : price
          ? `Payer ${price}`
          : 'Payer';

  return (
    <div className="flex w-full flex-col gap-1.5">
      {canPay && (
        <label htmlFor={waiverId} className="flex cursor-pointer items-start gap-2 text-left text-xs text-ink-2">
          <input
            ref={waiverRef}
            id={waiverId}
            type="checkbox"
            checked={waiver}
            onChange={(e) => {
              setWaiver(e.target.checked);
              if (e.target.checked) setError(null);
            }}
            required
            aria-required="true"
            className="mt-0.5 h-4 w-4 flex-none accent-[var(--primary)]"
          />
          <span>{WAIVER_LABEL}.</span>
        </label>
      )}
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
