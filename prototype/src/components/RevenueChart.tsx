import { useEffect, useRef, useState } from 'react';
import type { Currency } from '../types';
import { money } from '../lib/format';

export interface DayPoint {
  day: number; // timestamp minuit
  gross: number;
  count: number;
}

function niceMax(v: number) {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Barres de revenu brut quotidien — une seule série, info-bulle au survol, vue tableau disponible. */
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
  }, []);

  const H = 240;
  const pad = { l: 56, r: 8, t: 12, b: 28 };
  const iw = w - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...data.map((d) => d.gross), 0));
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(1, slot - 2);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 70)));
  const fmtDay = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  const bar = (x: number, top: number, width: number) => {
    const h = pad.t + ih - top;
    const r = Math.min(4, width / 2, h);
    if (h <= 0) return '';
    return `M${x},${pad.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${pad.t + ih} Z`;
  };

  const hv = hover != null ? data[hover] : null;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>Revenu brut par jour</h3>
        <button className="link-btn" onClick={() => setTable((t) => !t)}>{table ? 'Voir le graphique' : 'Voir le tableau'}</button>
      </div>
      {table ? (
        <div className="table-wrap chart-table">
          <table>
            <thead><tr><th>Jour</th><th className="num">Achats</th><th className="num">Revenu brut</th></tr></thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day}><td>{fmtDay(d.day)}</td><td className="num">{d.count}</td><td className="num">{money(d.gross, currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="chart-box" onMouseLeave={() => setHover(null)}>
          <svg width={w} height={H} role="img" aria-label="Revenu brut quotidien">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="axis-text">
                  {t >= 1000 ? `${(t / 1000).toLocaleString('fr-FR')} k` : t.toLocaleString('fr-FR')}
                </text>
              </g>
            ))}
            {data.map((d, i) => (
              <g key={d.day}>
                <path d={bar(pad.l + i * slot + 1, y(d.gross), bw)} className={'bar' + (hover === i ? ' hot' : '') + (hover != null && hover !== i ? ' dim' : '')} />
                {i % labelEvery === 0 && (
                  <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="axis-text">{fmtDay(d.day)}</text>
                )}
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            ))}
          </svg>
          {hv && hover != null && (
            <div className="tooltip" style={{ left: Math.min(w - 170, Math.max(0, pad.l + hover * slot + slot / 2 - 80)), top: Math.max(0, y(hv.gross) - 70) }}>
              <strong>{fmtDay(hv.day)}</strong>
              <span>{money(hv.gross, currency)}</span>
              <small>{hv.count} achat{hv.count > 1 ? 's' : ''}</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
