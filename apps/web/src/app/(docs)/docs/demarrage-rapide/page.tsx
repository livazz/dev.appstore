import { CodeBlock } from '@/components/docs/CodeBlock';
import { CodeTabs } from '@/components/docs/CodeTabs';
import { A, C, Callout, DocPage, H2, H3, P, Step, Steps, UL, docMetadata } from '@/components/docs/prose';
import { SHELL_ENV } from '@/lib/docs/examples';
import { DOCS_FACTS } from '@/lib/docs/facts';

export const metadata = docMetadata('demarrage-rapide');

const LINK_TABS = [
  {
    label: 'JavaScript',
    code: `import { DevAppStore } from '@devappstore/sdk';

const client = new DevAppStore({ apiKey: process.env.API_KEY, baseUrl: process.env.BASE_URL });

// Écran « Lier un compte web » de votre jeu
const { code, expires_at } = await client.requestLinkCode(player.id, player.name);
showLinkCode(code); // ex. « K7QF-M2XA », valable ${DOCS_FACTS.linkCodeTtlMin} min`,
  },
  {
    label: 'curl',
    code: `curl -X POST "$BASE_URL/api/v1/link-codes" \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"player_id":"player_42","player_name":"NovaKnight"}'

# → {"code":"K7QF-M2XA","expires_at":"2026-11-09T10:25:00.000Z"}`,
  },
  {
    label: 'Unity',
    code: `devappstore.RequestLinkCode(PlayerAccount.Name,
    code => linkLabel.text = $"Code de liaison : {code.code}",
    err => linkLabel.text = "Réessayez plus tard");`,
  },
];

const RECEIVE_TABS = [
  {
    label: 'Webhook (Node)',
    title: 'server.js — votre serveur de jeu',
    code: `import express from 'express';
import { verifyWebhookSignature } from '@devappstore/sdk/server';

const app = express();
app.post('/webhooks/purchases', express.raw({ type: 'application/json' }), async (req, res) => {
  const raw = req.body.toString('utf8');
  if (!verifyWebhookSignature(raw, req.get('DevAppStore-Signature'), process.env.WEBHOOK_SECRET)) {
    return res.sendStatus(401);
  }
  const event = JSON.parse(raw);
  await creditOnce(event);  // idempotent sur event.delivery_id
  res.sendStatus(200);      // 2xx = livré
});`,
  },
  {
    label: 'JavaScript',
    title: 'client — SDK temps réel',
    code: `const sub = client.onPurchase(player.id, async (e) => {
  if (e.event === 'purchase.completed') await inventory.add(e.product_id, e.quantity);
  if (e.event === 'purchase.refunded') await inventory.remove(e.product_id, e.quantity);
  await save(); // l'ack part automatiquement quand ce handler a résolu
});`,
  },
  {
    label: 'Unity',
    code: `devappstore = DevAppStoreClient.Create(apiKey, baseUrl, pollIntervalSeconds: 30);
devappstore.OnPurchase += e =>
{
    if (e.IsRefund) Inventory.Remove(e.product_id, e.quantity);
    else Inventory.Add(e.product_id, e.quantity);
    SaveGame(); // persistez AVANT de rendre la main : l'ack part juste après
};
devappstore.SetPlayer(PlayerAccount.Id);`,
  },
  {
    label: 'curl',
    code: `curl "$BASE_URL/api/v1/deliveries?player_id=player_42" \\
  -H "Authorization: Bearer $API_KEY"

# → {"data":[{"event":"purchase.completed","delivery_id":"dlv_…","product_id":"gems_500",…}]}`,
  },
];

const ACK_TABS = [
  {
    label: 'curl',
    code: `curl -X POST "$BASE_URL/api/v1/deliveries/dlv_Xq3vR8sK2mN7pL4w/ack" \\
  -H "Authorization: Bearer $API_KEY"

# → {"ok":true}`,
  },
  {
    label: 'JavaScript',
    code: `// Avec autoAck: false, acquittez vous-même après la sauvegarde :
await client.ack(event.delivery_id);`,
  },
  {
    label: 'Godot',
    code: `Save.write()                  # 1. crédit persisté
DevAppStore.ack(p.delivery_id)    # 2. puis seulement l'accusé de réception`,
  },
];

