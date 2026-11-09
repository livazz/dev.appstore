import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, LegalTable, Todo } from '@/components/legal/LegalBits';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { getLegalDocument } from '@/lib/legal-versions';

const doc = getLegalDocument('cgv');
export const metadata: Metadata = { title: doc.title, description: doc.description, alternates: { canonical: doc.href } };

const sections: LegalSection[] = [
  {
    id: 'objet',
    title: 'Objet et parties',
    body: (
      <>
        <p>
          Les présentes conditions (les « <strong>Conditions</strong> ») régissent l’utilisation du site Dev AppStore (
          <Todo>nom de domaine</Todo>) et les achats d’objets numériques destinés à des jeux vidéo (les « <strong>Objets</strong> »).
        </p>
        <p>
          Le site est édité par <Todo>raison sociale et forme</Todo>, au capital de <Todo>capital social</Todo> €, immatriculée au RCS de{' '}
          <Todo>ville</Todo> sous le numéro <Todo>SIREN</Todo>, dont le siège est situé <Todo>adresse du siège</Todo>, n° de TVA intracommunautaire{' '}
          <Todo>n° TVA</Todo>, contact : <Todo>adresse e-mail du support</Todo> (« <strong>Dev AppStore</strong> »).
        </p>
        <p>
          <strong>Dev AppStore est une place de marché.</strong> Chaque Objet est vendu par l’éditeur du jeu concerné (le « <strong>Studio</strong> »),
          dont l’identité (dénomination, adresse, immatriculation) figure sur la page du jeu et sur votre reçu.{' '}
          <strong>Le contrat de vente est conclu entre vous et le Studio.</strong> Dev AppStore fournit le site, le compte, la liaison avec votre
          compte de jeu, l’encaissement via son prestataire de paiement et l’acheminement technique de l’achat jusqu’au jeu.
        </p>
        <p>Répartition des responsabilités :</p>
        <LegalTable
          caption="Répartition des responsabilités entre Dev AppStore et le Studio"
          head={['Sujet', 'Responsable']}
          rows={[
            ['Fonctionnement du site, compte Dev AppStore, paiement', 'Dev AppStore'],
            ['Description, prix et contenu de l’Objet', 'Studio'],
            ['Crédit de l’Objet dans le jeu', 'Studio (Dev AppStore achemine la commande)'],
            ['Support « je n’ai pas reçu mon Objet »', 'Dev AppStore en premier niveau, puis le Studio'],
            ['Fonctionnement du jeu, règles du jeu, compte de jeu', 'Studio (conditions du jeu)'],
            ['Remboursements', 'Dev AppStore les exécute pour le compte du Studio'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'acceptation',
    title: 'Acceptation et modification',
    body: (
      <>
        <p>
          Toute commande suppose l’acceptation des Conditions en vigueur au jour de la commande, par une case à cocher. La version acceptée
          (datée en tête de ce document) est enregistrée avec votre commande et rappelée dans l’e-mail de confirmation, qui contient un lien vers
          ces Conditions.
        </p>
        <p>
          Dev AppStore peut modifier les Conditions ; les modifications s’appliquent aux commandes postérieures à leur mise en ligne. Les
          modifications substantielles des conditions du compte vous sont notifiées <Todo>délai de préavis, ex. 30</Todo> jours à l’avance.
        </p>
      </>
    ),
  },
  {
    id: 'compte',
    title: 'Compte Dev AppStore et âge',
    body: (
      <>
        <p>L’achat nécessite un compte. Vous devez fournir des informations exactes et garder vos identifiants confidentiels.</p>
        <p>
          <strong>Âge</strong> : le compte est ouvert aux personnes <strong>majeures</strong>, ainsi qu’aux mineurs{' '}
          <strong>
            âgés d’au moins <Todo>âge minimal, ex. 13</Todo> ans
          </strong>{' '}
          avec l’<strong>autorisation de leur représentant légal</strong>, qui reste responsable des achats effectués. Des{' '}
          <strong>plafonds de dépense</strong> (<Todo>montant par jour et par mois</Todo>) s’appliquent par défaut aux comptes de mineurs ; le
          représentant légal peut les modifier.
        </p>
        <p>
          En cas d’achat effectué par un mineur sans autorisation, le représentant légal peut contacter le support : chaque demande est examinée
          et peut donner lieu à remboursement, l’Objet étant alors retiré du jeu.
        </p>
      </>
    ),
  },
  {
    id: 'liaison',
    title: 'Liaison du compte de jeu',
    body: (
      <>
        <p>Pour recevoir un Objet, vous liez votre compte Dev AppStore à votre compte dans le jeu, selon les méthodes proposées par le Studio :</p>
        <ul>
          <li>
            <strong>par code</strong> : le jeu affiche un code que vous saisissez sur Dev AppStore (liaison vérifiée) ;
          </li>
          <li>
            <strong>par identifiant</strong> : vous saisissez votre identifiant de joueur et confirmez le nom de joueur affiché (liaison
            déclarative).
          </li>
        </ul>
        <p>
          <strong>Liaison par identifiant</strong> : vous êtes responsable de l’exactitude de l’identifiant saisi et de la confirmation du nom
          affiché. Si un Objet est livré sur un compte de jeu que vous avez désigné par erreur, Dev AppStore et le Studio feront leurs meilleurs
          efforts pour le transférer ou vous rembourser lorsque le crédit peut être annulé, sans obligation de résultat.
        </p>
        <p>
          Vous pouvez délier un compte de jeu à tout moment depuis <Link href="/account">Mon compte</Link>. Les Objets déjà livrés restent sur le
          compte de jeu.
        </p>
      </>
    ),
  },
  {
    id: 'objets-prix',
    title: 'Objets, prix et informations',
    body: (
      <>
        <p>
          Chaque page présente les caractéristiques essentielles de l’Objet (contenu, quantité, jeu, plateformes concernées) et, pour une monnaie
          virtuelle, son <strong>prix en euros</strong> et un prix de référence par unité.
        </p>
        <p>
          <strong>Objets aléatoires</strong> : les probabilités d’obtention de chaque type d’objet sont affichées avant l’achat. Leur vente est
          désactivée dans les pays où elle est interdite.
        </p>
        <p>
          Les prix sont indiqués <strong>en euros toutes taxes comprises</strong> (TVA du pays de résidence incluse). Toute annonce de réduction
          est calculée par rapport au prix le plus bas pratiqué au cours des 30 jours précédents.
        </p>
        <p>
          Un Objet est une <strong>licence d’utilisation personnelle, non exclusive et non cessible</strong> d’un contenu numérique dans le jeu,
          régie aussi par les conditions du jeu. Il n’a <strong>aucune valeur monétaire</strong>, n’est ni remboursable en espèces (hors cas
          légaux), ni échangeable, ni revendable hors des mécanismes prévus par le jeu.
        </p>
      </>
    ),
  },
  {
    id: 'commande',
    title: 'Commande',
    body: (
      <>
        <p>Les étapes de la commande sont les suivantes :</p>
        <ol>
          <li>choix de l’Objet ;</li>
          <li>vérification du compte de jeu lié ;</li>
          <li>récapitulatif : Objet, compte de jeu destinataire, prix TTC, Studio vendeur ;</li>
          <li>acceptation des Conditions ;</li>
          <li>
            <strong>demande de livraison immédiate et renonciation au droit de rétractation</strong> (voir <a href="#retractation">article 9</a>)
            ;
          </li>
          <li>
            bouton « <strong>Payer [montant]</strong> » puis paiement.
          </li>
        </ol>
        <p>
          La commande est ferme à la confirmation du paiement. Un <strong>e-mail de confirmation</strong> vous est adressé sur support durable ;
          il reprend le détail de la commande, le vendeur, les Conditions et la confirmation de votre demande de livraison immédiate et de votre
          renonciation.
        </p>
        <p>
          Dev AppStore peut refuser ou annuler une commande en cas de suspicion de fraude, de liaison invalide ou d’indisponibilité de l’Objet ;
          vous êtes alors intégralement remboursé.
        </p>
      </>
    ),
  },
  {
    id: 'paiement',
    title: 'Paiement',
    body: (
      <>
        <p>
          Le paiement est traité par <strong>Stripe</strong> (<Todo>entité Stripe contractante</Todo>). Dev AppStore n’a pas accès à vos données
          de carte. Une authentification forte (3-D Secure) peut être demandée.
        </p>
        <p>
          Le libellé apparaissant sur votre relevé bancaire est « <Todo>libellé bancaire, ex. DEVAPPSTORE* NOM DU JEU</Todo> ».
        </p>
      </>
    ),
  },
  {
    id: 'livraison',
    title: 'Livraison',
    body: (
      <>
        <p>
          Après paiement, la commande est transmise automatiquement au jeu. L’Objet est en principe crédité <strong>en quelques secondes</strong>,
          ou à la <strong>prochaine ouverture du jeu</strong> si celui-ci n’est pas lancé.
        </p>
        <p>
          Le statut de livraison est visible dans <Link href="/account/purchases">Mes achats</Link> (en attente, livré, confirmé par le jeu).
        </p>
        <p>
          <strong>Défaut de livraison</strong> : si l’Objet n’est pas crédité dans un délai de <Todo>délai, ex. 72 heures</Todo> après le
          paiement alors que vous avez lancé le jeu, contactez le support. À défaut de livraison dans un délai supplémentaire raisonnable après
          votre demande, vous pouvez <strong>résoudre le contrat</strong> et êtes <strong>remboursé intégralement</strong> dans les 14 jours.
        </p>
      </>
    ),
  },
  {
    id: 'retractation',
    title: 'Droit de rétractation',
    body: (
      <>
        <p>
          Vous disposez en principe d’un délai de <strong>14 jours</strong> pour vous rétracter d’un achat à distance.
        </p>
        <p>
          <strong>Exception</strong> : conformément à l’article L221-28 13° du Code de la consommation,{' '}
          <strong>le droit de rétractation ne peut être exercé</strong> pour un contenu numérique non fourni sur support matériel{' '}
          <strong>dont la livraison a commencé</strong>, lorsque vous avez, avant la commande : (i) <strong>expressément demandé</strong> la
          livraison immédiate, et (ii) <strong>reconnu perdre</strong> votre droit de rétractation ; et que cette demande vous a été{' '}
          <strong>confirmée</strong> sur support durable.
        </p>
        <p>Ces éléments sont recueillis par la case suivante, non pré-cochée :</p>
        <Callout>
          <p>
            ☐ « Je demande la livraison immédiate de mon achat dans le jeu et je reconnais perdre mon droit de rétractation dès que la livraison
            a commencé. »
          </p>
        </Callout>
        <p>
          Tant que la livraison n’a pas commencé (statut « en attente »), vous pouvez vous rétracter via le <strong>bouton « Me rétracter »</strong>{' '}
          disponible dans <Link href="/account/purchases">Mes achats</Link> ou en envoyant le{' '}
          <Link href="/legal/retractation#formulaire">formulaire type de rétractation</Link> à <Todo>adresse postale et e-mail de l’éditeur</Todo>.
          Le remboursement intervient dans les 14 jours, par le même moyen de paiement ; la livraison est alors annulée.
        </p>
      </>
    ),
  },
  {
    id: 'conformite',
    title: 'Garantie légale de conformité',
    body: (
      <>
        <p>
          Le Studio, en tant que vendeur, est tenu de la <strong>garantie légale de conformité des contenus numériques</strong> (articles
          L224-25-1 et suivants du Code de la consommation) : fourniture de l’Objet et conformité à sa description. Dev AppStore relaie vos
          réclamations.
        </p>
        <p>
          En cas de <strong>fermeture du jeu</strong>, les conditions applicables aux Objets non utilisés sont celles indiquées par le Studio ; le
          Studio s’est engagé envers Dev AppStore à respecter un préavis de <Todo>préavis, ex. 90</Todo> jours et à rembourser les monnaies
          virtuelles achetées dans les <Todo>nombre de</Todo> jours précédant l’annonce.
        </p>
      </>
    ),
  },
  {
    id: 'remboursements',
    title: 'Remboursements, contestations et fraude',
    body: (
      <>
        <p>
          Les remboursements légaux (rétractation valable, défaut de livraison ou de conformité) et commerciaux éventuels entraînent le{' '}
          <strong>retrait de l’Objet</strong> dans le jeu lorsque c’est techniquement possible.
        </p>
        <p>
          Avant de contester un paiement auprès de votre banque, contactez le support : la plupart des problèmes sont résolus rapidement.
        </p>
        <p>
          En cas de contestation bancaire injustifiée d’un achat livré, de fraude ou d’abus, Dev AppStore peut <strong>suspendre</strong> votre
          compte et le Studio peut <strong>retirer</strong> les Objets concernés, après vous en avoir informé. Vous pouvez présenter vos
          observations.
        </p>
      </>
    ),
  },
  {
    id: 'interdits',
    title: 'Comportements interdits',
    body: (
      <ul>
        <li>utiliser un moyen de paiement sans autorisation ;</li>
        <li>revendre des Objets ou des comptes ;</li>
        <li>automatiser des achats ;</li>
        <li>contourner les plafonds de dépense ;</li>
        <li>tenter d’accéder aux systèmes de Dev AppStore ou des Studios.</li>
      </ul>
    ),
  },
  {
    id: 'responsabilite',
    title: 'Responsabilité',
    body: (
      <>
        <p>
          Dev AppStore est responsable de la bonne exécution de ses propres services (site, compte, paiement, acheminement). Le Studio est
          responsable de l’Objet et du jeu.
        </p>
        <p>Rien dans les présentes ne limite les droits que vous tenez de la loi en tant que consommateur.</p>
      </>
    ),
  },
  {
    id: 'donnees',
    title: 'Données personnelles',
    body: (
      <p>
        Voir la <Link href="/legal/confidentialite">Politique de confidentialité</Link>. Lors de la liaison et de chaque achat, votre identifiant
        de joueur et le détail de l’achat sont transmis au Studio pour vous livrer l’Objet.
      </p>
    ),
  },
  {
    id: 'mediation',
    title: 'Réclamations et médiation',
    body: (
      <>
        <p>
          Support : <Todo>formulaire ou adresse e-mail du support</Todo>, réponse sous <Todo>nombre de</Todo> jours ouvrés.
        </p>
        <p>
          En cas de litige non résolu, vous pouvez recourir gratuitement au médiateur de la consommation{' '}
          <Todo>nom, site web et adresse du médiateur</Todo> (articles L612-1 et suivants du Code de la consommation).
        </p>
      </>
    ),
  },
  {
    id: 'droit-applicable',
    title: 'Droit applicable',
    body: (
      <p>
        Les Conditions sont régies par le droit français, sans préjudice des dispositions impératives plus protectrices de votre pays de
        résidence. Vous pouvez saisir la juridiction de votre domicile.
      </p>
    ),
  },
];

export default function CgvPage() {
  return (
    <LegalDocument
      slug="cgv"
      intro={
        <p>
          En résumé : vous achetez un objet au <strong>studio</strong> qui édite le jeu ; Dev AppStore encaisse le paiement et le livre
          automatiquement dans votre jeu. Une fois l’objet livré, le droit de rétractation ne s’applique plus si vous l’avez demandé
          expressément ; tant qu’il est « en attente », vous pouvez vous rétracter depuis <Link href="/account/purchases">Mes achats</Link>.
        </p>
      }
      sections={sections}
    />
  );
}
