import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, eq, games } from '@devappstore/db';
import { formatMoney, STORE_FEE_OPTIONS_BPS } from '@devappstore/core';
import { requireGameAccess } from '@/server/session';
import {
  DEFAULT_SALES_STORE_FEE_BPS,
  SALES_ROLES,
  getDailyRevenue,
  getSalesTotals,
  getTopItems,
  getTransactions,
  storeFeeLabel,
} from '@/server/analytics';
import { formatDateTime, parseSalesPeriod, SALES_PERIODS, studioDeliveryLabel, TONE_CLASSES } from '@/lib/analytics-format';
import { RevenueChart } from '@/components/analytics/RevenueChart';
import { bpsToPercentLabel, netViaStoresCents, parseStoreFeeBps } from '@/components/marketing/savings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ventes et tendances — Dev AppStore' };

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const days = parseSalesPeriod(sp.days);
  // Commission store de référence pour la tuile « Gagné en plus » : 15 % par défaut (comparaison prudente),
  // 30 % au choix (?store=30). Le même taux sert au calcul serveur (savingsCents) et au libellé.
  const storeBps = parseStoreFeeBps(sp.store, STORE_FEE_OPTIONS_BPS, DEFAULT_SALES_STORE_FEE_BPS);
  const qs = (next: { days?: number; store?: number }) => {
    const p = new URLSearchParams({ days: String(next.days ?? days) });
    const store = next.store ?? storeBps;
    if (store !== DEFAULT_SALES_STORE_FEE_BPS) p.set('store', String(store / 100));
    return `?${p.toString()}`;
  };
  try {
    await requireGameAccess(id, [...SALES_ROLES]);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') notFound();
    throw e;
  }
  const [game] = await db.select({ name: games.name, currency: games.currency }).from(games).where(eq(games.id, id));
  if (!game) notFound();

  const opts = { days };
  const [totals, transactions] = await Promise.all([
    getSalesTotals(id, { ...opts, storeFeeBps: storeBps }),
    getTransactions(id, { ...opts, limit: 12 }),
  ]);
  const [main, ...others] = totals;
  const c = main.currency;
  const [daily, top] = await Promise.all([getDailyRevenue(id, c, opts), getTopItems(id, c, { ...opts, limit: 5 })]);
  const feePct = main.grossCents ? (main.platformFeeCents / main.grossCents) * 100 : null;
  const viaStores = netViaStoresCents(main.grossCents, main.storeFeeBps);
  const savings = main.savingsCents;
  const storeLabel = storeFeeLabel(main.storeFeeBps);

  return (
    <div className="flex flex-col gap-5 py-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-ink">Ventes et tendances</h2>
          <p className="mt-1 text-sm text-ink-2">
            {game.name} · {days} derniers jours · montants en {c}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="inline-flex rounded-[var(--radius)] border border-line bg-surface p-0.5 text-sm" aria-label="Période">
            {SALES_PERIODS.map((d) => (
              <Link
                key={d}
                href={qs({ days: d })}
                scroll={false}
                aria-current={d === days ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-[calc(var(--radius)-2px)] px-3 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${d === days ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink'}`}
              >
                {d} jours
              </Link>
            ))}
          </nav>
          <a
            href={`/studio/games/${id}/sales/export?days=${days}`}
            className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-primary px-4 text-sm font-semibold whitespace-nowrap text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            download
          >
            Exporter en CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Tile label="Revenu brut" value={formatMoney(main.grossCents, c)} hint="payé par les joueurs" />
        <Tile
          label="Revenu net"
          value={formatMoney(main.netCents, c)}
          hint={feePct == null ? 'après commission Dev AppStore' : `après ${formatMoney(main.platformFeeCents, c)} de commission (${feePct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)`}
        />
        <Tile
          highlight
          className="col-span-2 lg:col-span-1 lg:row-span-2"
          label={`Gagné en plus vs commission store de ${storeLabel}`}
          value={`+${formatMoney(savings, c)}`}
          hint={`Via l’App Store / Google Play à ${storeLabel}, vous auriez touché ${formatMoney(viaStores, c)}.`}
        >
          <div className="mt-auto pt-3">
            <p id="store-fee-label" className="text-xs font-medium text-ink-2">
              Votre commission store (15 % : petits studios, abonnements après 1 an)
            </p>
            <div role="group" aria-labelledby="store-fee-label" className="mt-1.5 inline-flex rounded-[var(--radius)] border border-line bg-surface p-0.5 text-sm">
              {STORE_FEE_OPTIONS_BPS.map((bps) => (
                <Link
                  key={bps}
                  href={qs({ store: bps })}
                  scroll={false}
                  replace
                  aria-current={bps === storeBps ? 'true' : undefined}
                  className={`inline-flex min-h-11 min-w-14 items-center justify-center rounded-[calc(var(--radius)-2px)] px-3 font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${bps === storeBps ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink'}`}
                >
                  {bpsToPercentLabel(bps)}
                </Link>
              ))}
            </div>
          </div>
        </Tile>
        <Tile label="Panier moyen" value={formatMoney(main.avgCents, c)} hint="par achat" />
        <Tile label="Achats" value={main.count.toLocaleString('fr-FR')} hint="commandes payées" />
      </div>

      {others.length > 0 && (
        <p className="rounded-[var(--radius)] border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink">
          Ventes dans d’autres devises (non incluses ci-dessus) :{' '}
          {others.map((o) => `${formatMoney(o.grossCents, o.currency)} brut (${o.count} achat${o.count > 1 ? 's' : ''})`).join(' · ')}
        </p>
      )}

      <RevenueChart data={daily} currency={c} />

      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        <Card title="Meilleures ventes">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
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
                    <div className="font-mono text-xs text-ink-2">{t.productId}</div>
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
              <thead className="text-left text-xs text-ink-2">
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
                        {t.quantity > 1 && <span className="text-ink-2"> ×{t.quantity}</span>}
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

function Tile({
  label,
  value,
  hint,
  highlight,
  className = '',
  children,
}: {
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-[var(--radius)] border p-5 ${highlight ? 'border-ok/30 bg-ok/5' : 'border-line bg-surface'} ${className}`}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <strong className={`text-2xl font-semibold break-words tabular-nums ${highlight ? 'text-[color-mix(in_srgb,var(--ok)_75%,black)]' : ''}`}>{value}</strong>
      <small className="text-xs text-ink-2">{hint}</small>
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-line bg-surface p-5">
      <h2 className="mb-4 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr className="border-t border-line">
      <td colSpan={cols} className="py-8 text-center text-ink-2">
        {text}
      </td>
    </tr>
  );
}
