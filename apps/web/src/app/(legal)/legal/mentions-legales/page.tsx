import type { Metadata } from 'next';
import Link from 'next/link';
import { Todo } from '@/components/legal/LegalBits';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { getLegalDocument } from '@/lib/legal-versions';

const doc = getLegalDocument('mentions-legales');
export const metadata: Metadata = { title: doc.title, description: doc.description };

const sections: LegalSection[] = [
  {
    id: 'editeur',
    title: 'Éditeur du site',
    body: (
      <>
        <p>Le site Dev AppStore est édité par :</p>
        <ul>
          <li>
            Raison sociale et forme : <Todo>raison sociale et forme juridique</Todo>
          </li>
          <li>
            Capital social : <Todo>montant</Todo> €
          </li>
          <li>
            Immatriculation : RCS <Todo>ville</Todo>, SIREN <Todo>SIREN</Todo>
          </li>
          <li>
            Siège social : <Todo>adresse</Todo>
          </li>
          <li>
            N° de TVA intracommunautaire : <Todo>n° TVA</Todo>
          </li>
          <li>
            Téléphone : <Todo>numéro</Todo> — e-mail : <Todo>adresse e-mail de contact</Todo>
          </li>
          <li>
            Directeur ou directrice de la publication : <Todo>nom et qualité</Todo>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'hebergeur',
    title: 'Hébergeur',
    body: (
      <ul>
        <li>
          Nom : <Todo>nom de l’hébergeur</Todo>
        </li>
        <li>
          Adresse : <Todo>adresse de l’hébergeur</Todo>
        </li>
        <li>
          Téléphone : <Todo>numéro de l’hébergeur</Todo>
        </li>
      </ul>
    ),
  },
  {
    id: 'place-de-marche',
    title: 'Place de marché et vendeurs',
    body: (
      <>
        <p>
          Dev AppStore est une place de marché : les objets proposés sont vendus par les studios éditeurs des jeux, dont l’identité figure sur la
          page de chaque jeu et sur le reçu d’achat. Les conditions applicables sont décrites dans les{' '}
          <Link href="/legal/cgv">CGV joueurs</Link> et les <Link href="/legal/cgu-studios">conditions studio</Link>.
        </p>
        <p>
          Les principaux paramètres de classement des jeux dans le catalogue et la recherche sont{' '}
          <Todo>paramètres de classement retenus</Todo>. Tout placement rémunéré est signalé comme tel.
        </p>
      </>
    ),
  },
  {
    id: 'signalement',
    title: 'Signalement de contenus illicites',
    body: (
      <p>
        Pour signaler un contenu que vous estimez illicite (boutique, visuel, description d’objet), écrivez à{' '}
        <Todo>adresse de signalement / point de contact unique</Todo> en précisant l’adresse de la page, la nature du contenu et les raisons du
        signalement. Chaque signalement reçoit un accusé de réception et une réponse motivée.
      </p>
    ),
  },
  {
    id: 'mediation',
    title: 'Médiation de la consommation',
    body: (
      <p>
        En cas de litige non résolu avec le support, vous pouvez recourir gratuitement au médiateur de la consommation{' '}
        <Todo>nom, site web et adresse du médiateur</Todo>.
      </p>
    ),
  },
  {
    id: 'propriete',
    title: 'Propriété intellectuelle',
    body: (
      <p>
        La marque Dev AppStore, le logo, la charte graphique et le code du site sont protégés. Les noms, logos, visuels et contenus des jeux
        appartiennent à leurs studios respectifs, qui en autorisent l’affichage sur Dev AppStore. Toute reproduction sans autorisation est
        interdite.
      </p>
    ),
  },
  {
    id: 'donnees',
    title: 'Données personnelles et cookies',
    body: (
      <p>
        Voir la <Link href="/legal/confidentialite">Politique de confidentialité</Link> et la page{' '}
        <Link href="/legal/cookies">Cookies et traceurs</Link>.
      </p>
    ),
  },
  {
    id: 'accessibilite',
    title: 'Accessibilité',
    body: (
      <p>
        Dev AppStore s’attache à rendre le site accessible au plus grand nombre. Pour signaler une difficulté d’accès, écrivez à{' '}
        <Todo>adresse e-mail de contact</Todo>.
      </p>
    ),
  },
];

export default function MentionsLegalesPage() {
  return <LegalDocument slug="mentions-legales" sections={sections} />;
}
