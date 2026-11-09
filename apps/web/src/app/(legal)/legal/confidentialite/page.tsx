import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalTable, Todo } from '@/components/legal/LegalBits';
import { LegalDocument, type LegalSection } from '@/components/legal/LegalDocument';
import { getLegalDocument } from '@/lib/legal-versions';

const doc = getLegalDocument('confidentialite');
export const metadata: Metadata = { title: doc.title, description: doc.description, alternates: { canonical: doc.href } };

const sections: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Qui est responsable de vos données ?',
    body: (
      <>
        <p>
          <strong>Dev AppStore</strong> (<Todo>raison sociale, SIREN et adresse du siège</Todo>) est responsable des traitements liés aux comptes
          joueurs et studios, aux commandes, à la liaison des comptes de jeu, à la livraison, à la sécurité et au support.
        </p>
        <LegalTable
          caption="Rôles des acteurs"
          head={['Acteur', 'Rôle', 'Ce que cela signifie']}
          rows={[
            ['Dev AppStore', 'Responsable de traitement', 'Comptes, commandes, liaison, livraison, sécurité, support'],
            [
              'Studios (éditeurs des jeux)',
              'Responsables de traitement indépendants',
              'Reçoivent votre identifiant et votre nom de joueur ainsi que le détail de la commande pour créditer l’Objet ; gèrent votre compte de jeu selon leur propre politique',
            ],
            [
              'Stripe',
              'Sous-traitant pour le paiement, responsable indépendant pour certaines finalités',
              'Traitement des paiements ; lutte contre la fraude, obligations anti-blanchiment et vérification des studios sous sa propre responsabilité',
            ],
            ['Hébergeur', 'Sous-traitant', <Todo key="h">nom de l’hébergeur et localisation des serveurs</Todo>],
          ]}
        />
        <p>
          Contact pour toute question relative à vos données : <Todo>adresse e-mail dédiée, ex. confidentialite@…</Todo>.
        </p>
      </>
    ),
  },
  {
    id: 'traitements',
    title: 'Données traitées, finalités et bases légales',
    body: (
      <>
        <p>Nous ne traitons aucune donnée sensible. Le numéro complet de votre carte bancaire n’est jamais transmis à Dev AppStore.</p>
        <LegalTable
          caption="Traitements, données et bases légales"
          head={['Finalité', 'Données', 'Base légale']}
          rows={[
            [
              'Création et gestion de votre compte, connexion',
              'E-mail, nom ou pseudo, mot de passe haché, date de naissance ou tranche d’âge, cookie de session',
              'Exécution du contrat',
            ],
            [
              'Liaison de votre compte de jeu',
              'Identifiant de joueur, nom de joueur renvoyé par le studio, méthode (code ou identifiant), statut vérifié ou déclaratif, date',
              'Exécution du contrat',
            ],
            [
              'Commande et paiement',
              'Objet, prix, devise, statut, références Stripe, marque, 4 derniers chiffres et pays de la carte fournis par Stripe',
              'Exécution du contrat',
            ],
            ['Livraison automatique dans le jeu', 'Identifiant de joueur, identifiants de commande et de livraison, journal des tentatives', 'Exécution du contrat'],
            [
              'Facturation, comptabilité, TVA',
              'Pays, adresse de facturation, adresse IP au moment de la commande, montants, taxes',
              'Obligation légale',
            ],
            [
              'Lutte contre la fraude et les contestations bancaires',
              'Adresse IP, appareil et navigateur, historique d’achats, résultat 3-D Secure, signaux anti-fraude',
              'Intérêt légitime (prévenir la fraude)',
            ],
            ['Support, réclamations, rétractation', 'Échanges, pièces jointes, historique de commande', 'Contrat ou obligation légale'],
            ['Sécurité et journaux techniques', 'Journaux de connexion, adresse IP, horodatages, erreurs', 'Intérêt légitime et obligation légale'],
            ['Comptes studio et membres', 'Nom, e-mail professionnel, rôle (la vérification d’identité est réalisée par Stripe)', 'Exécution du contrat'],
            ['Statistiques de ventes fournies aux studios', 'Ventes agrégées par objet, pays et jour, sans identification', 'Intérêt légitime'],
            ['Mesure d’audience (si activée)', 'Identifiants de traceurs', 'Consentement, sauf outil exempté — voir la page Cookies'],
            ['Plafonds de dépense et contrôle parental', 'Âge déclaré, plafonds, e-mail du représentant légal', 'Contrat et obligation légale'],
          ]}
        />
        <p>
          Aucune décision produisant des effets juridiques n’est prise sur le seul fondement d’un traitement automatisé : un blocage anti-fraude
          peut faire l’objet d’une <strong>revue humaine</strong> sur simple demande.
        </p>
      </>
    ),
  },
  {
    id: 'mineurs',
    title: 'Mineurs',
    body: (
      <ul>
        <li>
          En France, un mineur peut consentir seul à un traitement fondé sur le consentement à partir de <strong>15 ans</strong> ; en dessous,
          l’accord du titulaire de l’autorité parentale est également requis.
        </li>
        <li>Aucun traceur publicitaire ni profilage marketing n’est utilisé pour les comptes de mineurs.</li>
        <li>
          Les conditions d’âge pour ouvrir un compte et acheter figurent dans les <Link href="/legal/cgv#compte">CGV joueurs</Link>.
        </li>
      </ul>
    ),
  },
  {
    id: 'destinataires',
    title: 'Destinataires et transferts hors de l’Union européenne',
    body: (
      <>
        <LegalTable
          caption="Destinataires des données"
          head={['Destinataire', 'Données', 'Localisation et garanties']}
          rows={[
            [
              'Stripe (Stripe Payments Europe Ltd, Irlande, et entités du groupe)',
              'Paiement, anti-fraude, vérification des studios',
              'Union européenne et États-Unis — accord de traitement Stripe, EU-US Data Privacy Framework et clauses contractuelles types',
            ],
            ['Hébergeur', 'Toutes les données du service', <Todo key="h">hébergeur, localisation et garanties</Todo>],
            [
              'Studio éditeur du jeu concerné',
              'Identifiant et nom de joueur, détail de la commande (jamais votre e-mail ni vos données de paiement)',
              'Variable, éventuellement hors UE — clauses contractuelles types prévues dans les conditions studio',
            ],
            ['Autorités fiscales ou judiciaires', 'Sur réquisition', 'Obligation légale'],
          ]}
        />
        <p>
          Les transferts vers les États-Unis reposent sur le cadre EU-US Data Privacy Framework et, à défaut, sur les clauses contractuelles
          types de la Commission européenne.
        </p>
      </>
    ),
  },
  {
    id: 'durees',
    title: 'Durées de conservation',
    body: (
      <LegalTable
        caption="Durées de conservation"
        head={['Données', 'Durée']}
        rows={[
          ['Compte joueur', 'Durée de vie du compte ; suppression ou anonymisation 3 ans après la dernière activité, après un e-mail d’avertissement'],
          ['Liaisons de compte de jeu', 'Tant que la liaison est active ; supprimées à la déliaison, sauf référence nécessaire à une commande'],
          ['Commandes, factures et pièces comptables', '3 ans en base active, puis 10 ans en archive (Code de commerce)'],
          ['Preuves de localisation pour la TVA', '10 ans'],
          ['Preuves d’acceptation des CGV et de renonciation au droit de rétractation', 'Durée de la relation, puis 5 ans'],
          ['Journal de livraison', '13 mois (délai des contestations bancaires), puis agrégé ou conservé avec la commande'],
          ['Données anti-fraude', '13 mois au maximum pour les données de transaction'],
          ['Données de carte', 'Non conservées par Dev AppStore (traitées par Stripe)'],
          ['Journaux de connexion et de sécurité', '1 an'],
          ['Comptes studio et membres', 'Durée du contrat, puis 5 ans'],
          ['Support', '3 ans après la clôture de la demande'],
          ['Cookies de mesure d’audience', '13 mois au maximum pour le traceur, 25 mois pour les données'],
        ]}
      />
    ),
  },
  {
    id: 'droits',
    title: 'Vos droits',
    body: (
      <>
        <p>Vous disposez des droits suivants sur vos données :</p>
        <ul>
          <li>accès, rectification et effacement (sous réserve des conservations légales ci-dessus) ;</li>
          <li>limitation et opposition, notamment aux traitements fondés sur l’intérêt légitime (anti-fraude, sécurité, statistiques) ;</li>
          <li>portabilité des données de compte, de liaison, de commande et de livraison ;</li>
          <li>retrait de votre consentement à tout moment, pour les traitements qui en dépendent ;</li>
          <li>directives relatives au sort de vos données après votre décès.</li>
        </ul>
        <p>
          Pour les exercer, écrivez à <Todo>adresse e-mail dédiée</Todo>. Nous répondons dans un délai d’un mois. Une demande d’effacement relative
          à votre compte de jeu lié est transmise au studio concerné. Vous pouvez aussi introduire une réclamation auprès de la{' '}
          <strong>CNIL</strong> (cnil.fr).
        </p>
      </>
    ),
  },
  {
    id: 'securite',
    title: 'Sécurité',
    body: (
      <ul>
        <li>mots de passe hachés, cookies de session sécurisés (HttpOnly, Secure, SameSite) ;</li>
        <li>clés API des studios stockées hachées, notifications de livraison signées et horodatées ;</li>
        <li>aucune donnée de carte chez Dev AppStore : la page de paiement est hébergée par Stripe ;</li>
        <li>chiffrement des échanges (TLS), chiffrement au repos et sauvegardes chiffrées chez l’hébergeur ;</li>
        <li>accès des membres de studio limité à leurs jeux et à leur rôle ;</li>
        <li>données transmises aux studios minimisées (pas d’adresse e-mail) ;</li>
        <li>en cas de violation de données : notification à la CNIL sous 72 heures et information des personnes si le risque est élevé.</li>
      </ul>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <p>
        Les cookies et traceurs utilisés par le site sont décrits sur la page <Link href="/legal/cookies">Cookies et traceurs</Link>.
      </p>
    ),
  },
];

export default function ConfidentialitePage() {
  return (
    <LegalDocument
      slug="confidentialite"
      intro={
        <p>
          Cette politique explique quelles données Dev AppStore traite lorsque vous utilisez le site, achetez un objet ou gérez une boutique de
          studio, pourquoi, combien de temps, et comment exercer vos droits.
        </p>
      }
      sections={sections}
    />
  );
}
