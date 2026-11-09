import { CodeBlock } from '@/components/docs/CodeBlock';
import { CodeTabs } from '@/components/docs/CodeTabs';
import { A, C, Callout, DocPage, H2, H3, OL, P, Table, UL } from '@/components/docs/prose';
import { docPageMetadata } from '@/lib/seo';
import {
  EXAMPLE_BODY,
  EXAMPLE_PURCHASE,
  EXAMPLE_SECRET,
  EXAMPLE_SIGNATURE_HEADER,
  EXAMPLE_TIMESTAMP,
  EXAMPLE_V1,
  VERIFY_CSHARP,
  VERIFY_GO,
  VERIFY_NODE,
  VERIFY_PHP,
  VERIFY_PYTHON,
  json,
} from '@/lib/docs/examples';
import { DOCS_FACTS, RETRY_SCHEDULE_TEXT } from '@/lib/docs/facts';

export const metadata = docPageMetadata('webhooks');

const PURCHASE_EVENT_TS = `interface PurchaseEvent {
  event: 'purchase.completed' | 'purchase.refunded';
  delivery_id: string;   // unique par livraison : votre clé d'idempotence
  order_id: string;      // commande (partagé par l'achat et son remboursement)
  game_id: string;
  player_id: string;     // identifiant du joueur dans VOTRE jeu (issu de la liaison)
  product_id: string;    // identifiant produit défini dans l'éditeur de boutique
  item_type: 'consumable' | 'non_consumable' | 'auto_renewable' | 'non_renewing';
  quantity: number;      // entier ≥ 1
  amount_cents: number;  // montant payé, en centimes
  currency: 'EUR' | 'USD' | 'GBP';
  created_at: string;    // ISO 8601, UTC
}`;

const REQUEST_SAMPLE = `POST /webhooks/purchases HTTP/1.1
Host: api.monjeu.com
Content-Type: application/json
User-Agent: DevAppStore-Webhooks/1.0
${DOCS_FACTS.signatureHeader}: ${EXAMPLE_SIGNATURE_HEADER}
${DOCS_FACTS.deliveryHeader}: ${EXAMPLE_PURCHASE.delivery_id}

${EXAMPLE_BODY}`;

