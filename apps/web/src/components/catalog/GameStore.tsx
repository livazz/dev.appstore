'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatMoney, ITEM_TYPES, PERIODS, type Currency } from '@wolleen/core';
import { StorePanel, type PanelItem } from '@/components/store/StorePanel';
import { BuyButton } from '@/components/checkout/BuyButton';
import type { PublicGame, PublicItem } from '@/server/catalog';
import { safeImageUrl } from '@/components/store/style-safety';
import { GameIcon } from './GameCard';

type StoreGame = Omit<PublicGame, 'items'>;

const toPanelItem = (i: PublicItem): PanelItem => ({
  id: i.id,
  title: i.title,
  subtitle: i.subtitle,
  type: i.type,
  period: i.period,
  priceCents: i.priceCents,
  oldPriceCents: i.oldPriceCents,
  models: i.models,
  layout: i.layout,
  style: i.style,
  keywords: i.keywords,
});

/** Boutique publique d'un jeu : StorePanel en lecture + panneau de détail d'article. */
export function GameStore({ game, items, initialItemId }: { game: StoreGame; items: PublicItem[]; initialItemId?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(() => (initialItemId && items.some((i) => i.id === initialItemId) ? initialItemId : null));
  const open = items.find((i) => i.id === openId) ?? null;

  const setUrlItem = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('item', id);
    else url.searchParams.delete('item');
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const select = (item: PanelItem) => {
    setOpenId(item.id);
    setUrlItem(item.id);
  };
  const close = useCallback(() => {
    setOpenId(null);
    setUrlItem(null);
  }, [setUrlItem]);

  return (
    <>
      <StorePanel
        theme={game.theme}
        currency={game.currency}
        bannerUrl={game.bannerUrl}
        items={items.map(toPanelItem)}
        onItemClick={select}
        emptyText="Ce jeu ne propose aucun article pour le moment."
        header={<StoreHeader game={game} />}
      />
      {open && <ItemDetail game={game} item={open} onClose={close} />}
    </>
  );
}

function StoreHeader({ game }: { game: StoreGame }) {
  return (
    <>
      <GameIcon name={game.name} iconUrl={game.iconUrl} size={120} />
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-bold break-words text-ink sm:text-3xl">{game.name}</h1>
        {game.subtitle && <p className="mt-1 text-base font-medium text-ink/80">{game.subtitle}</p>}
        {game.publisherName && <p className="mt-0.5 text-sm font-medium text-ink/65">{game.publisherName}</p>}
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-sm font-bold text-ink">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor">
            <path d="M10 1.5 12.6 7l6 .6-4.5 4 1.3 5.9L10 14.6l-5.4 2.9L5.9 11.6 1.4 7.6l6-.6z" />
          </svg>
          Meilleurs prix qu’en jeu
        </span>
      </div>
    </>
  );
}

function priceLabel(item: PublicItem, currency: Currency) {
  const per = item.type === 'auto_renewable' || item.type === 'non_renewing' ? PERIODS.find((p) => p.value === item.period)?.short ?? '' : '';
  return `${formatMoney(item.priceCents, currency)}${per ? ` ${per}` : ''}`;
}

/** Panneau de détail : tiroir à droite (bureau), feuille du bas (mobile). */
function ItemDetail({ game, item, onClose }: { game: StoreGame; item: PublicItem; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visual, setVisual] = useState(0);
  const models = item.models.flatMap((m) => {
    const imageUrl = safeImageUrl(m.imageUrl);
    return imageUrl ? [{ ...m, imageUrl }] : [];
  });
  const typeLabel = ITEM_TYPES.find((t) => t.value === item.type)?.label ?? item.type;
  const hasOld = item.oldPriceCents != null && item.oldPriceCents > item.priceCents;
  const pct = hasOld ? Math.floor(((item.oldPriceCents! - item.priceCents) * 100) / item.oldPriceCents!) : 0;
  const period = PERIODS.find((p) => p.value === item.period)?.label;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      // Piège de focus : le Tab reste dans le panneau de détail (dialogue modal).
      const focusables = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')];
      if (!focusables.length) return;
      const firstEl = focusables[0]!;
      const lastEl = focusables[focusables.length - 1]!;
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === ref.current)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  useEffect(() => setVisual(0), [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      <button type="button" aria-label="Fermer" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-detail-title"
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[18px] bg-surface shadow-2xl outline-none sm:max-h-none sm:w-[420px] sm:rounded-none"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="truncate text-sm text-ink-2">{game.name}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le détail"
            className="-my-1 grid size-11 flex-none place-items-center rounded-full text-ink-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid aspect-[4/3] place-items-center rounded-[var(--radius)] bg-bg p-4">
            {models[visual]?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={models[visual].imageUrl} alt={models[visual].label || item.title} className="max-h-full max-w-full object-contain" />
            ) : (
              <GameIcon name={game.name} iconUrl={game.iconUrl} size={120} />
            )}
          </div>
          {models.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto" role="tablist" aria-label="Visuels">
              {models.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === visual}
                  aria-label={m.label || `Visuel ${i + 1}`}
                  onClick={() => setVisual(i)}
                  className={`size-14 flex-none rounded-lg border-2 bg-bg p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${i === visual ? 'border-ink' : 'border-transparent'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.imageUrl} alt="" className="size-full object-contain" />
                </button>
              ))}
            </div>
          )}

          <h2 id="item-detail-title" className="mt-5 text-xl font-bold break-words">
            {item.title}
          </h2>
          {item.subtitle && <p className="mt-1 text-ink-2">{item.subtitle}</p>}

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold">{priceLabel(item, game.currency)}</span>
            {hasOld && (
              <>
                <span className="text-ink-2 line-through">{formatMoney(item.oldPriceCents!, game.currency)}</span>
                <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-bold text-[color-mix(in_srgb,var(--ok)_60%,black)]">−{pct} %</span>
              </>
            )}
          </div>

          <dl className="mt-5 divide-y divide-line rounded-[var(--radius)] border border-line text-sm">
            <div className="flex justify-between gap-4 px-3 py-2">
              <dt className="text-ink-2">Type</dt>
              <dd className="text-right font-medium">{typeLabel}</dd>
            </div>
            {(item.type === 'auto_renewable' || item.type === 'non_renewing') && period && (
              <div className="flex justify-between gap-4 px-3 py-2">
                <dt className="text-ink-2">Durée</dt>
                <dd className="text-right font-medium">{period}</dd>
              </div>
            )}
            {item.quantity > 1 && (
              <div className="flex justify-between gap-4 px-3 py-2">
                <dt className="text-ink-2">Quantité</dt>
                <dd className="text-right font-medium">{item.quantity.toLocaleString('fr-FR')}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 px-3 py-2">
              <dt className="text-ink-2">Livraison</dt>
              <dd className="text-right font-medium">Automatique dans le jeu</dd>
            </div>
          </dl>
        </div>

        <div className="flex gap-3 border-t border-line px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-none rounded-[var(--radius)] bg-cancel px-5 font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Annuler
          </button>
          <div className="min-w-0 flex-1">
            <BuyButton gameId={game.id} gameSlug={game.slug} itemId={item.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
