import type { Metadata } from 'next';
import Link from 'next/link';
import { DEFAULT_PLATFORM_FEE_BPS, STORE_FEE_BPS, feeCents, formatMoney } from '@wolleen/core';
import { EditorPreview } from '@/components/marketing/EditorPreview';
import { Faq, type FaqEntry } from '@/components/marketing/Faq';
import { SavingsCalculator } from '@/components/marketing/SavingsCalculator';
import { bpsToPercentLabel, keptPercentLabel } from '@/components/marketing/savings';

const KEPT_WOLLEEN = keptPercentLabel(DEFAULT_PLATFORM_FEE_BPS);
const KEPT_STORES = keptPercentLabel(STORE_FEE_BPS);

export const metadata: Metadata = {
  title: 'Wolleen pour les studios — gardez ~95 % de vos ventes in-app',
  description: `Vendez vos objets in-app sur le web : gardez environ ${KEPT_WOLLEEN} du revenu au lieu de ${KEPT_STORES}, livraison automatique dans le jeu par webhook signé ou SDK.`,
};

const SIGNUP_HREF = '/studio/signup';
/** Vente d'exemple du comparatif (centimes). */
const SAMPLE_CENTS = 1000;

const ctaPrimary =
  'inline-flex items-center justify-center rounded-[var(--radius)] bg-primary px-5 py-3 font-semibold text-white shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const ctaSecondary =
  'inline-flex items-center justify-center rounded-[var(--radius)] border border-line bg-surface px-5 py-3 font-semibold text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const STEPS = [
  {
    title: 'Créez votre boutique',
    text: "Importez vos visuels et composez votre boutique avec l'éditeur visuel : cartes, couleurs, prix, abonnements. Aucune compétence web requise.",
  },
  {
    title: 'Intégrez en une journée',
    text: 'Branchez le SDK (JavaScript, Unity) ou recevez un webhook signé sur votre serveur. Vos joueurs lient leur compte de jeu une seule fois, avec un code affiché en jeu.',
  },
  {
    title: 'Le jeu se met à jour tout seul',
    text: 'Vos joueurs achètent sur le web, moins cher. Wolleen livre l’achat au jeu automatiquement, en quelques secondes, sans action de leur part.',
  },
];

const GUARANTEES = [
  {
    title: 'Webhooks signés HMAC',
    text: 'Chaque livraison porte une signature horodatée (en-tête Wolleen-Signature) que votre serveur vérifie avant de créditer : impossible de forger un achat.',
  },
  {
    title: 'Livraison garantie',
    text: 'Si votre serveur ne répond pas, Wolleen relance automatiquement pendant 24 h et plus. Le SDK récupère aussi les achats en attente au lancement du jeu.',
  },
  {
    title: 'Jamais de double crédit',
    text: "Chaque livraison a un identifiant unique servant de clé d'idempotence, et le jeu confirme la réception (ack). Vous suivez chaque statut dans le journal.",
  },
  {
    title: 'Paiements sécurisés',
    text: "Les paiements sont traités par Stripe : Wolleen ne stocke jamais les numéros de carte. Les reversements arrivent sur votre compte via Stripe Connect.",
  },
];

const FAQ: FaqEntry[] = [
  {
    question: 'Est-ce compatible avec les règles d’Apple et de Google ?',
    answer: (
      <>
        <p>
          Les règles des stores sur les achats effectués en dehors de l’application varient selon les pays et évoluent régulièrement
          (décisions de justice, réglementations comme le DMA en Europe). Dans de nombreux cas, un joueur peut acheter sur le web un
          contenu qu’il retrouve ensuite dans le jeu ; en revanche, la possibilité de mentionner ou de lier ce site depuis
          l’application dépend de votre région et de votre programme.
        </p>
        <p>
          <strong className="text-ink">À vérifier selon votre région</strong> : consultez les conditions en vigueur d’Apple et de
          Google, et si besoin votre conseil juridique, avant de communiquer sur Wolleen dans votre jeu.
        </p>
      </>
    ),
  },
  {
    question: 'Combien coûte Wolleen ?',
    answer: (
      <p>
        Aucun abonnement ni frais d’installation : Wolleen prélève une commission de {bpsToPercentLabel(DEFAULT_PLATFORM_FEE_BPS)} sur
        chaque vente, contre {bpsToPercentLabel(STORE_FEE_BPS)} au taux standard des stores. Vous gardez donc environ {KEPT_WOLLEEN} du
        prix payé par le joueur (hors taxes applicables).
      </p>
    ),
  },
  {
    question: 'Dois-je retirer mes achats in-app des stores ?',
    answer: (
      <p>
        Non. Wolleen vient en complément : vos joueurs gardent le choix d’acheter dans l’application ou sur le web, où vous pouvez
        proposer un meilleur prix. Le calculateur ci-dessus vous permet d’estimer l’effet d’une bascule partielle.
      </p>
    ),
  },
  {
    question: 'Combien de temps prend l’intégration ?',
    answer: (
      <p>
        Une journée en général : un point d’entrée webhook (ou quelques lignes de SDK) pour créditer le joueur, et l’affichage d’un
        code de liaison dans le jeu. Un jeu de démonstration et des clés de test sont fournis.
      </p>
    ),
  },
  {
    question: 'Comment le joueur relie-t-il son compte de jeu ?',
    answer: (
      <p>
        Une seule fois par jeu : le jeu affiche un code temporaire que le joueur saisit sur Wolleen, ou le joueur indique son
        identifiant et confirme son pseudo. Ensuite, chaque achat est livré automatiquement sur le bon compte.
      </p>
    ),
  },
  {
    question: 'Quand suis-je payé ?',
    answer: (
      <p>
        Les reversements passent par Stripe Connect, selon le calendrier de versement de votre compte Stripe. Vous suivez vos ventes
        et tendances dans l’espace studio.
      </p>
    ),
  },
];

