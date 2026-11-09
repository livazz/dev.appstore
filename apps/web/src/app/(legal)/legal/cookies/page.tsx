import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalTable, Todo } from '@/components/legal/LegalBits';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { getLegalDocument } from '@/lib/legal-versions';

const doc = getLegalDocument('cookies');
export const metadata: Metadata = { title: doc.title, description: doc.description };

const sections: LegalSection[] = [
  {
    id: 'principe',
    title: 'Ce qu’est un cookie',
    body: (
      <p>
        Un cookie (ou traceur) est un petit fichier déposé sur votre appareil lorsque vous visitez un site. Certains sont indispensables au
        fonctionnement du site et ne nécessitent pas votre accord ; les autres (mesure d’audience non exemptée, publicité) ne peuvent être déposés
        qu’avec votre consentement.
      </p>
    ),
  },
  {
    id: 'necessaires',
    title: 'Cookies strictement nécessaires',
    body: (
      <>
        <p>Dev AppStore n’utilise à ce jour que des cookies strictement nécessaires, exemptés de consentement :</p>
        <LegalTable
          caption="Cookies strictement nécessaires"
          head={['Cookie', 'Finalité', 'Durée']}
          rows={[
            [<code key="t">wolleen.session_token</code>, 'Vous garder connecté à votre compte (session sécurisée)', '30 jours, prolongée à l’usage'],
            [<code key="d">wolleen.session_data</code>, 'Cache de session pour accélérer l’affichage, si activé', 'Quelques minutes'],
            [<code key="r">wolleen.dont_remember</code>, 'Mémoriser que vous ne souhaitez pas rester connecté', 'Session du navigateur'],
            [
              'Cookies de Stripe',
              'Sécuriser le paiement et prévenir la fraude, sur la page de paiement hébergée par Stripe',
              'Voir la politique cookies de Stripe',
            ],
          ]}
        />
        <p>
          Le préfixe technique « wolleen » des noms de cookies correspond à l’ancien nom du service et sera renommé ; en HTTPS, les noms sont précédés de <code>__Secure-</code>.{' '}
          <Todo>liste définitive des cookies à valider avant publication</Todo>
        </p>
        <p>
          Votre navigateur peut aussi conserver localement de petites préférences d’affichage (par exemple un onglet ouvert) : elles ne quittent
          pas votre appareil.
        </p>
      </>
    ),
  },
  {
    id: 'audience',
    title: 'Mesure d’audience',
    body: (
      <p>
        Aucun outil de mesure d’audience tiers n’est utilisé à ce jour. Si un outil est ajouté, il sera configuré pour être exempté de
        consentement selon les recommandations de la CNIL ou ne sera activé qu’après votre accord, via un bandeau vous permettant d’accepter ou de
        refuser aussi simplement. <Todo>outil de mesure d’audience retenu, le cas échéant</Todo>
      </p>
    ),
  },
  {
    id: 'publicite',
    title: 'Publicité et réseaux sociaux',
    body: <p>Dev AppStore ne dépose aucun cookie publicitaire ni traceur de réseau social.</p>,
  },
  {
    id: 'gerer',
    title: 'Gérer les cookies',
    body: (
      <>
        <p>
          Vous pouvez supprimer les cookies ou les bloquer depuis les réglages de votre navigateur. Bloquer les cookies strictement nécessaires
          vous empêchera de vous connecter et d’acheter.
        </p>
        <p>
          Pour en savoir plus sur vos données, consultez la <Link href="/legal/confidentialite">Politique de confidentialité</Link>.
        </p>
      </>
    ),
  },
];

export default function CookiesPage() {
  return <LegalDocument slug="cookies" sections={sections} />;
}
