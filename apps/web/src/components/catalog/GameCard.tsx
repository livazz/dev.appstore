import Link from 'next/link';
import type { CatalogGame } from '@/server/catalog';
import { safeImageUrl } from '@/components/store/style-safety';

/** Icône carrée d'un jeu (initiale sur fond jaune si pas d'icône). */
export function GameIcon({ name, iconUrl, size }: { name: string; iconUrl: string | null; size: number }) {
  const radius = Math.round(size * 0.22);
  const src = safeImageUrl(iconUrl);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="flex-none border border-black/5 bg-surface object-cover"
      style={{ width: size, height: size, borderRadius: radius }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="grid flex-none place-items-center bg-brand font-black text-ink"
      style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function DiscountBadge({ pct, upTo = true, className = '' }: { pct: number; upTo?: boolean; className?: string }) {
  if (pct <= 0) return null;
  return (
    <span className={`inline-flex items-center rounded-full bg-ok/10 px-2 py-0.5 text-xs font-bold text-[color-mix(in_srgb,var(--ok)_60%,black)] ${className}`}>
      {upTo ? 'jusqu’à ' : ''}−{pct} %
    </span>
  );
}

/** Carte jeu du catalogue : icône, nom, éditeur, réduction max. */
export function GameCard({ game, variant = 'tile' }: { game: CatalogGame; variant?: 'tile' | 'row' }) {
  if (variant === 'row') {
    return (
      <Link
        href={`/games/${game.slug}`}
        className="flex min-w-0 items-center gap-3 rounded-[var(--radius)] p-2 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <GameIcon name={game.name} iconUrl={game.iconUrl} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{game.name}</p>
          <p className="truncate text-sm text-ink-2">{game.subtitle || game.category}</p>
          <p className="truncate text-xs text-ink-2">{game.publisherName}</p>
        </div>
        <DiscountBadge pct={game.maxDiscountPct} className="flex-none" />
      </Link>
    );
  }
  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex w-[148px] flex-none flex-col gap-2 rounded-[var(--radius)] sm:w-[168px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={`${game.name}${game.maxDiscountPct > 0 ? `, jusqu’à −${game.maxDiscountPct} %` : ''}`}
    >
      <div className="relative">
        <span className="block transition-transform group-hover:-translate-y-0.5">
          <GameIcon name={game.name} iconUrl={game.iconUrl} size={148} />
        </span>
        {game.maxDiscountPct > 0 && (
          <span className="absolute top-2 right-2 rounded-full bg-[color-mix(in_srgb,var(--ok)_70%,black)] px-2 py-0.5 text-xs font-bold text-white shadow">
            −{game.maxDiscountPct} %
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold">{game.name}</p>
        <p className="truncate text-sm text-ink-2">{game.publisherName || game.category}</p>
      </div>
    </Link>
  );
}
