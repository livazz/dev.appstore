import type { ReactNode } from 'react';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { A, C, Callout, DocPage, H2, P, Table, UL } from '@/components/docs/prose';
import { docPageMetadata } from '@/lib/seo';

export const metadata = docPageMetadata('bonnes-pratiques');

const IDEMPOTENT_SQL = `-- Une ligne par livraison créditée : la contrainte d'unicité empêche le double crédit.
CREATE TABLE credited_deliveries (
  delivery_id text PRIMARY KEY,
  player_id   text NOT NULL,
  credited_at timestamptz NOT NULL DEFAULT now()
);

BEGIN;
INSERT INTO credited_deliveries (delivery_id, player_id)
VALUES ($1, $2)
ON CONFLICT (delivery_id) DO NOTHING;
-- Si 0 ligne insérée : déjà crédité → COMMIT et répondre 2xx sans rien faire d'autre.
UPDATE wallets SET gems = gems + 500 * $3 WHERE player_id = $2;
COMMIT;
-- Puis seulement : réponse 2xx (webhook) ou ack (SDK / API).`;

const CHECKLIST: { label: string; detail: ReactNode }[] = [
  { label: 'Clé API stockée côté serveur', detail: <>Variable d’environnement ou gestionnaire de secrets ; jamais dans le dépôt.</> },
  { label: 'Signature des webhooks vérifiée', detail: <>Corps brut, tolérance de 300 s, comparaison en temps constant (<A href="/docs/webhooks#vecteur-de-test">vecteur de test</A>).</> },
  { label: 'Crédit idempotent', detail: <>Unicité sur <C>delivery_id</C>, dans la même transaction que le crédit.</> },
  { label: 'Ack / 2xx après la sauvegarde', detail: <>Jamais avant que le crédit soit persisté.</> },
  { label: 'Remboursements gérés', detail: <><C>purchase.refunded</C> retire l’objet ou révoque l’accès, puis est acquitté.</> },
  { label: 'Produits inconnus', detail: <>Pas d’ack pour un <C>product_id</C> inconnu : l’achat reviendra après la mise à jour du jeu.</> },
  { label: 'Libellés neutres dans l’app', detail: <>Aucun prix, lien ni nom de boutique externe hors États-Unis (voir ci-dessus).</> },
  { label: 'Équivalent IAP sur iOS', detail: <>Chaque article consommable vendu sur le web existe aussi en achat intégré.</> },
  { label: 'Événement de test reçu', detail: <>Bouton « Envoyer un événement de test » de l’onglet Intégration : statut 2xx.</> },
  { label: 'Achat réel de bout en bout', detail: <>Liaison, achat, livraison et ack vérifiés avec un compte de test, journal des livraisons au vert.</> },
];

