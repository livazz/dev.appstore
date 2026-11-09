'use client';

import { useEffect, useRef, useState } from 'react';
import type { Currency } from '@devappstore/core';
import { formatCents as formatMoney, formatDayShort } from '@/lib/analytics-format';

export interface DayPoint {
  /** Jour calendaire YYYY-MM-DD. */
  day: string;
  grossCents: number;
  count: number;
}

/** Arrondit vers le haut à 1, 2 ou 5 × 10^n (en unités monétaires). */
function niceMax(v: number) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function axisLabel(units: number) {
  return units >= 1000 ? `${(units / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : units.toLocaleString('fr-FR');
}

/** Barres du revenu brut quotidien — une seule série, info-bulle au survol, vue tableau disponible. */
export function RevenueChart({ data, currency }: { data: DayPoint[]; currency: Currency }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const H = 240;
  const pad = { l: 48, r: 8, t: 12, b: 28 };
  const iw = w - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...data.map((d) => d.grossCents)) / 100);
  const slot = iw / Math.max(1, data.length);
  const gap = slot > 8 ? 2 : 1;
  const bw = Math.max(1, slot - gap);
  const y = (cents: number) => pad.t + ih - (cents / 100 / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 70)));
  const base = pad.t + ih;

  const bar = (x: number, top: number, width: number) => {
    const h = base - top;
    if (h <= 0) return '';
    const r = Math.min(3, width / 2, h);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${base} Z`;
  };

  const hv = hover != null ? data[hover] : null;
  const total = data.reduce((s, d) => s + d.grossCents, 0);

  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-[15px] font-semibold">Revenu brut par jour</h2>
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Voir le graphique' : 'Voir le tableau'}
        </button>
      </div>
      {table ? (
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-ink-3">
              <tr>
                <th className="py-2 font-medium">Jour</th>
                <th className="py-2 text-right font-medium">Achats</th>
                <th className="py-2 text-right font-medium">Revenu brut</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1.5">{formatDayShort(d.day)}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(d.grossCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="block max-w-full" role="img" aria-label={`Revenu brut quotidien, total ${formatMoney(total, currency)}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t * 100)} y2={y(t * 100)} stroke="var(--line)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 3'} />
                <text x={pad.l - 8} y={y(t * 100) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
                  {axisLabel(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => (
              <g key={d.day}>
                <path
                  d={bar(pad.l + i * slot + gap / 2, y(d.grossCents), bw)}
                  fill="var(--primary)"
                  opacity={hover != null && hover !== i ? 0.45 : 1}
                  className="transition-opacity"
                />
                {i % labelEvery === 0 && (
                  <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                    {formatDayShort(d.day)}
                  </text>
                )}
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            ))}
          </svg>
          {hv && hover != null && (
            <div
              className="pointer-events-none absolute flex w-40 flex-col rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg"
              style={{ left: Math.min(w - 164, Math.max(0, pad.l + hover * slot + slot / 2 - 80)), top: Math.max(0, y(hv.grossCents) - 76) }}
            >
              <strong className="text-xs font-medium text-ink-2">{formatDayShort(hv.day)}</strong>
              <span className="font-semibold tabular-nums">{formatMoney(hv.grossCents, currency)}</span>
              <small className="text-ink-3">
                {hv.count} achat{hv.count > 1 ? 's' : ''}
              </small>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
