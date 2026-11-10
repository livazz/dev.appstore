import Link from 'next/link';
import { formatMoney } from '@devappstore/core';
import type { RankedEntry } from '@/server/rankings-logic';
import type { RankedGame, RankedItem } from '@/server/rankings';
import { safeImageUrl } from '@/components/store/style-safety';
import { GameIcon } from './GameCard';

/** Évolution du rang : ▲ 3, ▼ 2, = , Nouveau. */
export function TrendBadge({ r }: { r: Pick<RankedEntry<unknown>, 'trend' | 'delta'> }) {
  if (r.trend === 'new')
    return <span className="rounded-full bg-brand/40 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink uppercase">Nouveau</span>;
  if (r.trend === 'up')
    return (
      <span className="text-xs font-bold text-[color-mix(in_srgb,var(--ok)_75%,black)]" aria-label={`En hausse de ${r.delta} place${r.delta > 1 ? 's' : ''}`}>
        ▲ {r.delta}
      </span>
    );
  if (r.trend === 'down')
    return (
      <span className="text-xs font-bold text-danger" aria-label={`En baisse de ${-r.delta} place${r.delta < -1 ? 's' : ''}`}>
        ▼ {-r.delta}
      </span>
    );
  return (
    <span className="text-xs text-ink-3" aria-label="Stable">
      =
    </span>
  );
}

/** Note moyenne : ★ 4,5 (128). */
export function RatingBadge({ rating }: { rating: RankedGame['rating'] }) {
  if (!rating) return null;
  const avg = rating.average.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-ink-2" aria-label={`Note ${avg} sur 5, ${rating.count} avis`}>
      <span aria-hidden="true" className="text-warn">
        ★
      </span>
      {avg}
      <span className="text-ink-3">({rating.count})</span>
    </span>
  );
}

function RankNumber({ rank, compact }: { rank: number; compact?: boolean }) {
  const podium = rank <= 3;
  return (
    <span
      className={`grid flex-none place-items-center font-black tabular-nums ${compact ? 'w-7 text-base' : 'w-9 text-lg sm:w-10 sm:text-xl'} ${podium ? 'text-ink' : 'text-ink-3'}`}
      aria-label={`Rang ${rank}`}
    >
      {rank}
    </span>
  );
}

/** Ligne d'un jeu classé. `compact` : Top 10 de l'accueil. */
export function RankedGameRow({ r, compact = false }: { r: RankedEntry<RankedGame>; compact?: boolean }) {
  const g = r.entry;
  return (
    <Link
      href={`/games/${g.slug}`}
      className="flex min-w-0 items-center gap-3 rounded-[var(--radius)] px-2 py-2 transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <RankNumber rank={r.rank} compact={compact} />
      <GameIcon name={g.name} iconUrl={g.iconUrl} size={compact ? 48 : 60} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{g.name}</p>
        <p className="truncate text-sm text-ink-2">{g.publisherName || '—'}</p>
        <p className="flex min-w-0 items-center gap-2 text-xs text-ink-2">
          <span className="truncate">{g.category}</span>
          <RatingBadge rating={g.rating} />
        </p>
      </div>
      <span className="flex w-14 flex-none justify-end">
        <TrendBadge r={r} />
      </span>
    </Link>
  );
}

/** Ligne d'un article classé (Top achats). */
export function RankedItemRow({ r }: { r: RankedEntry<RankedItem> }) {
  const it = r.entry;
  const img = safeImageUrl(it.imageUrl);
  return (
    <Link
      href={`/games/${it.game.slug}?item=${encodeURIComponent(it.id)}`}
      className="flex min-w-0 items-center gap-3 rounded-[var(--radius)] px-2 py-2 transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <RankNumber rank={r.rank} />
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" loading="lazy" className="size-[60px] flex-none rounded-[14px] bg-bg object-contain p-1.5" />
      ) : (
        <GameIcon name={it.game.name} iconUrl={it.game.iconUrl} size={60} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{it.name}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2">
          <GameIcon name={it.game.name} iconUrl={it.game.iconUrl} size={16} />
          <span className="truncate">{it.game.name}</span>
        </p>
        <p className="truncate text-xs text-ink-2">
          {it.game.category} · {it.game.platform === 'pc' ? 'PC' : 'Mobile'}
        </p>
      </div>
      <div className="flex flex-none flex-col items-end gap-0.5">
        <span className="font-bold">{formatMoney(it.priceCents, it.game.currency)}</span>
        {it.oldPriceCents != null && it.discountPct > 0 && (
          <span className="flex items-center gap-1 text-xs">
            <s className="text-ink-2">{formatMoney(it.oldPriceCents, it.game.currency)}</s>
            <span className="font-bold text-[color-mix(in_srgb,var(--ok)_60%,black)]">−{it.discountPct} %</span>
          </span>
        )}
        <TrendBadge r={r} />
      </div>
    </Link>
  );
}