export default function BestPracticesPage() {
  return (
    <DocPage slug="bonnes-pratiques">
      <H2 id="cle-secrete">Clé secrète côté serveur</H2>
      <P>
        La clé API (<C>das_…</C>) donne accès aux livraisons de <strong>tous</strong> les joueurs de votre jeu : les lire, les acquitter
        (donc les faire disparaître) et émettre des codes de liaison. Le secret webhook (<C>whsec_…</C>) permet de fabriquer de faux
        achats signés.
      </P>
      <UL>
        <li>
          Si votre jeu a un serveur : recevez les achats par <A href="/docs/webhooks">webhook</A>, appelez l’API depuis le serveur, et ne
          mettez <strong>ni la clé ni le secret</strong> dans le client.
        </li>
        <li>
          Le client affiche un code de liaison obtenu <em>via votre serveur</em> (qui appelle <C>POST /api/v1/link-codes</C> pour le
          joueur authentifié).
        </li>
        <li>
          Les SDK client (clé embarquée) sont réservés aux jeux sans serveur ou hors ligne, pour des objets de faible valeur.
        </li>
        <li>
          Fuite suspectée : régénérez la clé et/ou le secret depuis l’onglet <strong>Intégration</strong>. L’ancienne valeur cesse aussitôt
          de fonctionner ; déployez la nouvelle sans attendre.
        </li>
        <li>Ne journalisez jamais l’en-tête Authorization ni le secret webhook.</li>
      </UL>

      <H2 id="ack-apres-sauvegarde">Acquitter après la sauvegarde</H2>
      <P>
        L’ack (ou la réponse 2xx du webhook) dit à Dev AppStore : « le joueur a son objet, ne me le renvoyez plus ». Envoyé trop tôt, un
        plantage, une coupure réseau ou une sauvegarde ratée font <strong>perdre l’achat</strong> au joueur.
      </P>
      <Table
        caption="Ordre des opérations"
        head={['À faire', 'À éviter']}
        rows={[
          ['1. Recevoir → 2. créditer → 3. sauvegarder → 4. ack / 2xx', 'Ack dès la réception, puis créditer'],
          ['Lever une erreur dans le handler SDK si la sauvegarde échoue (pas d’ack)', 'Avaler l’erreur et laisser partir l’ack'],
          ['Répondre 5xx au webhook si la base est indisponible (relance automatique)', 'Répondre 200 « pour ne pas être relancé »'],
        ]}
      />

      <H2 id="idempotence-pratique">Ne jamais créditer deux fois</H2>
      <P>
        Une livraison peut arriver plusieurs fois (relance de webhook, rattrapage du SDK, ack perdu). La parade est une contrainte
        d’unicité sur <C>delivery_id</C>, dans la même transaction que le crédit :
      </P>
      <CodeBlock lang="sql" title="PostgreSQL" code={IDEMPOTENT_SQL} />
      <P>
        Pour un jeu sans serveur, gardez la liste des <C>delivery_id</C> crédités dans la sauvegarde du joueur, comme dans les exemples{' '}
        <A href="/docs/sdk#sdk-godot">Godot</A> et <A href="/docs/sdk#sdk-unreal">Unreal</A>.
      </P>

      <H2 id="libelles-neutres">Libellés neutres vis-à-vis des stores</H2>
      <P>
        Acheter sur le web puis profiter de l’objet dans un jeu mobile est autorisé par Apple et Google. En revanche, <strong>inciter</strong>{' '}
        depuis l’application à acheter ailleurs est encadré, et varie selon le pays de la vitrine. Ce qui suit est un résumé
        opérationnel, pas un avis juridique ; vous restez responsable de la conformité de votre application.
      </P>
      <Table
        caption="Libellés dans l’application"
        head={['Dans le jeu', 'Recommandé', 'À éviter (hors États-Unis)']}
        rows={[
          ['Écran de liaison', '« Lier un compte web », « Code de liaison : K7QF-M2XA »', '« Achetez moins cher sur le web », URL cliquable, prix'],
          ['Objet reçu', '« Objet reçu : Pack de 500 gemmes »', '« Merci pour votre achat sur la boutique web ! »'],
          ['Menus, bannières', 'Rien', 'Bouton « Acheter sur le web », comparaison de prix'],
          ['Fiche store (description, captures)', 'Rien sur la boutique web', 'Toute mention de la boutique web ou de ses prix'],
        ]}
      />
      <UL>
        <li>
          <strong>États-Unis</strong> : un bouton ou lien vers l’achat web est actuellement autorisé (Apple et Google), mais des frais sur
          les achats issus d’un lien dans l’app existent ou sont attendus. Prévoyez un réglage par pays plutôt qu’un bouton global.
        </li>
        <li>
          <strong>Union européenne, Japon, Corée</strong> : liens possibles via des programmes spécifiques des stores, généralement
          facturés ; au Japon, aucun lien pour les moins de 13 ans.
        </li>
        <li>
          <strong>Ailleurs</strong> : aucun bouton, lien ni appel à l’action vers un moyen d’achat externe dans l’application.
        </li>
        <li>
          <strong>Hors de l’application</strong> (e-mail, réseaux sociaux, site, communauté, publicité), vous pouvez librement faire connaître
          votre boutique web, partout.
        </li>
        <li>
          <strong>iOS</strong> : chaque objet consommable vendu sur le web doit <strong>aussi exister en achat intégré</strong> dans l’app
          (règle « multiplatform services » d’Apple). Utilisez le même <C>product_id</C> que votre produit IAP pour simplifier.
        </li>
        <li>
          Préférez la méthode <A href="/docs/concepts#methode-id-confirm">id_confirm</A> là où vous ne voulez <strong>aucune</strong>{' '}
          interface de liaison dans le jeu.
        </li>
      </UL>
      <Callout kind="warn" title="Un domaine qui bouge vite">
        <p>
          Les règles des stores évoluent avec les procès et les régulateurs (Epic c. Apple, DMA, lois japonaise et coréenne). Revérifiez les
          textes officiels (App Review Guidelines, règles de paiement Google Play) avant chaque mise en production importante.
        </p>
      </Callout>

      <H2 id="checklist">Check-list de mise en production</H2>
      <ul className="my-5 space-y-2">
        {CHECKLIST.map((c) => (
          <li key={c.label} className="flex gap-3 rounded-[var(--radius)] border border-line bg-surface px-4 py-3">
            <span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border-2 border-line" />
            <span className="min-w-0 text-sm leading-6">
              <span className="block font-medium text-ink">{c.label}</span>
              <span className="text-ink-2">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </DocPage>
  );
}
