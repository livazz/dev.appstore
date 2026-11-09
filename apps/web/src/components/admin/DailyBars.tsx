import { formatMoney, type Currency } from '@wolleen/core';

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const label = (day: string) => dayFmt.format(new Date(`${day}T12:00:00Z`));

/**
 * Volume d'affaires par jour (une seule série : pas de légende, le titre la nomme).
 * Barres fines arrondies en haut, info-bulle au survol, tableau équivalent pour les lecteurs d'écran.
 */
export function DailyBars({ points, currency, title }: { points: { day: string; cents: number }[]; currency: Currency; title: string }) {
  const max = Math.max(...points.map((p) => p.cents), 1);
  const total = points.reduce((s, p) => s + p.cents, 0);
  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-semibold">{title}</span>
        <span className="text-sm text-ink-2">Total : {formatMoney(total, currency)}</span>
      </figcaption>
      <div className="relative h-40 border-b border-line" aria-hidden>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <span className="absolute -top-2 right-0 bg-surface pl-1 text-[11px] text-ink-3">{formatMoney(max, currency)}</span>
        <div className="flex h-full items-end gap-[2px]">
          {points.map((p) => (
            <div key={p.day} className="group relative flex h-full min-w-0 flex-1 items-end">
              <div className="w-full rounded-t-[4px] bg-primary transition group-hover:opacity-80" style={{ height: `${p.cents ? Math.max((p.cents / max) * 100, 2) : 0}%` }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow group-hover:block">
                {label(p.day)} · {formatMoney(p.cents, currency)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-3" aria-hidden>
        <span>{label(points[0]!.day)}</span>
        <span>{label(points.at(-1)!.day)}</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">Voir le tableau</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 font-medium text-ink-2">Jour</th>
                <th scope="col" className="py-1 text-right font-medium text-ink-2">Montant</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.day} className="border-t border-line">
                  <td className="py-1">{label(p.day)}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(p.cents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
