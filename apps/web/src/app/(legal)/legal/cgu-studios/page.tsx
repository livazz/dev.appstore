import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalTable, Todo } from '@/components/legal/LegalBits';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { getLegalDocument } from '@/lib/legal-versions';

const doc = getLegalDocument('cgu-studios');
export const metadata: Metadata = { title: doc.title, description: doc.description, alternates: { canonical: doc.href } };

const sections: LegalSection[] = [
  {
    id: 'definitions',
    title: 'Définitions',
    body: (
      <ul>
        <li>
          <strong>Dev AppStore</strong> : <Todo>raison sociale, forme et SIREN</Todo>, exploitant la plateforme.
        </li>
        <li>
          <strong>Studio</strong> : la personne morale ou le professionnel qui publie un ou plusieurs Jeux et vend des Objets via la plateforme.
        </li>
        <li>
          <strong>Jeu</strong> : jeu vidéo édité par le Studio, distribué sur des plateformes tierces (App Store, Google Play, PC, consoles, web).
        </li>
        <li>
          <strong>Objet</strong> : contenu numérique (monnaie virtuelle, objet, pack, accès) vendu par le Studio aux Joueurs via la Boutique.
        </li>
        <li>
          <strong>Boutique</strong> : la page publique du Jeu sur Dev AppStore, configurée par le Studio dans l’espace studio.
        </li>
        <li>
          <strong>Joueur</strong> : utilisateur final de Dev AppStore.
        </li>
        <li>
          <strong>Commande</strong> : achat d’un Objet par un Joueur.
        </li>
        <li>
          <strong>Livraison</strong> : crédit de l’Objet sur le compte de jeu du Joueur, par webhook signé ou SDK.
        </li>
        <li>
          <strong>Commission</strong> : rémunération de Dev AppStore définie à l’<a href="#commission">article 6</a>.
        </li>
        <li>
          <strong>Prix</strong> : prix TTC payé par le Joueur.
        </li>
      </ul>
    ),
  },
  {
    id: 'objet',
    title: 'Objet',
    body: (
      <>
        <p>
          Dev AppStore met à disposition du Studio : une Boutique publique, un catalogue et un moteur de recherche, la liaison des comptes de
          jeu, l’encaissement des paiements via Stripe Connect, l’acheminement des Commandes vers le Jeu (API, webhooks, SDK) et des outils de
          suivi des ventes.
        </p>
        <p>
          <strong>Rôles</strong> : le Studio est le <strong>vendeur</strong> des Objets aux Joueurs ; Dev AppStore agit en tant qu’
          <strong>intermédiaire</strong>. Dev AppStore ne détient jamais les fonds des Joueurs : ils sont encaissés et reversés par Stripe,
          établissement agréé, dans le cadre du compte Connect du Studio.
        </p>
        <p>
          Le présent contrat respecte le règlement (UE) 2019/1150 dit « P2B » applicable aux services d’intermédiation en ligne.
        </p>
      </>
    ),
  },
  {
    id: 'inscription',
    title: 'Inscription et vérification',
    body: (
      <>
        <p>
          Le Studio crée un compte studio, désigne ses membres et leurs rôles, et ouvre un <strong>compte Stripe Connect</strong> ; il accepte le{' '}
          <em>Stripe Connected Account Agreement</em>.
        </p>
        <p>
          Le Studio fournit des informations exactes et à jour (dénomination, immatriculation, adresse, représentant, coordonnées, n° TVA)
          permettant d’informer les Joueurs sur l’identité du vendeur et, le cas échéant, de satisfaire à l’obligation de{' '}
          <strong>traçabilité des professionnels</strong> (article 30 du règlement sur les services numériques).
        </p>
        <p>Aucune vente n’est possible tant que la vérification Stripe n’est pas finalisée.</p>
      </>
    ),
  },
  {
    id: 'catalogue',
    title: 'Catalogue, contenus et conformité',
    body: (
      <>
        <p>Le Studio fixe librement ses Prix et le contenu de sa Boutique (textes, visuels, bannières, mises en page).</p>
        <p>Le Studio garantit :</p>
        <ul>
          <li>
            détenir tous les droits sur le Jeu, les marques, visuels et contenus fournis, et concède à Dev AppStore une licence gratuite, non
            exclusive, mondiale, pour la durée du contrat, de les reproduire et représenter sur la plateforme et dans sa communication
            promotionnelle ;
          </li>
          <li>
            l’exactitude des descriptions des Objets et du <strong>prix en euros des monnaies virtuelles</strong> ;
          </li>
          <li>
            l’affichage des <strong>probabilités</strong> de tout Objet aléatoire et le respect des législations nationales (le Studio désactive
            la vente concernée dans les pays où les objets aléatoires payants sont interdits) ;
          </li>
          <li>
            la conformité du Jeu et des Objets aux lois applicables (consommation, protection des mineurs, classification PEGI/ESRB, jeux
            d’argent) ;
          </li>
          <li>
            <strong>la conformité de son Jeu aux règles des plateformes de distribution</strong> (App Store Review Guidelines, Google Play
            policies, consoles), notamment : (i) maintenir chaque Objet <strong>également disponible en achat intégré</strong> sur iOS lorsque
            requis ; (ii) ne pas inclure dans le Jeu ou sa fiche de boutons, liens ou incitations vers Dev AppStore dans les régions où cela est
            interdit. Dev AppStore fournit une information indicative (documentation d’intégration) mais <strong>le Studio est seul responsable</strong>{' '}
            de sa relation avec ces plateformes ; Dev AppStore n’est pas responsable d’un rejet ou d’un retrait du Jeu.
          </li>
        </ul>
        <p>
          Dev AppStore peut refuser ou retirer un contenu manifestement illicite, trompeur ou contraire aux présentes, dans les conditions de l’
          <a href="#suspension">article 12</a>.
        </p>
      </>
    ),
  },
  {
    id: 'livraison',
    title: 'Livraison des Objets',
    body: (
      <>
        <p>Le Studio intègre l’une des méthodes de livraison (webhook signé HMAC et/ou SDK) et s’engage à :</p>
        <ul>
          <li>
            <strong>vérifier la signature</strong> de chaque notification et traiter <code>delivery_id</code> / <code>order_id</code> comme{' '}
            <strong>clés d’idempotence</strong> (jamais de double crédit, jamais de crédit sans Commande valide) ;
          </li>
          <li>
            <strong>créditer l’Objet</strong> sur le compte de jeu désigné dès réception, et au plus tard <Todo>délai, ex. 24 heures</Todo> après
            le paiement ou à la prochaine connexion du Joueur ;
          </li>
          <li>répondre 2xx (webhook) ou appeler « ack » (SDK) uniquement après crédit effectif ;</li>
          <li>maintenir une disponibilité raisonnable de son point de terminaison et de son service de recherche de joueur ;</li>
          <li>conserver les Objets livrés sur le compte du Joueur conformément aux conditions du Jeu.</li>
        </ul>
        <p>
          Dev AppStore achemine les Commandes, procède aux relances automatiques et met à disposition un journal des livraisons. Dev AppStore
          n’est pas responsable d’un défaut de crédit imputable au Jeu.
        </p>
        <p>
          <strong>Défaut de livraison</strong> : si une Commande n’est pas livrée dans <Todo>délai, ex. 72 heures</Todo>, Dev AppStore peut,
          après en avoir informé le Studio, <strong>rembourser le Joueur</strong> pour le compte du Studio.
        </p>
        <p>
          <strong>Révocation</strong> : en cas de remboursement ou de rétrofacturation, le Studio s’efforce de retirer l’Objet du compte de jeu,
          sur notification de Dev AppStore.
        </p>
      </>
    ),
  },
  {
    id: 'commission',
    title: 'Commission et frais',
    body: (
      <>
        <p>
          Dev AppStore perçoit une <strong>Commission de <Todo>taux, ex. 5</Todo> %</strong> calculée sur le <strong>Prix hors taxes</strong> de
          chaque Commande payée.
        </p>
        <p>
          <strong>Frais de paiement</strong> : les frais Stripe (traitement des cartes, conversion de devise, calcul des taxes) sont{' '}
          <Todo>inclus dans la Commission ou supportés par le Studio</Todo>.
        </p>
        <p>
          La Commission est prélevée automatiquement sur chaque paiement. Dev AppStore émet une <strong>facture mensuelle</strong> de Commission
          (TVA française 20 % pour un Studio établi en France ; autoliquidation pour un Studio établi dans un autre État membre ; hors champ pour
          un Studio établi hors UE).
        </p>
        <p>
          <strong>Remboursements</strong> : en cas de remboursement total, la Commission <Todo>est ou n’est pas restituée</Todo> au Studio.
        </p>
        <p>
          Toute modification de la Commission est notifiée <strong>au moins 15 jours à l’avance</strong> (article 3 du règlement P2B) ; le Studio
          peut résilier sans frais avant son entrée en vigueur.
        </p>
      </>
    ),
  },
  {
    id: 'reversements',
    title: 'Reversements',
    body: (
      <p>
        Les fonds nets (Prix − TVA éventuellement collectée par Dev AppStore − Commission − frais) sont versés par Stripe sur le compte bancaire
        du Studio selon le calendrier de son compte Connect (<Todo>calendrier, ex. J+7 glissants</Todo>). Dev AppStore peut demander à Stripe de
        constituer une <strong>réserve</strong> proportionnée en cas de taux de litiges anormal.
      </p>
    ),
  },
  {
    id: 'fiscalite',
    title: 'Fiscalité',
    body: (
      <>
        <p>
          Le Studio est seul redevable des taxes sur ses ventes (TVA, sales tax) et des déclarations correspondantes, sauf disposition contraire
          liée au statut fiscal de Dev AppStore (<Todo>régime de TVA retenu</Todo>). Dev AppStore met à sa disposition des outils de calcul des
          taxes et des rapports par juridiction.
        </p>
        <p>
          Le Studio indique son statut fiscal et ses immatriculations ; il garantit Dev AppStore contre toute réclamation fiscale liée à ses
          ventes, <strong>sauf</strong> si Dev AppStore est légalement redevable en tant que fournisseur réputé.
        </p>
      </>
    ),
  },
  {
    id: 'litiges',
    title: 'Remboursements, litiges et rétrofacturations',
    body: (
      <>
        <p>
          Dev AppStore gère le premier niveau du support Joueur et exécute les remboursements dus en application de la loi ou des{' '}
          <Link href="/legal/cgv">conditions joueurs</Link>, <strong>pour le compte et aux frais du Studio</strong>.
        </p>
        <p>
          Les <strong>rétrofacturations</strong> (montant et frais de litige) sont supportées par le Studio. Dev AppStore répond aux litiges en
          produisant les preuves disponibles (acceptation des conditions, renonciation au droit de rétractation, journal de livraison) ; le Studio
          fournit à première demande les preuves d’utilisation de l’Objet dans le Jeu.
        </p>
        <p>
          Si le taux de litiges d’un Jeu dépasse <Todo>seuil, ex. 1</Todo> % sur un mois, Dev AppStore peut exiger un plan de remédiation, une
          réserve, ou suspendre les ventes du Jeu (<a href="#suspension">article 12</a>).
        </p>
      </>
    ),
  },
  {
    id: 'fermeture',
    title: 'Fermeture d’un Jeu et continuité',
    body: (
      <>
        <p>
          Le Studio informe Dev AppStore et les Joueurs <strong>au moins <Todo>préavis, ex. 90</Todo> jours</strong> avant la fermeture d’un Jeu ou
          la suppression d’Objets vendus via Dev AppStore ; les ventes cessent dès l’annonce.
        </p>
        <p>
          Le Studio rembourse, à ses frais, les monnaies virtuelles non utilisées achetées via Dev AppStore dans les <Todo>nombre de, ex. 30</Todo>{' '}
          jours précédant l’annonce, et plus largement respecte ses obligations légales de conformité.
        </p>
      </>
    ),
  },
  {
    id: 'donnees',
    title: 'Données personnelles',
    body: (
      <>
        <p>
          Dev AppStore et le Studio agissent chacun en <strong>responsable de traitement indépendant</strong> : Dev AppStore pour la gestion des
          comptes, des paiements et de la plateforme ; le Studio pour la gestion du Jeu et du compte de jeu.
        </p>
        <p>
          Dev AppStore transmet au Studio les seules données nécessaires à la liaison et à la Livraison (identifiant et nom de joueur,
          identifiants de Commande et de livraison, Objet, quantité, date ; pas d’adresse e-mail ni de données de paiement, sauf accord du
          Joueur). Le Studio ne réutilise pas ces données à d’autres fins sans base légale propre.
        </p>
        <p>
          Chaque partie assure la sécurité des données (clés API secrètes, vérification HMAC, chiffrement en transit), notifie l’autre sans délai
          de toute violation affectant les données échangées et coopère pour répondre aux demandes d’exercice de droits. Voir aussi la{' '}
          <Link href="/legal/confidentialite">Politique de confidentialité</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspension et résiliation',
    body: (
      <>
        <p>
          Dev AppStore peut <strong>restreindre ou suspendre</strong> une Boutique ou un Objet en cas de manquement, d’illicéité, de fraude ou de
          taux de litiges excessif ; elle en communique les <strong>motifs</strong> au Studio au plus tard au moment où la mesure prend effet, sur
          support durable (article 4 du règlement P2B).
        </p>
        <p>
          La <strong>résiliation</strong> de l’ensemble des services par Dev AppStore requiert un <strong>préavis de 30 jours</strong> motivé, sauf
          obligation légale, manquement grave ou répété.
        </p>
        <p>
          Le Studio peut résilier à tout moment avec un préavis de <Todo>préavis, ex. 30</Todo> jours. Les obligations de Livraison, de
          remboursement et de continuité (articles 5, 9 et 10) survivent pour les Commandes passées.
        </p>
        <p>
          Le Studio peut contester une mesure via le système interne de traitement des plaintes (<a href="#plaintes">article 13</a>).
        </p>
      </>
    ),
  },
  {
    id: 'plaintes',
    title: 'Plaintes, médiation, classement',
    body: (
      <>
        <p>
          <strong>Plaintes</strong> : <Todo>adresse ou formulaire de plainte</Todo> ; réponse motivée sous <Todo>délai, ex. 15</Todo> jours.
        </p>
        <p>
          <strong>Médiation</strong> : Dev AppStore désigne les médiateurs suivants (article 12 du règlement P2B) :{' '}
          <Todo>noms et coordonnées d’au moins deux médiateurs</Todo>.
        </p>
        <p>
          <strong>Classement</strong> : les principaux paramètres de classement du catalogue et de la recherche sont{' '}
          <Todo>paramètres retenus, ex. pertinence textuelle, ventes récentes, nouveauté, mise en avant éditoriale</Todo> ; tout placement
          rémunéré est signalé (article 5 du règlement P2B).
        </p>
      </>
    ),
  },
  {
    id: 'responsabilite',
    title: 'Responsabilité',
    body: (
      <>
        <p>
          Chaque partie répond des dommages directs causés par ses manquements. La responsabilité de Dev AppStore est limitée, hors faute lourde ou
          dolosive, au montant des Commissions perçues au titre du Jeu concerné au cours des <Todo>nombre de, ex. 12</Todo> derniers mois.
        </p>
        <p>
          Le Studio garantit Dev AppStore contre toute réclamation de tiers (Joueurs, ayants droit, autorités, plateformes de distribution)
          résultant du Jeu, des Objets ou de ses contenus.
        </p>
      </>
    ),
  },
  {
    id: 'confidentialite',
    title: 'Confidentialité, communication',
    body: (
      <p>
        Clés API, données de ventes non publiques et termes négociés sont confidentiels. Dev AppStore peut mentionner le nom et le logo du Studio
        comme référence, sauf opposition de sa part.
      </p>
    ),
  },
  {
    id: 'modification',
    title: 'Modification des conditions',
    body: (
      <p>
        Toute modification est notifiée <strong>au moins 15 jours</strong> à l’avance sur support durable (article 3 du règlement P2B) ; le Studio
        peut résilier avant l’entrée en vigueur. Délai réduit uniquement en cas d’obligation légale ou de risque de sécurité.
      </p>
    ),
  },
  {
    id: 'droit-applicable',
    title: 'Droit applicable et juridiction',
    body: (
      <p>
        Droit français. À défaut d’accord amiable ou de médiation, compétence exclusive des <strong>tribunaux de <Todo>ville</Todo></strong>, sous
        réserve des règles impératives.
      </p>
    ),
  },
  {
    id: 'annexes',
    title: 'Annexes',
    body: (
      <>
        <h3>Annexe A — Niveaux de service techniques (indicatifs)</h3>
        <LegalTable
          caption="Niveaux de service techniques"
          head={['Indicateur', 'Engagement du Studio']}
          rows={[
            ['Délai de crédit après notification', 'Moins d’une minute (cible), moins de 24 h (maximum)'],
            ['Disponibilité du webhook et du service de recherche de joueur', <Todo key="d">taux, ex. 99 %</Todo>],
            ['Réponse du support niveau 2', <Todo key="s">délai, ex. 2 jours ouvrés</Todo>],
            ['Taux de litiges', <Todo key="l">seuil, ex. moins de 1 % par mois</Todo>],
          ]}
        />
        <h3>Annexe B — Données échangées</h3>
        <p>
          <code>player_id</code>, <code>player_name</code>, <code>order_id</code>, <code>delivery_id</code>, identifiant d’Objet, quantité, prix,
          devise, horodatage, statut de livraison.
        </p>
      </>
    ),
  },
];

export default function CguStudiosPage() {
  return (
    <LegalDocument
      slug="cgu-studios"
      intro={
        <p>
          Ces conditions s’appliquent aux studios qui vendent leurs objets sur Dev AppStore. Le studio reste le vendeur ; Dev AppStore fournit la
          boutique, le paiement via Stripe Connect et la livraison automatique dans le jeu, contre une commission sur chaque vente.
        </p>
      }
      sections={sections}
    />
  );
}