export default function QuickstartPage() {
  return (
    <DocPage slug="demarrage-rapide">
      <H2 id="compte-studio">1. Créer un compte studio</H2>
      <P>
        Rendez-vous sur <A href="/studio/signup">la page d’inscription studio</A> : nom, adresse e-mail et mot de passe suffisent. Votre
        espace studio regroupe vos jeux, vos ventes et vos paiements (versements Stripe Connect, onglet <strong>Paiements</strong>).
      </P>

      <H2 id="creer-le-jeu">2. Créer le jeu</H2>
      <P>
        Dans l’espace studio, choisissez <strong>Nouveau jeu</strong> (<A href="/studio/games/new">/studio/games/new</A>) puis
        renseignez le nom, la catégorie et la devise de la boutique. Le jeu est créé en <em>brouillon</em>.
      </P>
      <P>Deux secrets s’affichent alors :</P>
      <UL>
        <li>
          la <strong>clé API</strong> (<C>das_…</C>) : elle authentifie vos appels à l’API v1 et au SDK ;
        </li>
        <li>
          le <strong>secret de signature webhook</strong> (<C>whsec_…</C>) : il permet de vérifier que les webhooks et les appels
          « player lookup » viennent bien de Dev AppStore.
        </li>
      </UL>
      <Callout kind="warn">
        <p>
          La clé API n’est montrée qu’une fois : copiez-la dans votre gestionnaire de secrets. Vous pourrez la régénérer depuis l’onglet
          <strong> Intégration</strong> du jeu.
        </p>
      </Callout>

      <H2 id="editeur-boutique">3. Composer la boutique</H2>
      <P>
        L’onglet <strong>Boutique</strong> du jeu ouvre l’éditeur : bannière, dégradé de fond, icône, six mises en page et curseurs de
        grille. Ajoutez vos articles avec le bouton <strong>+</strong> : titre, sous-titre, prix (paliers), type (consommable, non
        consommable, abonnement) et <strong>identifiant produit</strong>.
      </P>
      <Callout kind="info" title="L’identifiant produit, c’est votre contrat avec le jeu">
        <p>
          Il est transmis tel quel dans chaque achat (<C>product_id</C>). Utilisez les mêmes identifiants que dans votre code de jeu
          (et, sur iOS, que vos produits In-App Purchase équivalents) : <C>gems_500</C>, <C>no_ads</C>…
        </p>
      </Callout>

      <H2 id="integration">4. Intégrer en 3 étapes</H2>
      <P>Définissez d’abord deux variables pour suivre les exemples (la clé de démonstration fonctionne après <C>npm run db:seed</C>) :</P>
      <CodeBlock lang="bash" code={SHELL_ENV} />

      <Steps>
        <Step>
          <H3 id="etape-liaison">Étape 1 : lier le compte du joueur</H3>
          <P>
            Le joueur doit relier son compte Dev AppStore à son compte dans votre jeu, une seule fois. Le plus simple : votre jeu demande
            un code et l’affiche ; le joueur le saisit sur la page de liaison du jeu. Alternative sans interface dans le jeu : la méthode{' '}
            <A href="/docs/concepts#methode-id-confirm">id_confirm</A>.
          </P>
          <CodeTabs tabs={LINK_TABS} />
        </Step>
        <Step>
          <H3 id="etape-reception">Étape 2 : recevoir les achats</H3>
          <P>
            Si votre jeu a un serveur, renseignez l’URL de webhook dans l’onglet <strong>Intégration</strong> : chaque achat y est envoyé
            signé. Sinon, le SDK reçoit les achats directement dans le client (temps réel en JavaScript, interrogation au premier plan sur
            Unity, Godot et Unreal). <A href="/docs/concepts#webhook-ou-sdk">Comment choisir ?</A>
          </P>
          <CodeTabs tabs={RECEIVE_TABS} />
        </Step>
        <Step>
          <H3 id="etape-ack">Étape 3 : créditer puis acquitter</H3>
          <P>
            Créditez le joueur, <strong>sauvegardez</strong>, puis acquittez la livraison. Tant qu’elle n’est pas acquittée, elle reste
            proposée : un plantage entre la réception et la sauvegarde ne fait jamais perdre un achat. Les SDK acquittent automatiquement
            quand votre handler se termine sans erreur.
          </P>
          <CodeTabs tabs={ACK_TABS} />
        </Step>
      </Steps>

      <H2 id="tester">Tester de bout en bout</H2>
      <UL>
        <li>
          Sans clé Stripe configurée, le paiement passe en <strong>mode simulation</strong> : vous pouvez acheter vos propres articles sans
          carte.
        </li>
        <li>
          L’onglet <strong>Intégration</strong> envoie un <strong>événement de test</strong> signé à votre webhook (en-tête{' '}
          <C>{DOCS_FACTS.testHeader}: 1</C>, <C>player_id</C> = <C>test_player</C>, montant nul) et affiche le journal des livraisons
          avec leurs tentatives.
        </li>
        <li>
          Avant publication, les membres du studio peuvent lier leur compte et acheter dans le jeu en brouillon.
        </li>
        <li>
          En local, <C>npm run demo</C> lance un faux jeu avec son serveur (port 4100) branché sur les jeux de démonstration.
        </li>
      </UL>
      <P>
        Prochaine lecture : <A href="/docs/bonnes-pratiques">les bonnes pratiques</A> avant la mise en production.
      </P>
    </DocPage>
  );
}
