import Link from 'next/link';
import { formatMoney } from '@devappstore/core';
import { safeImageUrl } from '@/components/store/style-safety';
import { SPOTLIGHT_ANGLES, type SpotlightEntry } from '@/server/spotlight';
import { GameIcon } from './GameCard';

const platformLabel = (p: string) => (p === 'pc' ? 'PC' : 'mobile');

/** Rang précis dans le top 10, « Top 50 » ensuite, rien au-delà (un rang lointain dessert un jeu mis en avant). */
export function rankLabel(s: Pick<SpotlightEntry, 'rank'> & { game: Pick<SpotlightEntry['game'], 'platform'> }): string | null {
  if (s.rank == null || s.rank > 50) return null;
  return s.rank <= 10 ? `N° ${s.rank} du top ${platformLabel(s.game.platform)}` : `Top 50 ${platformLabel(s.game.platform)}`;
}

/** Carte éditoriale d'un jeu : pourquoi il compte parmi les meilleurs, puis l'article conseillé et son argument. */
export function SpotlightCard({ s }: { s: SpotlightEntry }) {
  const cover = safeImageUrl(s.game.cover);
  const itemImg = safeImageUrl(s.item.imageUrl);
  const price = formatMoney(s.item.priceCents, s.game.currency);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-line bg-surface">
      <Link
        href={`/games/${s.game.slug}`}
        className="group relative block aspect-[16/7] overflow-hidden bg-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      >
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
        )}
        <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,20,.15)_0%,rgba(10,10,20,.88)_100%)]" />
        <span className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {rankLabel(s) && <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-black text-ink">{rankLabel(s)}</span>}
          {s.rating && s.rating.average >= 4 && (
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white" aria-label={`Note ${s.rating.average.toLocaleString('fr-FR')} sur 5, ${s.rating.count} avis`}>
              <span aria-hidden="true">★ {s.rating.average.toLocaleString('fr-FR', { minimumFractionDigits: 1 })}</span>
            </span>
          )}
        </span>
        <div className="absolute right-3 bottom-3 left-3 flex items-center gap-3 text-white">
          <GameIcon name={s.game.name} iconUrl={s.game.iconUrl} size={56} />
          <div className="min-w-0">
            <h3 className="truncate text-lg leading-tight font-bold sm:text-xl">{s.game.name}</h3>
            <p className="truncate text-xs text-white/75">
              {s.game.category} · {s.game.publisherName}
            </p>
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="font-semibold">{s.headline}</p>
        <ul className="space-y-1.5 text-sm text-ink-2">
          {s.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden="true" className="mt-px font-bold text-[color-mix(in_srgb,var(--ok)_70%,black)]">
                ✓
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>

        <Link
          href={`/games/${s.game.slug}?item=${encodeURIComponent(s.item.id)}`}
          aria-label={`${s.item.title}, ${s.game.name} : ${price}. ${SPOTLIGHT_ANGLES[s.angle]}`}
          className="group mt-auto flex items-center gap-3 rounded-[14px] bg-[linear-gradient(135deg,#fff6d1,#ffe9a8)] p-3 text-ink transition-shadow hover:shadow-[0_6px_18px_rgba(0,0,0,.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="grid size-16 flex-none place-items-center">
            {itemImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={itemImg} alt="" loading="lazy" className="size-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,.18)]" />
            ) : (
              <GameIcon name={s.game.name} iconUrl={s.game.iconUrl} size={48} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-black tracking-wide text-[#7a4b00] uppercase">{SPOTLIGHT_ANGLES[s.angle]}</span>
            <span className="block truncate font-bold">{s.item.title}</span>
            <span className="mt-0.5 block text-sm text-[#4a3a12]">{s.pitch}</span>
          </span>
          <span className="flex flex-none flex-col items-end gap-1">
            {s.item.oldPriceCents != null && <s className="text-xs text-[#6b5a2e]">{formatMoney(s.item.oldPriceCents, s.game.currency)}</s>}
            <span className="rounded-full bg-ink px-3 py-1.5 text-sm font-bold text-white group-hover:bg-black">{price}</span>
          </span>
        </Link>
      </div>
    </article>
  );
}

/** « Les meilleurs jeux du moment » : grille de cartes éditoriales (rien si aucun jeu n'a de présentation). */
export function SpotlightSection({ entries }: { entries: SpotlightEntry[] }) {
  if (!entries.length) return null;
  return (
    <section className="mt-10" aria-labelledby="meilleurs-jeux">
      <h2 id="meilleurs-jeux" className="text-xl font-bold sm:text-2xl">
        Les meilleurs jeux du moment
      </h2>
      <p className="mt-1 text-sm text-ink-2">Pourquoi tout le monde y joue, et l’achat qui vaut vraiment le coup dans chacun.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {entries.map((s) => (
          <SpotlightCard key={s.game.id} s={s} />
        ))}
      </div>
    </section>
  );
}
