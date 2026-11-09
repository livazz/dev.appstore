import type { ReactNode } from 'react';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { CodeTabs } from '@/components/docs/CodeTabs';
import { A, C, Callout, DocPage, Endpoint, H2, H3, P, Table, UL } from '@/components/docs/prose';
import { docPageMetadata } from '@/lib/seo';
import { EXAMPLE_PURCHASE, SHELL_ENV, json } from '@/lib/docs/examples';
import { DOCS_FACTS } from '@/lib/docs/facts';

export const metadata = docPageMetadata('api');

const ERR_401 = [<C key="s">401</C>, <C key="c">unauthorized</C>, 'En-tête Authorization absent, mal formé, ou clé inconnue (ex. régénérée).'];

function ErrorTable({ rows }: { rows: ReactNode[][] }) {
  return <Table caption="Erreurs" head={['Statut', 'code', 'Quand']} rows={rows} />;
}

const SSE_SAMPLE = `retry: 5000

event: purchase
id: ${EXAMPLE_PURCHASE.delivery_id}
data: ${JSON.stringify(EXAMPLE_PURCHASE)}

: ping
`;

export default function ApiReferencePage() {
  return (
    <DocPage slug="api">
      <P>
        URL de base : l’origine de Dev AppStore (en local <C>http://localhost:3000</C>). Toutes les routes sont sous <C>/api/v1</C>,
        acceptent et renvoient du JSON (sauf le flux SSE), et ne sont jamais mises en cache (<C>Cache-Control: no-store</C>). Les
        exemples utilisent ces variables :
      </P>
      <CodeBlock lang="bash" code={SHELL_ENV} />

      <H2 id="authentification">Authentification</H2>
      <P>
        Chaque appel porte la clé API du jeu dans l’en-tête <C>Authorization</C>. La clé identifie le jeu : vous n’avez jamais à
        transmettre de <C>game_id</C>. Seule une empreinte SHA-256 de la clé est stockée ; si vous la perdez, régénérez-la depuis l’onglet{' '}
        <strong>Intégration</strong> (l’ancienne cesse immédiatement de fonctionner).
      </P>
      <CodeBlock lang="http" code={'Authorization: Bearer das_live_…'} />
      <Callout kind="danger" title="La clé API n’est pas un secret de navigateur">
        <p>
          Elle permet de demander des codes de liaison et de lire/acquitter les livraisons de <em>tous</em> vos joueurs. Gardez-la sur votre
          serveur dès que possible : voir <A href="/docs/bonnes-pratiques#cle-secrete">Bonnes pratiques</A>.
        </p>
      </Callout>

      <H2 id="erreurs">Erreurs</H2>
      <P>Toute erreur renvoie un statut HTTP 4xx et un corps de cette forme :</P>
      <CodeBlock lang="json" code={json({ error: { code: 'invalid_player_id', message: 'Paramètre player_id obligatoire (200 caractères max).' } })} />
      <P>
        Fiez-vous à <C>error.code</C> (stable) plutôt qu’à <C>error.message</C> (texte en français, susceptible d’évoluer). Les SDK lèvent
        ces erreurs avec <C>status</C>, <C>code</C> et <C>message</C>.
      </P>

      {/* ------------------------------------------------------------------ link-codes */}
      <H2 id="post-link-codes">POST /api/v1/link-codes</H2>
      <Endpoint method="POST" path="/api/v1/link-codes" />
      <P>
        Émet un code de liaison pour un joueur de votre jeu (méthode <C>code</C>). Affichez-le dans le jeu ; le joueur le saisit sur la
        page de liaison. Le code est valable {DOCS_FACTS.linkCodeTtlMin} minutes, à usage unique, et invalide le code précédent du même
        joueur.
      </P>
      <H3 id="link-codes-corps">Corps de la requête</H3>
      <Table
        caption="Paramètres de POST /api/v1/link-codes"
        head={['Champ', 'Type', 'Description']}
        rows={[
          [<C key="a">player_id</C>, 'string, requis', 'Identifiant du joueur dans votre jeu, 1 à 128 caractères (espaces de début/fin retirés).'],
          [<C key="b">player_name</C>, 'string, optionnel', 'Pseudo affiché au joueur pour confirmer la liaison, 64 caractères max. null accepté.'],
        ]}
      />
      <H3 id="link-codes-reponse">Réponse 200</H3>
      <CodeBlock lang="json" code={json({ code: 'K7QF-M2XA', expires_at: '2026-11-09T10:25:00.000Z' })} />
      <P>
        <C>expires_at</C> est une date ISO 8601 (UTC).
      </P>
      <ErrorTable
        rows={[
          [<C key="s">400</C>, <C key="c">invalid_json</C>, 'Corps absent ou JSON invalide.'],
          [<C key="s">400</C>, <C key="c">invalid_request</C>, 'player_id manquant ou trop long, player_name trop long.'],
          ERR_401,
          [<C key="s">403</C>, <C key="c">method_disabled</C>, 'La liaison par code est désactivée pour ce jeu (onglet Intégration).'],
          [
            <C key="s">429</C>,
            <C key="c">rate_limited</C>,
            <>Plus de {DOCS_FACTS.linkCodesPerMinute} codes par minute pour ce jeu. Respectez l’en-tête <C>Retry-After</C> (secondes).</>,
          ],
        ]}
      />
      <CodeTabs
        tabs={[
          {
            label: 'curl',
            code: `curl -X POST "$BASE_URL/api/v1/link-codes" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"player_id":"player_42","player_name":"NovaKnight"}'`,
          },
          {
            label: 'JavaScript',
            code: `const res = await fetch(\`\${BASE_URL}/api/v1/link-codes\`, {
  method: 'POST',
  headers: { Authorization: \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ player_id: 'player_42', player_name: 'NovaKnight' }),
});
if (!res.ok) throw new Error((await res.json()).error.code);
const { code, expires_at } = await res.json();`,
          },
          {
            label: 'Python',
            code: `import os, requests

r = requests.post(
    f"{os.environ['BASE_URL']}/api/v1/link-codes",
    headers={"Authorization": f"Bearer {os.environ['API_KEY']}"},
    json={"player_id": "player_42", "player_name": "NovaKnight"},
    timeout=10,
)
r.raise_for_status()
code = r.json()["code"]`,
          },
        ]}
      />

      {/* ------------------------------------------------------------------ deliveries */}
      <H2 id="get-deliveries">GET /api/v1/deliveries</H2>
      <Endpoint method="GET" path="/api/v1/deliveries?player_id={player_id}" />
      <P>
        Liste les livraisons <strong>ouvertes</strong> d’un joueur — <C>pending</C> et <C>delivered</C> non acquittées —, les plus
        anciennes d’abord, {DOCS_FACTS.deliveriesPageSize} au maximum. À appeler au lancement du jeu, à la connexion du joueur et au retour
        au premier plan.
      </P>
      <Table
        caption="Paramètres de GET /api/v1/deliveries"
        head={['Paramètre', 'Type', 'Description']}
        rows={[[<C key="p">player_id</C>, 'query, requis', 'Identifiant du joueur dans votre jeu (1 à 200 caractères).']]}
      />
      <H3 id="deliveries-reponse">Réponse 200</H3>
      <CodeBlock lang="json" code={json({ data: [EXAMPLE_PURCHASE] })} />
      <P>
        Chaque élément est un <A href="/docs/webhooks#purchase-event">PurchaseEvent</A>. Pour un jeu <strong>sans</strong> URL de webhook,
        lire une livraison <C>pending</C> la fait passer à <C>delivered</C> ; elle reste dans la liste jusqu’à l’ack.
      </P>
      <ErrorTable
        rows={[
          [<C key="s">400</C>, <C key="c">invalid_player_id</C>, 'player_id absent, vide ou de plus de 200 caractères.'],
          ERR_401,
        ]}
      />
      <CodeBlock lang="bash" title="curl" code={`curl "$BASE_URL/api/v1/deliveries?player_id=player_42" \\\n  -H "Authorization: Bearer $API_KEY"`} />

      {/* ------------------------------------------------------------------ stream */}
      <H2 id="get-deliveries-stream">GET /api/v1/deliveries/stream</H2>
      <Endpoint method="GET" path="/api/v1/deliveries/stream?player_id={player_id}" />
      <P>
        Flux <strong>Server-Sent Events</strong> (<C>text/event-stream</C>) : envoie d’abord l’arriéré (comme{' '}
        <C>GET /api/v1/deliveries</C>), puis chaque nouvel achat du joueur en direct. Mêmes paramètres et mêmes erreurs (renvoyées en JSON
        avant l’ouverture du flux).
      </P>
      <UL>
        <li>
          <C>event: purchase</C>, <C>id:</C> le <C>delivery_id</C>, <C>data:</C> le PurchaseEvent en JSON sur une ligne ;
        </li>
        <li>
          un commentaire <C>: ping</C> toutes les {DOCS_FACTS.sseHeartbeatS} secondes (reconnectez-vous si rien n’arrive pendant ~45 s) ;
        </li>
        <li>
          <C>retry: 5000</C> : délai de reconnexion conseillé. À chaque reconnexion l’arriéré est renvoyé : dédoublonnez par{' '}
          <C>delivery_id</C>.
        </li>
      </UL>
      <CodeBlock lang="text" title="Exemple de flux" code={SSE_SAMPLE} />
      <Callout kind="info">
        <p>
          L’<C>EventSource</C> natif des navigateurs ne permet pas d’envoyer l’en-tête <C>Authorization</C>. Lisez le flux avec{' '}
          <C>fetch</C> et un <C>ReadableStream</C>, comme le fait le SDK JavaScript (<C>onPurchase</C>).
        </p>
      </Callout>
      <CodeBlock lang="bash" title="curl" code={`curl -N "$BASE_URL/api/v1/deliveries/stream?player_id=player_42" \\\n  -H "Authorization: Bearer $API_KEY"`} />

      {/* ------------------------------------------------------------------ ack */}
      <H2 id="post-ack">POST /api/v1/deliveries/{'{id}'}/ack</H2>
      <Endpoint method="POST" path="/api/v1/deliveries/{delivery_id}/ack" />
      <P>
        Confirme que le joueur a été crédité : la livraison passe à <C>acknowledged</C> et ne sera plus proposée ni relancée. Aucun corps
        de requête. <strong>Idempotent</strong> : acquitter deux fois renvoie aussi <C>{'{ "ok": true }'}</C>. Accepté depuis{' '}
        <C>pending</C>, <C>delivered</C> et <C>failed</C>.
      </P>
      <H3 id="ack-reponse">Réponse 200</H3>
      <CodeBlock lang="json" code={json({ ok: true })} />
      <ErrorTable
        rows={[
          ERR_401,
          [<C key="s">404</C>, <C key="c">delivery_not_found</C>, 'Aucune livraison avec cet identifiant pour ce jeu (une livraison d’un autre jeu est traitée comme inexistante).'],
        ]}
      />
      <CodeBlock lang="bash" title="curl" code={`curl -X POST "$BASE_URL/api/v1/deliveries/${EXAMPLE_PURCHASE.delivery_id}/ack" \\\n  -H "Authorization: Bearer $API_KEY"`} />

      <H2 id="cors">CORS</H2>
      <P>
        Les routes de livraison (<C>/api/v1/deliveries</C>, <C>/stream</C>, <C>/ack</C>) répondent aux requêtes cross-origin
        (<C>Access-Control-Allow-Origin: *</C>, méthodes <C>GET, POST, OPTIONS</C>, en-têtes <C>Authorization, Content-Type,
        Last-Event-ID</C>) pour les jeux HTML5/WebGL. L’authentification se fait uniquement par l’en-tête <C>Authorization</C>, jamais par
        cookie.
      </P>
      <P>
        <C>POST /api/v1/link-codes</C> est prévu pour être appelé depuis votre serveur ou un client natif ; depuis un navigateur, passez par
        votre serveur.
      </P>
    </DocPage>
  );
}
