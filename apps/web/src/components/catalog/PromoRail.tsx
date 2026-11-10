import Link from 'next/link';
import { formatMoney } from '@devappstore/core';
import type { PromoItem } from '@/server/catalog';
import { safeImageUrl } from '@/components/store/style-safety';
import { GameIcon } from './GameCard';
import { PromoCountdown } from './PromoCountdown';
import { formatRemaining } from '@/lib/promo';

const startFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
const startHourFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** « dans 5 h », « dès le jeu. 12 nov. à 08:00 ». */
export function formatPromoStart(iso: string, now: number): string {
  const d = new Date(iso);
  const left = d.getTime() - now;
  if (left < 86_400_000) return `dans ${formatRemaining(Math.max(left, 60_000))}`;
  return `dès le ${startFmt.format(d)} à ${startHourFmt.format(d)}`;
}

const platformLabel = (p: string) => (p === 'pc' ? 'PC' : 'Mobile');

function ItemVisual({ item }: { item: PromoItem }) {
  const img = safeImageUrl(item.imageUrl);
  return img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img} alt="" loading="lazy" className="size-full object-contain p-3 drop-shadow-[0_6px_10px_rgba(0,0,0,.18)]" />
  ) : (
    <span className="grid size-full place-items-center">
      <GameIcon name={item.game.name} iconUrl={item.game.iconUrl} size={72} />
    </span>
  );
}

/** Carte d'un article en promo (ou bientôt en promo). */
export function PromoCard({ item, now, upcoming = false }: { item: PromoItem; now: number; upcoming?: boolean }) {
  const label = `${item.title}, ${item.game.name} : ${formatMoney(item.priceCents, item.game.currency)}${upcoming ? `, −${item.discountPct} % ${item.startsAt ? formatPromoStart(item.startsAt, now) : ''}` : `, au lieu de ${formatMoney(item.oldPriceCents, item.game.currency)} (−${item.discountPct} %)`}`;
  return (
    <Link
      href={`/games/${item.game.slug}?item=${encodeURIComponent(item.id)}`}
      aria-label={label}
      className="group flex w-[220px] flex-none snap-start flex-col overflow-hidden rounded-[16px] border border-line bg-surface transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-[240px]"
    >
      <div className={`relative aspect-[16/11] ${upcoming ? 'bg-[linear-gradient(135deg,#eef0ff,#dfe6f7)]' : 'bg-[linear-gradient(135deg,#fff6d1,#ffe9a8)]'}`}>
        <span className="block size-full transition-transform group-hover:scale-[1.03] motion-reduce:transition-none">
          <ItemVisual item={item} />
        </span>
        <span
          className={`absolute top-2 left-2 rounded-full px-2.5 py-1 text-xs font-black text-white shadow ${upcoming ? 'bg-primary' : 'bg-[color-mix(in_srgb,var(--danger)_88%,black)]'}`}
        >
          −{item.discountPct} %
        </span>
        <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{platformLabel(item.game.platform)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="truncate font-semibold">{item.title}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
          <GameIcon name={item.game.name} iconUrl={item.game.iconUrl} size={18} />
          <span className="truncate">{item.game.name}</span>
        </p>
        <p className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-lg font-bold">{formatMoney(item.priceCents, item.game.currency)}</span>
          {!upcoming && <s className="text-sm text-ink-2">{formatMoney(item.oldPriceCents, item.game.currency)}</s>}
        </p>
        {upcoming ? (
          <p className="text-xs font-semibold text-primary">{item.startsAt ? `Promo ${formatPromoStart(item.startsAt, now)}` : 'Bientôt'}</p>
        ) : item.endsAt ? (
          <PromoCountdown endsAt={item.endsAt} serverNow={now} className="text-xs font-semibold text-[color-mix(in_srgb,var(--danger)_80%,black)]" />
        ) : null}
      </div>
    </Link>
  );
}

/** Rangée horizontale défilante de cartes promo, avec titre et sous-titre. */
export function PromoRail({ id, title, subtitle, items, now, upcoming = false }: { id: string; title: string; subtitle?: string; items: PromoItem[]; now: number; upcoming?: boolean }) {
  if (!items.length) return null;
  return (
    <section className="mt-10" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 id={id} className="text-xl font-bold sm:text-2xl">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        <span className="text-sm text-ink-2">{items.length} offre{items.length > 1 ? 's' : ''}</span>
      </div>
      <ul className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
        {items.map((it) => (
          <li key={it.id} className="flex">
            <PromoCard item={it} now={now} upcoming={upcoming} />
          </li>
        ))}
      </ul>
    </section>
  );
}
