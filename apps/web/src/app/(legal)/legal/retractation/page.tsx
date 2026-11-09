import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, LegalTable, Todo } from '@/components/legal/LegalBits';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { WithdrawalForm } from '@/components/legal/WithdrawalForm';
import { getLegalDocument } from '@/lib/legal-versions';

const doc = getLegalDocument('retractation');
export const metadata: Metadata = { title: doc.title, description: doc.description, alternates: { canonical: doc.href } };

const sections: LegalSection[] = [
  {
    id: 'principe',
    title: 'Le principe : 14 jours',
    body: (
      <p>
        Pour un achat à distance, vous disposez en principe d’un délai de <strong>14 jours</strong> pour vous rétracter, sans avoir à donner de
        motif (article L221-18 du Code de la consommation). Vous êtes alors remboursé dans les 14 jours, par le même moyen de paiement.
      </p>
    ),
  },
  {
    id: 'contenu-numerique',
    title: 'L’exception des objets numériques livrés',
    body: (
      <>
        <p>
          Les objets vendus sur Dev AppStore sont des contenus numériques livrés directement dans votre jeu. Le droit de rétractation{' '}
          <strong>ne s’applique plus</strong> une fois la livraison commencée, à trois conditions réunies (article L221-28 13°) :
        </p>
        <ol>
          <li>vous avez expressément demandé la livraison immédiate, avant la fin du délai de 14 jours ;</li>
          <li>vous avez reconnu perdre votre droit de rétractation ;</li>
          <li>cet accord vous a été confirmé sur un support durable (l’e-mail de confirmation de commande).</li>
        </ol>
        <p>Au moment de payer, ces éléments sont recueillis par une case non pré-cochée :</p>
        <Callout>
          <p>
            ☐ « Je demande la livraison immédiate de mon achat dans le jeu et je reconnais perdre mon droit de rétractation dès que la livraison
            a commencé. »
          </p>
        </Callout>
        <p>Si l’une de ces conditions manque, vous conservez votre droit de rétractation.</p>
      </>
    ),
  },
  {
    id: 'quand',
    title: 'Quand pouvez-vous vous rétracter ?',
    body: (
      <>
        <p>
          Chez Dev AppStore, la livraison est considérée comme commencée lorsque le jeu a crédité votre objet. Le statut affiché dans{' '}
          <Link href="/account/purchases">Mes achats</Link> vous l’indique :
        </p>
        <LegalTable
          caption="Rétractation selon le statut de livraison"
          head={['Statut dans « Mes achats »', 'Rétractation possible ?']}
          rows={[
            [
              'En attente (paiement reçu, objet pas encore crédité)',
              <span key="a">
                <strong className="text-ink">Oui</strong>, dans les 14 jours suivant la commande — la livraison est alors annulée.
              </span>,
            ],
            [
              'Livré ou confirmé par le jeu',
              <span key="b">
                <strong className="text-ink">Non</strong>, si vous avez demandé la livraison immédiate. Les garanties légales (objet non conforme,
                non reçu) restent applicables.
              </span>,
            ],
          ]}
        />
        <p>
          Un objet jamais crédité relève aussi de la garantie légale : voir l’article « Livraison » des{' '}
          <Link href="/legal/cgv#livraison">CGV joueurs</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'bouton',
    title: 'Le bouton « Me rétracter »',
    body: (
      <>
        <p>
          Conformément à la directive (UE) 2023/2673, applicable depuis le 19 juin 2026, Dev AppStore met à votre disposition une{' '}
          <strong>fonction de rétractation en ligne</strong>, gratuite et accessible pendant tout le délai :
        </p>
        <ol>
          <li>
            ouvrez <Link href="/account/purchases">Mes achats</Link> (connexion requise) ;
          </li>
          <li>
            sur la commande concernée, cliquez sur <strong>« Me rétracter »</strong> — le bouton n’est affiché que tant que la commande est
            rétractable ;
          </li>
          <li>confirmez votre demande ;</li>
          <li>
            vous recevez immédiatement un <strong>accusé de réception par e-mail</strong>, avec la date et l’heure de votre rétractation.
          </li>
        </ol>
        <p>
          La livraison dans le jeu est annulée et vous êtes remboursé sous 14 jours au plus tard, par le même moyen de paiement, sans frais.
        </p>
      </>
    ),
  },
  {
    id: 'formulaire',
    title: 'Formulaire type de rétractation',
    body: (
      <>
        <p>
          Vous pouvez aussi vous rétracter par toute déclaration dénuée d’ambiguïté, notamment en envoyant le formulaire ci-dessous (modèle de
          l’annexe à l’article R221-1 du Code de la consommation) à <Todo>raison sociale, adresse postale et adresse e-mail de l’éditeur</Todo>.
          Son utilisation n’est pas obligatoire.
        </p>
        <WithdrawalForm />
      </>
    ),
  },
  {
    id: 'remboursement',
    title: 'Remboursement',
    body: (
      <ul>
        <li>remboursement intégral au plus tard 14 jours après réception de votre rétractation ;</li>
        <li>même moyen de paiement que celui utilisé pour la commande, sauf accord exprès de votre part ;</li>
        <li>aucun frais ne vous est facturé ;</li>
        <li>l’objet n’est pas crédité dans le jeu (ou en est retiré s’il l’avait été entre-temps).</li>
      </ul>
    ),
  },
  {
    id: 'aide',
    title: 'Besoin d’aide ?',
    body: (
      <p>
        Contactez le support : <Todo>adresse e-mail ou formulaire du support</Todo>. En cas de litige non résolu, vous pouvez recourir
        gratuitement au médiateur de la consommation <Todo>nom et coordonnées du médiateur</Todo>.
      </p>
    ),
  },
];

export default function RetractationPage() {
  return (
    <LegalDocument
      slug="retractation"
      intro={
        <p>
          En bref : tant que votre objet n’est <strong>pas encore livré</strong> dans le jeu, vous pouvez vous rétracter en un clic depuis{' '}
          <Link href="/account/purchases">Mes achats</Link>. Une fois l’objet livré, la rétractation n’est plus possible si vous avez demandé la
          livraison immédiate.
        </p>
      }
      sections={sections}
    />
  );
}
