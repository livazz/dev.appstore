import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_CODE_TTL_MS } from '@devappstore/core';
import { getGameLink } from '@/server/links';
import { LINK_METHOD_LABELS, availableLinkMethods, getLinkableGame, linkReturnPath } from '@/server/linking';
import { requireUser } from '@/server/session';
import { CodeForm } from './CodeForm';
import { IdConfirmForm } from './IdConfirmForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lier mon compte de jeu — Dev AppStore' };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

const card = 'rounded-[var(--radius)] border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const btnPrimary = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95';
const btnSecondary = 'inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-bg';
const btnCancel = 'inline-flex items-center justify-center rounded-lg bg-cancel px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95';

export default async function LinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const item = typeof sp.item === 'string' && sp.item ? sp.item : undefined;
  const changing = sp.change === '1';
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(item ? { item } : {}), ...extra }).toString();
    return p ? `?${p}` : '';
  };
  const self = `/games/${encodeURIComponent(slug)}/link`;

  const user = await requireUser(`${self}${qs(changing ? { change: '1' } : {})}`);
  const game = await getLinkableGame(slug, user.id);
  if (!game) notFound();
  const [link, returnPath] = await Promise.all([getGameLink(user.id, game.id), linkReturnPath(game, item)]);
  const methods = availableLinkMethods(game);
  const ttlMin = Math.round(LINK_CODE_TTL_MS / 60_000);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <header className="flex items-center gap-4">
        {game.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- icônes en data: URL ou /api/uploads
          <img src={game.iconUrl} alt="" className="h-16 w-16 shrink-0 rounded-[14px] border border-line object-cover" />
        ) : (
          <div aria-hidden className="h-16 w-16 shrink-0 rounded-[14px] bg-brand" />
        )}
        <div className="min-w-0">
          <p className="text-sm text-ink-3">Liaison du compte de jeu</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{game.name}</h1>
        </div>
      </header>

      {link && !changing ? (
        <>
          <p className="mt-6 text-ink-2">Vos achats sur Dev AppStore sont livrés automatiquement à ce compte {game.name}.</p>
          <section className={`${card} mt-4`} aria-labelledby="linked-title">
            <p id="linked-title" className="text-xs font-medium uppercase tracking-wide text-ink-3">
              Compte lié
            </p>
            <p className="mt-1 text-lg font-semibold text-ink">{link.playerName || link.playerId}</p>
            <p className="text-sm text-ink-2">
              ID joueur : <span className="font-mono">{link.playerId}</span>
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <VerifiedBadge verified={link.verified === 1} />
              <span>{LINK_METHOD_LABELS[link.method]}</span>
              <span aria-hidden>·</span>
              <span>lié le {dateFmt.format(link.createdAt)}</span>
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Link href={`${self}${qs({ change: '1' })}`} className={btnSecondary}>
                Changer de compte
              </Link>
              <Link href={returnPath} className={btnPrimary}>
                {item ? "Continuer l'achat" : 'Aller à la boutique'}
              </Link>
            </div>
          </section>
        </>
      ) : (
        <>
          <p className="mt-6 text-ink-2">
            Pour recevoir vos achats directement dans {game.name}, indiquez à Dev AppStore le compte de jeu à créditer. Vous ne le
            faites qu&apos;une fois.
          </p>
          {link && (
            <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-2">
              Actuellement lié à <strong className="text-ink">{link.playerName || link.playerId}</strong>. La nouvelle liaison
              remplacera celle-ci.
            </p>
          )}

          {methods.length === 0 && (
            <section className={`${card} mt-6`}>
              <p className="text-ink-2">Ce jeu ne propose pas encore de liaison de compte en ligne. Revenez bientôt !</p>
            </section>
          )}

          {methods.includes('code') && (
            <section className={`${card} mt-6`} aria-labelledby="method-code">
              {/* Pas de badge « Vérifié » ici : un code demandé par le client du jeu (clé publique) donne un lien déclaratif. */}
              <h2 id="method-code" className="text-base font-semibold text-ink">
                Avec le code affiché dans le jeu
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                Dans {game.name}, ouvrez la boutique web ou les réglages du compte et choisissez « Lier à Dev AppStore » : un code de 8
                caractères s&apos;affiche. Il est valable {ttlMin} minutes.
              </p>
              <CodeForm slug={game.slug} item={item} />
            </section>
          )}

          {methods.length > 1 && (
            <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              ou
              <span className="h-px flex-1 bg-line" />
            </div>
          )}

          {methods.includes('id_confirm') && (
            <section className={`${card} ${methods.length > 1 ? '' : 'mt-6'}`} aria-labelledby="method-id">
              <h2 id="method-id" className="text-base font-semibold text-ink">
                Avec votre identifiant joueur
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                Votre identifiant figure dans le profil du jeu. Nous vous montrerons le compte trouvé pour que vous le confirmiez.
              </p>
              <IdConfirmForm slug={game.slug} item={item} />
            </section>
          )}

          <div className="mt-8 flex justify-start">
            <Link href={link ? `${self}${qs({})}` : `/games/${encodeURIComponent(game.slug)}`} className={btnCancel}>
              Annuler
            </Link>
          </div>
        </>
      )}
    </main>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok">✓ Vérifié</span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-ink-3/10 px-2 py-0.5 text-xs font-medium text-ink-2">Non vérifié</span>
  );
}