function SectionTitle({ id, kicker, title, intro }: { id: string; kicker: string; title: string; intro?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">{kicker}</p>
      <h2 id={id} className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {intro ? <p className="mt-3 text-ink-2">{intro}</p> : null}
    </div>
  );
}

export default function StudiosPage() {
  return (
    <>
      {/* Promesse */}
      <section aria-labelledby="promesse-titre" className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brand/30 px-3 py-1 text-sm font-semibold">
              <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
              Pour les studios de jeux mobiles
            </p>
            <h1 id="promesse-titre" className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
              Gardez ~{KEPT_WOLLEEN} de vos ventes in-app, pas {KEPT_STORES}.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">
              Vendez vos objets in-app sur le web. Vos joueurs paient moins cher, vous gagnez plus, et le jeu reçoit chaque achat
              automatiquement.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={SIGNUP_HREF} className={ctaPrimary}>
                Créer mon espace studio
              </Link>
              <a href="#calculateur" className={ctaSecondary}>
                Estimer mes gains
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-bg p-6" role="group" aria-labelledby="comparatif-titre">
            <p id="comparatif-titre" className="font-semibold">
              Sur une vente de {formatMoney(SAMPLE_CENTS)}, vous recevez
            </p>
            <dl className="mt-5 space-y-5">
              <div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-ink-2">Via les stores ({bpsToPercentLabel(STORE_FEE_BPS)})</dt>
                  <dd className="text-xl font-bold tabular-nums">{formatMoney(SAMPLE_CENTS - feeCents(SAMPLE_CENTS, STORE_FEE_BPS))}</dd>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <div className="h-full rounded-full bg-ink-3" style={{ width: `${(10_000 - STORE_FEE_BPS) / 100}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-ink-2">Via Wolleen ({bpsToPercentLabel(DEFAULT_PLATFORM_FEE_BPS)})</dt>
                  <dd className="text-xl font-bold text-ok tabular-nums">
                    {formatMoney(SAMPLE_CENTS - feeCents(SAMPLE_CENTS, DEFAULT_PLATFORM_FEE_BPS))}
                  </dd>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <div className="h-full rounded-full bg-ok" style={{ width: `${(10_000 - DEFAULT_PLATFORM_FEE_BPS) / 100}%` }} />
                </div>
              </div>
            </dl>
            <p className="mt-5 text-xs text-ink-3">Taux standard des stores, hors taxes. Certains programmes appliquent un taux réduit.</p>
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section aria-labelledby="etapes-titre" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionTitle id="etapes-titre" kicker="Comment ça marche" title="En ligne en trois étapes" />
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-line bg-surface p-6">
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-brand text-lg font-black">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-bold">
                <span className="sr-only">Étape {i + 1} : </span>
                {step.title}
              </h3>
              <p className="mt-2 text-ink-2">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Calculateur */}
      <section id="calculateur" aria-labelledby="calculateur-titre" className="scroll-mt-20 border-y border-line bg-surface/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionTitle
            id="calculateur-titre"
            kicker="Calculateur d'économies"
            title="Combien gagneriez-vous en plus ?"
            intro="Indiquez votre revenu mensuel d'achats in-app et la part de ventes que vous pensez faire passer sur le web."
          />
          <SavingsCalculator storeFeeBps={STORE_FEE_BPS} platformFeeBps={DEFAULT_PLATFORM_FEE_BPS} />
        </div>
      </section>

      {/* Aperçu de l'éditeur */}
      <section aria-labelledby="editeur-titre" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <EditorPreview />
      </section>

      {/* Sécurité et livraison */}
      <section aria-labelledby="securite-titre" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionTitle
            id="securite-titre"
            kicker="Sécurité et fiabilité"
            title="Chaque achat arrive dans le jeu, une seule fois"
            intro="La livraison automatique est le cœur de Wolleen : vos joueurs n'ont rien à faire, et vous gardez le contrôle."
          />
          <ul className="grid gap-6 sm:grid-cols-2">
            {GUARANTEES.map((g) => (
              <li key={g.title} className="rounded-2xl border border-line bg-bg p-6">
                <h3 className="text-lg font-bold">{g.title}</h3>
                <p className="mt-2 text-ink-2">{g.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-titre" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionTitle id="faq-titre" kicker="FAQ" title="Questions fréquentes" />
        <Faq entries={FAQ} />
      </section>

      {/* CTA final */}
      <section aria-labelledby="cta-titre" className="px-4 pb-20 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-3xl bg-ink px-6 py-14 text-center text-white">
          <h2 id="cta-titre" className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            Prêt à garder ~{KEPT_WOLLEEN} de vos ventes ?
          </h2>
          <p className="max-w-xl text-white/80">
            Créez votre espace studio gratuitement, composez votre boutique et testez la livraison avec nos clés de démonstration.
          </p>
          <Link
            href={SIGNUP_HREF}
            className="inline-flex items-center justify-center rounded-[var(--radius)] bg-brand px-6 py-3 font-bold text-ink hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Créer mon espace studio
          </Link>
        </div>
      </section>
    </>
  );
}
