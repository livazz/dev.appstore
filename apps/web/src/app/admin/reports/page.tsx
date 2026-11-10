import Link from 'next/link';
import { requireAdminPermission } from '@/server/admin';
import { SUSPENSION_GROUNDS, can, type SuspensionGround } from '@/server/admin-logic';
import { listOpenReportsForAdmin } from '@/server/reports';
import { CONTENT_POLICY_HREF, reportCategoryLabel } from '@/server/reports-logic';
import { Card, Empty, GameStatusBadge, Mono, PageHeader, Time } from '@/components/admin/ui';
import { DismissReportsForm } from '@/components/admin/DismissReportsForm';
import type { GameStatus } from '@devappstore/core';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Signalements' };

/**
 * Signalements de contenus ouverts, regroupés par jeu. Deux décisions : classer sans suite (motif envoyé aux
 * signalants), ou suspendre le jeu via le panneau de modération de la fiche jeu (fondement prérempli), qui clôt
 * aussi les signalements. Réservé aux rôles ayant `reports.moderate` (sinon 404).
 */
export default async function AdminReports() {
  const admin = await requireAdminPermission('reports.moderate');
  const groups = await listOpenReportsForAdmin();
  const total = groups.reduce((s, g) => s + g.count, 0);
  const canSuspend = can(admin.role, 'games.moderate');

  return (
    <>
      <PageHeader title="Signalements">
        <p className="text-sm text-ink-2">
          {total ? `${total} signalement${total > 1 ? 's' : ''} ouvert${total > 1 ? 's' : ''} sur ${groups.length} jeu${groups.length > 1 ? 'x' : ''}` : 'Aucun signalement ouvert'}
        </p>
      </PageHeader>
      <p className="mb-4 max-w-3xl text-sm text-ink-2">
        Les studios publient sans revue préalable : la modération se fait a posteriori, à partir de ces signalements (
        <Link href={CONTENT_POLICY_HREF} className="text-primary hover:underline">
          charte publique
        </Link>
        ). Chaque décision clôt les signalements ouverts du jeu, est journalisée et communiquée aux signalants. Le studio n’est prévenu qu’en cas de suspension.
      </p>

      {groups.length ? (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <Card key={g.game.id}>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold">
                  <Link href={`/admin/games/${g.game.id}`} className="hover:underline">
                    {g.game.name}
                  </Link>
                </h2>
                <GameStatusBadge status={g.game.status as GameStatus} />
                <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger" aria-label={`${g.count} signalements ouverts`}>
                  {g.count} signalement{g.count > 1 ? 's' : ''}
                </span>
                <span className="text-sm text-ink-2">{g.game.studioName}</span>
                {g.game.status === 'live' ? (
                  <Link href={`/games/${g.game.slug}`} className="ml-auto text-sm text-primary hover:underline">
                    Voir la boutique
                  </Link>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ol className="flex flex-col gap-3 lg:col-span-2" aria-label={`Signalements de ${g.game.name}`}>
                  {g.reports.map((r) => (
                    <li key={r.id} className="rounded-xl bg-bg p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{reportCategoryLabel(r.category)}</strong>
                        <span className="text-xs text-ink-2">
                          <Time date={r.createdAt} />
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-2">Article : {r.itemTitle ?? (r.itemId ? 'article supprimé' : 'le jeu dans son ensemble')}</p>
                      <p className="mt-2 whitespace-pre-line break-words">{r.explanation}</p>
                      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-2">
                        <span className="break-all">{r.reporterEmail}</span>
                        <span>{r.hasAccount ? 'compte connecté' : 'visiteur'}</span>
                        <span className="text-ink-3">
                          Réf. <Mono>{r.id}</Mono>
                        </span>
                      </p>
                    </li>
                  ))}
                </ol>

                <div className="flex flex-col gap-5">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Classer sans suite</h3>
                    <DismissReportsForm gameId={g.game.id} reportIds={g.reports.map((r) => r.id)} />
                  </div>
                  {canSuspend && g.game.status !== 'suspended' ? (
                    <div>
                      <h3 className="mb-1 text-sm font-semibold">Suspendre le jeu</h3>
                      <p className="mb-2 text-xs text-ink-2">
                        Panneau de modération de la fiche jeu, fondement prérempli : {SUSPENSION_GROUNDS[g.suggestedGround as SuspensionGround] ?? g.suggestedGround}. La
                        suspension clôt tous les signalements ouverts du jeu.
                      </p>
                      <Link
                        href={`/admin/games/${g.game.id}?ground=${encodeURIComponent(g.suggestedGround)}#moderation`}
                        className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                      >
                        Suspendre le jeu…
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty>Aucun signalement en attente.</Empty>
      )}
    </>
  );
}