export default function WebhooksPage() {
  return (
    <DocPage slug="webhooks">
      <H2 id="fonctionnement">Fonctionnement</H2>
      <P>
        Renseignez l’URL de votre serveur dans l’onglet <strong>Intégration</strong> du jeu (HTTPS en production). À chaque achat
        payé — et à chaque remboursement —, Dev AppStore envoie une requête <C>POST</C> signée contenant un{' '}
        <A href="#purchase-event">PurchaseEvent</A>. Votre serveur vérifie la signature, crédite le joueur de façon idempotente et répond{' '}
        <C>2xx</C>.
      </P>
      <P>
        Le bouton <strong>Envoyer un événement de test</strong> de l’onglet Intégration envoie un événement signé factice (en-tête{' '}
        <C>{DOCS_FACTS.testHeader}: 1</C>, <C>product_id</C> = <C>test_product</C>, montant nul) et affiche le statut HTTP obtenu.
      </P>

      <H2 id="requete">Requête envoyée</H2>
      <CodeBlock lang="http" title="Exemple de requête" code={REQUEST_SAMPLE} />
      <Table
        caption="En-têtes du webhook"
        head={['En-tête', 'Contenu']}
        rows={[
          [<C key="a">Content-Type</C>, <C key="b">application/json</C>],
          [<C key="a">{DOCS_FACTS.signatureHeader}</C>, <>Signature <C>t=&lt;horodatage&gt;,v1=&lt;hmac&gt;</C> (voir ci-dessous)</>],
          [<C key="a">{DOCS_FACTS.deliveryHeader}</C>, <>Identifiant de la livraison (égal à <C>delivery_id</C> du corps)</>],
          [<C key="a">{DOCS_FACTS.testHeader}</C>, <>Présent (<C>1</C>) uniquement pour les événements de test</>],
          [<C key="a">User-Agent</C>, <C key="b">DevAppStore-Webhooks/1.0</C>],
        ]}
      />

      <H2 id="purchase-event">Format PurchaseEvent</H2>
      <P>
        Le corps est un objet JSON compact (une seule ligne). Le même format est servi par l’API et les SDK, et vérifié par le type{' '}
        <C>PurchaseEvent</C> de <C>@devappstore/sdk</C>.
      </P>
      <CodeTabs
        ariaLabel="Format"
        tabs={[
          { label: 'Exemple JSON', code: json(EXAMPLE_PURCHASE) },
          { label: 'TypeScript', code: PURCHASE_EVENT_TS },
        ]}
      />
      <Callout kind="tip">
        <p>
          Ne vous fiez pas à <C>amount_cents</C> pour décider quoi créditer : utilisez <C>product_id</C> × <C>quantity</C>. Le montant
          sert à votre comptabilité et à vos statistiques.
        </p>
      </Callout>

      <H2 id="signature">Signature</H2>
      <P>
        L’en-tête <C>{DOCS_FACTS.signatureHeader}</C> vaut <C>t=&lt;t&gt;,v1=&lt;signature&gt;</C> :
      </P>
      <UL>
        <li>
          <C>t</C> : horodatage Unix (secondes) de l’envoi ;
        </li>
        <li>
          <C>v1</C> : <strong>HMAC-SHA256</strong>, en hexadécimal minuscule, de la chaîne <C>{'`${t}.${body}`'}</C> — l’horodatage, un
          point, puis le <strong>corps brut</strong> exact de la requête —, avec le secret webhook du jeu (<C>whsec_…</C>) comme clé.
        </li>
      </UL>
      <P>Pour vérifier :</P>
      <OL>
        <li>lisez le corps brut, avant tout parsing JSON (un JSON re-sérialisé n’aura pas les mêmes octets) ;</li>
        <li>
          extrayez <C>t</C> et <C>v1</C> de l’en-tête ;
        </li>
        <li>
          refusez si <C>|maintenant − t|</C> dépasse <strong>{DOCS_FACTS.toleranceS} secondes</strong> (protection contre le rejeu ; gardez
          l’horloge de votre serveur synchronisée par NTP) ;
        </li>
        <li>
          recalculez le HMAC et comparez-le à <C>v1</C> <strong>en temps constant</strong> ;
        </li>
        <li>
          en cas d’échec, répondez <C>401</C> sans rien créditer.
        </li>
      </OL>
      <H3 id="vecteur-de-test">Vecteur de test</H3>
      <P>Votre implémentation doit retrouver exactement cette signature :</P>
      <Table
        caption="Vecteur de test de signature"
        head={['Donnée', 'Valeur']}
        rows={[
          ['Secret', <C key="v">{EXAMPLE_SECRET}</C>],
          ['t', <C key="v">{EXAMPLE_TIMESTAMP}</C>],
          ['Corps', <>le JSON compact de l’<A href="#purchase-event">exemple ci-dessus</A></>],
          ['v1 attendu', <C key="v">{EXAMPLE_V1}</C>],
        ]}
      />
      <CodeBlock lang="bash" title="Vérification en ligne de commande" code={`printf '%s' '${EXAMPLE_TIMESTAMP}.${EXAMPLE_BODY}' \\\n  | openssl dgst -sha256 -hmac '${EXAMPLE_SECRET}' -hex`} />

      <H2 id="verification">Vérifier la signature</H2>
      <P>
        Exemples complets, sans dépendance cryptographique externe. En Node, le SDK fournit aussi{' '}
        <C>verifyWebhookSignature(rawBody, header, secret)</C> dans <C>@devappstore/sdk/server</C>.
      </P>
      <CodeTabs
        tabs={[
          { label: 'Node', title: 'Node.js ≥ 18 (Express)', code: VERIFY_NODE },
          { label: 'Python', title: 'Python ≥ 3.10 (Flask)', code: VERIFY_PYTHON },
          { label: 'PHP', title: 'PHP ≥ 7.4', code: VERIFY_PHP },
          { label: 'Go', title: 'Go ≥ 1.18 (net/http)', code: VERIFY_GO },
          { label: 'C#', title: '.NET ≥ 6 (ASP.NET Core)', code: VERIFY_CSHARP },
        ]}
      />

      <H2 id="relances">Réponses et relances</H2>
      <Table
        caption="Interprétation des réponses"
        head={['Votre réponse', 'Effet']}
        rows={[
          [<C key="a">2xx</C>, <>Livraison <C>delivered</C>. Le corps de la réponse est ignoré.</>],
          [<>3xx, 4xx, 5xx</>, 'Échec : les redirections ne sont pas suivies. Nouvelle tentative planifiée.'],
          [<>Pas de réponse en {DOCS_FACTS.webhookTimeoutS} s</>, 'Échec (délai dépassé). Nouvelle tentative planifiée.'],
        ]}
      />
      <P>
        Délais entre les tentatives : <strong>{RETRY_SCHEDULE_TEXT}</strong>. Après la dernière, la livraison passe à <C>failed</C> ; vous
        pouvez la relancer depuis le journal de l’onglet Intégration, qui détaille chaque tentative (statut HTTP, erreur, durée). Une
        livraison <C>failed</C> reste aussi visible par le SDK et peut être acquittée.
      </P>
      <Callout kind="warn" title="Répondez vite, traitez de façon fiable">
        <p>
          Répondez 2xx dès que le crédit est <strong>enregistré</strong> (en base, dans la même transaction que le <C>delivery_id</C>),
          pas avant. Si votre traitement est long, enregistrez l’événement dans une file puis répondez : au-delà de{' '}
          {DOCS_FACTS.webhookTimeoutS} s, l’envoi est considéré comme un échec et sera rejoué.
        </p>
      </Callout>
      <P>
        Le webhook peut être rejoué (réponse perdue, délai dépassé) : appliquez la règle d’<A href="/docs/concepts#idempotence">idempotence</A>{' '}
        et répondez 2xx à une livraison déjà traitée. Votre serveur peut en plus acquitter explicitement avec{' '}
        <A href="/docs/api#post-ack">POST /api/v1/deliveries/{'{id}'}/ack</A>.
      </P>
    </DocPage>
  );
}
