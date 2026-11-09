import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, eq, games } from '@wolleen/db';
import { feeCents, formatMoney, STORE_FEE_BPS } from '@wolleen/core';
import { requireGameAccess } from '@/server/session';
import { SALES_ROLES, getDailyRevenue, getSalesTotals, getTopItems, getTransactions } from '@/server/analytics';
import { formatDateTime, parseSalesPeriod, SALES_PERIODS, studioDeliveryLabel, TONE_CLASSES } from '@/lib/analytics-format';
import { RevenueChart } from '@/components/analytics/RevenueChart';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ventes et tendances — Wolleen' };

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const days = parseSalesPeriod((await searchParams).days);
  try {
    await requireGameAccess(id, [...SALES_ROLES]);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') notFound();
    throw e;
  }
  const [game] = await db.select({ name: games.name, currency: games.currency }).from(games).where(eq(games.id, id));
  if (!game) notFound();

  const opts = { days };
  const [totals, transactions] = await Promise.all([getSalesTotals(id, opts), getTransactions(id, { ...opts, limit: 12 })]);
  const [main, ...others] = totals;
  const c = main.currency;
  const [daily, top] = await Promise.all([getDailyRevenue(id, c, opts), getTopItems(id, c, { ...opts, limit: 5 })]);
  const feePct = main.grossCents ? (main.platformFeeCents / main.grossCents) * 100 : null;
  const viaStores = main.grossCents - feeCents(main.grossCents, STORE_FEE_BPS);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ventes et tendances</h1>
          <p className="text-sm text-ink-2">{game.name} · {days} derniers jours · montants en {c}</p>
        </div>
        <div className="flex items-center gap-3">
          <nav className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm" aria-label="Période">
            {SALES_PERIODS.map((d) => (
              <Link
                key={d}
                href={`?days=${d}`}
                scroll={false}
                aria-current={d === days ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 ${d === days ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink'}`}
              >
                {d} jours
              </Link>
            ))}
          </nav>
          <a
            href={`/studio/games/${id}/sales/export?days=${days}`}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            download
          >
            Exporter en CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Revenu brut" value={formatMoney(main.grossCents, c)} hint="payé par les joueurs" />
        <Tile
          label="Revenu net"
          value={formatMoney(main.netCents, c)}
          hint={feePct == null ? 'après commission Wolleen' : `après ${formatMoney(main.platformFeeCents, c)} de commission (${feePct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)`}
        />
        <Tile
          highlight
          label="Gagné en plus vs App Store / Google Play"
          value={`+${formatMoney(main.savingsCents, c)}`}
          hint={`via les stores (30 %), vous auriez touché ${formatMoney(viaStores, c)}`}
        />
        <Tile label="Panier moyen" value={formatMoney(main.avgCents, c)} hint="par achat" />
        <Tile label="Achats" value={main.count.toLocaleString('fr-FR')} hint="commandes payées" className="col-span-2 lg:col-span-1" />
      </div>

      {others.length > 0 && (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-2 text-sm text-warn">
          Ventes dans d’autres devises (non incluses ci-dessus) :{' '}
          {others.map((o) => `${formatMoney(o.grossCents, o.currency)} brut (${o.count} achat${o.count > 1 ? 's' : ''})`).join(' · ')}
        </p>
      )}

      <RevenueChart data={daily} currency={c} />

      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        <Card title="Meilleures ventes">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="pb-2 font-medium">Article</th>
                <th className="pb-2 text-right font-medium">Achats</th>
                <th className="pb-2 text-right font-medium">Revenu brut</th>
              </tr>
            </thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.itemId} className="border-t border-line">
                  <td className="py-2">
                    <div className="font-medium">{t.title}</div>
                    <div className="font-mono text-xs text-ink-3">{t.productId}</div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{t.count}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(t.grossCents, c)}</td>
                </tr>
              ))}
              {!top.length && <EmptyRow cols={3} text="Aucune vente sur la période." />}
            </tbody>
          </table>
        </Card>

        <Card title="Dernières transactions">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Joueur</th>
                  <th className="pb-2 font-medium">Article</th>
                  <th className="pb-2 text-right font-medium">Montant</th>
                  <th className="pb-2 pl-3 font-medium">Livraison</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const s = studioDeliveryLabel(t.orderStatus, t.deliveryStatus);
                  return (
                    <tr key={t.id} className="border-t border-line">
                      <td className="whitespace-nowrap py-2 pr-3 text-ink-2">{formatDateTime(t.date)}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{t.playerId}</td>
                      <td className="py-2">
                        {t.itemTitle}
                        {t.quantity > 1 && <span className="text-ink-3"> ×{t.quantity}</span>}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums">{formatMoney(t.amountCents, t.currency)}</td>
                      <td className="py-2 pl-3">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[s.tone]}`}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })}
                {!transactions.length && <EmptyRow cols={5} text="Aucune transaction sur la période." />}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, highlight, className = '' }: { label: string; value: string; hint: string; highlight?: boolean; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[var(--radius)] border p-4 ${highlight ? 'border-ok/30 bg-ok/5' : 'border-line bg-surface'} ${className}`}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <strong className={`text-2xl font-semibold tabular-nums ${highlight ? 'text-ok' : ''}`}>{value}</strong>
      <small className="text-xs text-ink-3">{hint}</small>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-line bg-surface p-5">
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr className="border-t border-line">
      <td colSpan={cols} className="py-6 text-center text-ink-3">
        {text}
      </td>
    </tr>
  );
}
