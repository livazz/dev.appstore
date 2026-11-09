import Link from 'next/link';
import { formatMoney } from '@devappstore/core';
import { getDashboard, requireAdminPermission } from '@/server/admin';
import { parsePeriod } from '@/server/admin-logic';
import { Card, PageHeader } from '@/components/admin/ui';
import { DailyBars } from '@/components/admin/DailyBars';

export const dynamic = 'force-dynamic';

function Kpi({ label, value, hint, href, tone, wide }: { label: string; value: string; hint?: React.ReactNode; href?: string; tone?: 'danger' | 'warn'; wide?: boolean }) {
  const body = (
    <>
      <span className="text-sm text-ink-2">{label}</span>
      <span className={`break-words text-xl font-bold tabular-nums sm:text-2xl ${tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</span>
      {hint ? <span className="text-xs text-ink-2">{hint}</span> : null}
    </>
  );
  const cls = `flex min-w-0 flex-col gap-1 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-black/5 ${wide ? 'col-span-2 lg:col-span-1' : ''}`;
  return href ? (
    <Link href={href} className={`${cls} transition hover:ring-primary`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdminPermission('dashboard.read');
  const period = parsePeriod((await searchParams).period);
  const d = await getDashboard(period);
  const main = d.sales[0];
  const others = d.sales.slice(1);
  const nf = new Intl.NumberFormat('fr-FR');

  return (
    <>
      <PageHeader title="Tableau de bord">
        <div className="inline-flex rounded-[var(--radius)] bg-surface p-1 ring-1 ring-line" role="group" aria-label="Période">
          {[7, 30].map((p) => (
            <Link
              key={p}
              href={`/admin?period=${p}`}
              aria-current={p === period ? 'true' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${p === period ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}
            >
              {p} jours
            </Link>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          wide
          label="Volume d’affaires (GMV)"
          value={formatMoney(main?.gmvCents ?? 0, main?.currency ?? 'EUR')}
          hint={others.length ? `+ ${others.map((o) => formatMoney(o.gmvCents, o.currency)).join(' · ')}` : `Commandes payées, ${period} derniers jours`}
        />
        <Kpi
          label="Commission"
          value={formatMoney(main?.feeCents ?? 0, main?.currency ?? 'EUR')}
          hint={main ? `Taux effectif ${(main.takeRateBps / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %` : 'Aucune vente'}
        />
        <Kpi label="Commandes payées" value={nf.format(d.ordersCount)} href="/admin/orders" />
        <Kpi
          label="Livraisons en échec"
          value={nf.format(d.failedDeliveries)}
          tone={d.failedDeliveries ? 'danger' : undefined}
          href="/admin/orders?delivery=failed"
          hint={`${nf.format(d.openFailedDeliveries)} en échec au total`}
        />
        <Kpi
          label="Jeux en revue"
          value={nf.format(d.gamesInReview)}
          tone={d.gamesInReview ? 'warn' : undefined}
          href="/admin/games?status=review"
          hint={`${nf.format(d.liveGames)} en ligne · ${nf.format(d.suspendedGames)} suspendu${d.suspendedGames > 1 ? 's' : ''}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <DailyBars points={d.daily.points} currency={d.daily.currency} title={`Volume d’affaires par jour (${d.daily.currency})`} />
        </Card>
        <Card title="Meilleurs jeux de la période">
          {d.topGames.length ? (
            <ol className="flex flex-col divide-y divide-line">
              {d.topGames.map((g, i) => (
                <li key={`${g.id}-${g.currency}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-4 text-ink-3 tabular-nums">{i + 1}</span>
                  <Link href={`/admin/games/${g.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {g.name}
                  </Link>
                  <span className="text-right tabular-nums">
                    {formatMoney(g.gmvCents, g.currency)}
                    <span className="block text-xs text-ink-2">{nf.format(g.orders)} cmd</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-2">Aucune vente sur la période.</p>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-ink-3">
        Période : {period} derniers jours calendaires (UTC), aujourd’hui compris. GMV et commission : commandes au statut « payée » (hors remboursements). Livraisons en échec : créées sur la période,
        planning de relance épuisé.
      </p>
    </>
  );
}
