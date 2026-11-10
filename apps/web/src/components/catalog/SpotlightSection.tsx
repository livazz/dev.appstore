import Link from 'next/link';
import { formatMoney } from '@devappstore/core';
import { safeImageUrl } from '@/components/store/style-safety';
import { SPOTLIGHT_ANGLES, SPOTLIGHT_KINDS, type SpotlightEntry } from '@/server/spotlight';
import { GameIcon } from './GameCard';

const KIND_STYLE: Record<SpotlightEntry['kind'], string> = {
  season: 'bg-[#7c3aed] text-white',
  tournament: 'bg-[#dc2626] text-white',
  update: 'bg-[#0d9488] text-white',
  success: 'bg-brand text-ink',
  pick: 'bg-white text-ink',
};

/**
 * Carte « histoire » : grande image (capture paysage, ou trois captures portrait côte à côte), logo du jeu par-dessus,
 * puis un titre, une phrase et l'article conseillé avec son visuel et son prix. `hero` : première carte, pleine largeur.
 * La hauteur de l'image vient d'un padding en % (et non d'aspect-ratio, capricieux sur les éléments flex de Safari).
 */
export function SpotlightCard({ s, hero = false }: { s: SpotlightEntry; hero?: boolean }) {
  const covers = s.covers.map((c) => safeImageUrl(c)).filter((c): c is string => !!c);
  const banner = safeImageUrl(s.game.bannerUrl);
  const itemImg = safeImageUrl(s.item.imageUrl);
  const price = formatMoney(s.item.priceCents, s.game.currency);
  return (
    <article className={`flex min-w-0 flex-col overflow-hidden rounded-[20px] bg-ink text-white ${hero ? 'md:col-span-2 lg:col-span-3 lg:flex-row' : ''}`}>
      <Link
        href={`/games/${s.game.slug}`}
        aria-label={`${s.game.name} : voir la boutique`}
        className={`group relative block flex-none overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand ${hero ? 'lg:w-[62%]' : ''}`}
      >
        <div className="pt-[56.25%]" />
        <div
          className="absolute inset-0 grid transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
          style={{ gridTemplateColumns: `repeat(${Math.max(covers.length, 1)}, minmax(0, 1fr))` }}
        >
          {covers.map((c) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={c} src={c} alt="" loading={hero ? 'eager' : 'lazy'} className="size-full min-h-0 object-cover" />
          ))}
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,20,.4)_0%,rgba(10,10,20,0)_30%,rgba(10,10,20,.55)_62%,rgba(10,10,20,.96)_100%)]" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black tracking-wide uppercase shadow ${KIND_STYLE[s.kind]}`}>{SPOTLIGHT_KINDS[s.kind]}</span>
          {s.date && <span className="rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white">{s.date}</span>}
        </div>
        <div className="absolute right-3 bottom-3 left-3 flex items-end">
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner}
              alt={s.game.name}
              loading="lazy"
              className={`w-auto max-w-[70%] object-contain object-left-bottom drop-shadow-[0_4px_14px_rgba(0,0,0,.65)] ${hero ? 'h-20 sm:h-28 lg:h-32' : 'h-16 sm:h-20'}`}
            />
          ) : (
            <span className="flex items-center gap-3">
              <GameIcon name={s.game.name} iconUrl={s.game.iconUrl} size={hero ? 72 : 56} />
              <span className={`font-black drop-shadow-[0_2px_8px_rgba(0,0,0,.8)] ${hero ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>{s.game.name}</span>
            </span>
          )}
        </div>
      </Link>

      <div className={`flex min-w-0 flex-1 flex-col gap-2 p-4 ${hero ? 'lg:justify-center lg:gap-3 lg:p-7' : ''}`}>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-white/60">
          <GameIcon name={s.game.name} iconUrl={s.game.iconUrl} size={18} />
          <span className="truncate">
            {s.game.name} · {s.game.platform === 'pc' ? 'PC' : 'Mobile'}
          </span>
        </p>
        <h3 className={`leading-snug font-bold ${hero ? 'text-xl sm:text-2xl lg:text-3xl' : 'text-lg'}`}>{s.title}</h3>
        <p className={`text-white/70 ${hero ? 'text-sm sm:text-base' : 'line-clamp-3 text-sm'}`}>{s.text}</p>

        <Link
          href={`/games/${s.game.slug}?item=${encodeURIComponent(s.item.id)}`}
          aria-label={`${s.item.title}, ${s.game.name} : ${price}. ${SPOTLIGHT_ANGLES[s.angle]}`}
          className="group mt-auto flex items-center gap-3 rounded-[14px] bg-white/[0.08] p-2.5 ring-1 ring-white/10 transition-colors hover:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span className="grid size-14 flex-none place-items-center overflow-hidden rounded-[10px] bg-white/10">
            {itemImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={itemImg} alt="" loading="lazy" className="size-full object-contain" />
            ) : (
              <GameIcon name={s.game.name} iconUrl={s.game.iconUrl} size={40} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black tracking-wide text-brand uppercase">{SPOTLIGHT_ANGLES[s.angle]}</span>
            <span className="block truncate text-sm font-bold">{s.item.title}</span>
            <span className="block text-xs text-white/65">{s.pitch}</span>
          </span>
          <span className="flex flex-none flex-col items-end gap-0.5">
            {s.item.oldPriceCents != null && <s className="text-[11px] text-white/55">{formatMoney(s.item.oldPriceCents, s.game.currency)}</s>}
            <span className="rounded-full bg-brand px-3 py-1.5 text-sm font-black text-ink">{price}</span>
          </span>
        </Link>
      </div>
    </article>
  );
}

/** « À la une » : une grande histoire puis une grille de cartes illustrées (rien si aucun jeu n'a d'histoire). */
export function SpotlightSection({ entries }: { entries: SpotlightEntry[] }) {
  if (!entries.length) return null;
  return (
    <section className="mt-10" aria-labelledby="a-la-une-histoires">
      <h2 id="a-la-une-histoires" className="text-xl font-bold sm:text-2xl">
        En ce moment dans vos jeux
      </h2>
      <p className="mt-1 text-sm text-ink-2">Nouvelles saisons, tournois, nouveautés : l’actualité, et l’achat qui va avec.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {entries.map((s, i) => (
          <SpotlightCard key={s.game.id} s={s} hero={i === 0} />
        ))}
      </div>
    </section>
  );
}
