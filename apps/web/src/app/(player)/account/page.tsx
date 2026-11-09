import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_METHOD_LABELS, listUserGameLinks } from '@/server/linking';
import { requireUser } from '@/server/session';
import { UnlinkButton } from './UnlinkButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mon compte', robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export default async function AccountPage() {
  const user = await requireUser('/account');
  const links = await listUserGameLinks(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Mon compte</h1>
      <p className="mt-1 text-sm text-ink-2">
        {user.name} · {user.email}
      </p>

      <nav aria-label="Sections du compte" className="mt-6 flex flex-wrap gap-x-6 border-b border-line text-sm">
        <span aria-current="page" className="-mb-px border-b-2 border-ink pb-2 font-semibold text-ink">
          Mes jeux liés
        </span>
        <Link href="/account/purchases" className="pb-2 text-ink-2 transition hover:text-ink">
          Historique des achats
        </Link>
        <Link href="/account/points" className="pb-2 text-ink-2 transition hover:text-ink">
          Points Dev AppStore
        </Link>
      </nav>

      <section aria-labelledby="linked-games" className="mt-6">
        <h2 id="linked-games" className="sr-only">
          Mes jeux liés
        </h2>
        {links.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-line bg-surface px-6 py-10 text-center">
            <p className="font-medium text-ink">Aucun jeu lié pour l&apos;instant</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
              Liez votre compte de jeu depuis la boutique d&apos;un jeu : vos achats y seront livrés automatiquement.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Parcourir les jeux
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-4 px-4 py-3.5">
                {l.gameIconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- icônes en data: URL ou /api/uploads
                  <img src={l.gameIconUrl} alt="" className="h-12 w-12 shrink-0 rounded-[11px] border border-line object-cover" />
                ) : (
                  <div aria-hidden className="h-12 w-12 shrink-0 rounded-[11px] bg-brand" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/games/${encodeURIComponent(l.gameSlug)}`} className="font-semibold text-ink hover:underline">
                    {l.gameName}
                  </Link>
                  <p className="truncate text-sm text-ink-2">
                    {l.playerName || l.playerId}
                    {l.playerName && <span className="font-mono text-ink-3"> · {l.playerId}</span>}
                  </p>
                  <p className="text-xs text-ink-3">
                    {LINK_METHOD_LABELS[l.method]} · {l.verified === 1 ? 'vérifié' : 'non vérifié'} · lié le {dateFmt.format(l.createdAt)}
                  </p>
                </div>
                <UnlinkButton linkId={l.id} gameName={l.gameName} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
