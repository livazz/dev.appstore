import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp, useDB } from '../lib/store';
import { PLATFORM_FEE, STORE_FEE } from '../lib/constants';
import { dateFr, money } from '../lib/format';
import { RevenueChart, type DayPoint } from '../components/RevenueChart';

const RANGES = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
];

export function Sales() {
  const { appId } = useParams();
  const app = useApp(appId)!;
  const db = useDB();
  const [days, setDays] = useState(30);

  const { orders, series, gross, top } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const from = start.getTime() - (days - 1) * 86400000;
    const orders = db.orders.filter((o) => o.appId === app.id && o.createdAt >= from);
    const series: DayPoint[] = Array.from({ length: days }, (_, i) => ({ day: from + i * 86400000, gross: 0, count: 0 }));
    const byItem = new Map<string, { title: string; count: number; gross: number }>();
    let gross = 0;
    for (const o of orders) {
      const idx = Math.min(days - 1, Math.floor((o.createdAt - from) / 86400000));
      series[idx].gross += o.amount;
      series[idx].count += 1;
      gross += o.amount;
      const cur = byItem.get(o.itemId) ?? { title: o.itemTitle, count: 0, gross: 0 };
      cur.count += 1;
      cur.gross += o.amount;
      byItem.set(o.itemId, cur);
    }
    const top = [...byItem.values()].sort((a, b) => b.gross - a.gross);
    return { orders, series, gross, top };
  }, [db.orders, app.id, days]);

  const net = gross * (1 - PLATFORM_FEE);
  const viaStores = gross * (1 - STORE_FEE);
  const saved = net - viaStores;
  const c = app.currency;

  return (
    <section className="sales">
      <div className="filters">
        <div className="seg" role="group" aria-label="Période">
          {RANGES.map((r) => (
            <button key={r.days} className={days === r.days ? 'active' : ''} onClick={() => setDays(r.days)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Revenu brut</span>
          <strong>{money(gross, c)}</strong>
          <small>{orders.length} achat{orders.length > 1 ? 's' : ''}</small>
        </div>
        <div className="stat">
          <span>Votre revenu net</span>
          <strong>{money(net, c)}</strong>
          <small>après {Math.round(PLATFORM_FEE * 100)} % de frais Wolleen</small>
        </div>
        <div className="stat highlight">
          <span>Gagné en plus vs App Store / Google Play</span>
          <strong>+{money(saved, c)}</strong>
          <small>via les stores, vous auriez touché {money(viaStores, c)}</small>
        </div>
        <div className="stat">
          <span>Panier moyen</span>
          <strong>{money(orders.length ? gross / orders.length : 0, c)}</strong>
          <small>par achat</small>
        </div>
      </div>

      <RevenueChart data={series} currency={c} />

      <div className="two-col">
        <div className="card">
          <h3>Meilleures ventes</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Article</th><th className="num">Achats</th><th className="num">Revenu</th></tr></thead>
              <tbody>
                {top.map((t) => (
                  <tr key={t.title}><td>{t.title}</td><td className="num">{t.count}</td><td className="num">{money(t.gross, c)}</td></tr>
                ))}
                {!top.length && <tr><td colSpan={3} className="muted">Aucune vente sur la période.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Dernières transactions</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Joueur</th><th>Article</th><th className="num">Montant</th><th>Statut</th></tr></thead>
              <tbody>
                {orders.slice(0, 12).map((o) => (
                  <tr key={o.id}>
                    <td>{dateFr(o.createdAt)}</td>
                    <td className="mono">{o.playerId}</td>
                    <td>{o.itemTitle}</td>
                    <td className="num">{money(o.amount, o.currency)}</td>
                    <td>{o.status === 'delivered' ? <span className="pill ok">✓ Livré</span> : <span className="pill warn">⏳ À livrer</span>}</td>
                  </tr>
                ))}
                {!orders.length && <tr><td colSpan={5} className="muted">Aucune transaction.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
