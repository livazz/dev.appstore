import Link from 'next/link';
import { A, C, DocPage, H2, P } from '@/components/docs/prose';
import { docPageMetadata } from '@/lib/seo';
import { DOC_PAGES, docHref } from '@/lib/docs/nav';

export const metadata = docPageMetadata('');

const FLOW = [
  { n: '1', title: 'Le joueur trouve votre jeu', text: 'Sur le catalogue Dev AppStore, il ouvre la boutique web que vous avez composée.' },
  { n: '2', title: 'Il lie son compte de jeu', text: 'Une seule fois par jeu : code affiché dans le jeu, ou identifiant joueur confirmé.' },
  { n: '3', title: 'Il achète', text: 'Paiement par carte sur le web. Vous gardez l’essentiel du revenu.' },
  { n: '4', title: 'Le jeu reçoit l’achat', text: 'Par webhook signé vers votre serveur, ou par le SDK dans le client. Vous créditez, puis acquittez.' },
];

export default function DocsHome() {
  return (
    <DocPage slug="">
      <H2 id="principe">Le principe</H2>
      <P>
        Dev AppStore est une place de marché web pour les achats in-app. Vous configurez une boutique pour votre jeu (articles, prix,
        habillage), les joueurs y achètent avec leur compte lié, et chaque achat est <strong>livré automatiquement</strong> à votre jeu.
        L’intégration tient en trois appels : demander un code de liaison, recevoir les achats, les acquitter.
      </P>
      <P>
        L’API publique est versionnée sous <C>/api/v1</C> et s’authentifie avec la clé API de votre jeu. Les montants sont toujours en
        centimes (<C>amount_cents</C>) avec une devise ISO (<C>EUR</C>, <C>USD</C>, <C>GBP</C>).
      </P>

      <H2 id="parcours">Parcours du joueur</H2>
      <ol className="my-6 grid gap-3 sm:grid-cols-2">
        {FLOW.map((s) => (
          <li key={s.n} className="rounded-[var(--radius)] border border-line bg-surface p-4">
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-brand text-sm font-bold text-ink">
              {s.n}
            </span>
            <p className="mt-3 font-semibold text-ink">{s.title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
      <P>
        Les détails de chaque étape sont dans <A href="/docs/concepts">Concepts</A>.
      </P>

      <H2 id="sommaire">Par où commencer</H2>
      <ul className="my-6 grid gap-3 sm:grid-cols-2">
        {DOC_PAGES.filter((p) => p.slug).map((p) => (
          <li key={p.slug}>
            <Link
              href={docHref(p.slug)}
              className="block h-full rounded-[var(--radius)] border border-line bg-surface p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="font-semibold text-ink">{p.title}</span>
              <span className="mt-1 block text-sm leading-6 text-ink-2">{p.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </DocPage>
  );
}
