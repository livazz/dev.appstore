import Link from 'next/link';
import { requireAdminPermission } from '@/server/admin';
import { parsePage } from '@/server/admin-logic';
import { listReviewsForAdmin } from '@/server/reviews';
import type { ReviewStatus } from '@devappstore/db';
import { Badge, Card, Empty, Mono, PageHeader, SearchForm, Time } from '@/components/admin/ui';
import { Stars } from '@/components/reviews/Stars';
import { ReviewModerationForm } from '@/components/reviews/ReviewModerationForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avis des joueurs' };

const FILTERS: { value: ReviewStatus | ''; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'visible', label: 'Visibles' },
  { value: 'hidden', label: 'Masqués' },
];

/**
 * Modération a posteriori des avis des joueurs : masquer un avis hors charte (insultes, données personnelles, spam,
 * hors sujet) ou le réafficher. Chaque décision est journalisée (`review.hide` / `review.show`, cible : le jeu).
 * Réservé aux rôles ayant `reports.moderate` (sinon 404).
 */
export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  await requireAdminPermission('reports.moderate');
  const sp = await searchParams;
  const status = sp.status === 'visible' || sp.status === 'hidden' ? sp.status : null;
  const q = (sp.q ?? '').slice(0, 100);
  const page = parsePage(sp.page);
  const { rows, hasMore, hiddenTotal } = await listReviewsForAdmin({ status, q, page });
  const href = (over: Record<string, string | number | null>) => {
    const qs = new URLSearchParams();
    const merged = { status, q: q || null, page: null as number | null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, String(v));
    const s = qs.toString();
    return `/admin/reviews${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageHeader title="Avis des joueurs">
        <p className="text-sm text-ink-2">{hiddenTotal ? `${hiddenTotal} avis masqué${hiddenTotal > 1 ? 's' : ''}` : 'Aucun avis masqué'}</p>
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchForm action="/admin/reviews" defaultValue={q} label="Rechercher un avis" placeholder="Jeu, auteur, texte ou identifiant" hidden={{ status: status ?? undefined }} />
        <nav aria-label="Filtrer par statut" className="flex gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href({ status: f.value || null })}
              aria-current={(status ?? '') === f.value ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${(status ?? '') === f.value ? 'bg-ink text-white' : 'text-ink-2 ring-1 ring-line hover:bg-bg'}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length ? (
        <ol className="flex flex-col gap-3" aria-label="Avis">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_16rem]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <Stars value={r.rating} size="sm" label={`${r.rating} sur 5`} />
                      <Link href={`/admin/games/${r.gameId}`} className="font-semibold hover:underline">
                        {r.gameName}
                      </Link>
                      <span className="text-ink-2">
                        {r.authorName} · {r.hasAccount ? 'compte joueur' : 'avis de démo'}
                      </span>
                      {r.status === 'hidden' ? <Badge label="Masqué" cls="bg-danger/10 text-danger" /> : <Badge label="Visible" cls="bg-ok/10 text-ok" />}
                    </div>
                    <p className="mt-2 whitespace-pre-line break-words text-sm">{r.body}</p>
                    <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-2">
                      <Time date={r.createdAt} />
                      <span>
                        Réf. <Mono>{r.id}</Mono>
                      </span>
                      <Link href={`/games/${r.gameSlug}#avis`} className="text-primary hover:underline">
                        Voir sur la page du jeu
                      </Link>
                    </p>
                  </div>
                  <ReviewModerationForm reviewId={r.id} status={r.status} />
                </div>
              </Card>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>Aucun avis ne correspond à ces critères.</Empty>
      )}

      {(page > 1 || hasMore) && (
        <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="text-primary hover:underline">
              ← Plus récents
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={href({ page: page + 1 })} className="text-primary hover:underline">
              Plus anciens →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
