# @devappstore/sdk

SDK JavaScript / TypeScript de Dev AppStore pour les jeux : **les achats faits sur Dev AppStore arrivent dans le jeu tout seuls**.
Aucune dépendance. Fonctionne dans le navigateur (HTML5, WebGL, WebView) et sous Node ≥ 20. Modules ES et CommonJS,
types TypeScript inclus.

## Installation

```bash
npm i @devappstore/sdk
```

```ts
import { DevAppStore } from '@devappstore/sdk';                    // client du jeu (navigateur, Node)
import { verifyWebhookSignature } from '@devappstore/sdk/server';   // serveur du studio (Node, node:crypto)
// CommonJS : const { DevAppStore } = require('@devappstore/sdk');
```

La référence complète de l'API HTTP est publiée au format OpenAPI 3.1 sur `https://devappstore.com/api/openapi.json`
(générateurs de clients, Postman, Insomnia…).

## Deux clés, deux usages

| Votre jeu… | Clé (page *Intégration*) | Où | Accès |
|---|---|---|---|
| **n'a pas de serveur** | publique `das_pub_…` | dans le client du jeu (non secrète) | codes de liaison ; puis, avec le **jeton joueur** obtenu après la liaison, les achats de **ce joueur** |
| **a un serveur** | secrète `das_secret_…` | sur votre serveur uniquement, **jamais** dans le jeu | tous les joueurs : codes de liaison, livraisons, acks, révocation des jetons |

Tout ce qui est embarqué dans un jeu peut être extrait : n'y mettez jamais la clé secrète. Un jeu avec serveur reçoit
de préférence les achats par **webhook signé** (voir plus bas).

## Jeu sans serveur (clé publique + jeton joueur)

```ts
import { DevAppStore } from '@devappstore/sdk';

const devappstore = new DevAppStore({ publishableKey: 'das_pub_…', baseUrl: 'https://devappstore.com', storage: localStorage });

// 1. Liaison, une fois par appareil : afficher un code que le joueur saisit sur Dev AppStore.
if (!devappstore.isLinked(player.id)) {
  const link = await devappstore.requestLinkCode(player.id, player.name); // { code, expires_at, link_request_id }
  showCode(link.code);
  await devappstore.waitForLink(link); // interroge la demande ; le jeton joueur est mémorisé dans `storage`
}

// 2. Livraison : le handler reçoit chaque événement une seule fois ; l'ack part quand il a résolu.
const sub = devappstore.onPurchase(player.id, async (e) => {
  if (e.event === 'purchase.completed') await inventory.grant(e.order_id, e.product_id, e.quantity);
  if (e.event === 'purchase.refunded') await inventory.revoke(e.order_id); // seulement si cet order_id avait été crédité
});

// « Délier cet appareil » : révoque le jeton côté Dev AppStore et l'oublie.
await devappstore.unlink(player.id);
sub.unsubscribe();
```

- `onPurchase` appelé avant la liaison **attend** : il démarre tout seul dès que `waitForLink` (ou `setPlayerToken`) a
  fourni un jeton. Un jeton révoqué (401 `player_token_required`) est oublié et l'abonnement se remet en attente :
  proposez alors de nouveau « Lier mon compte web ».
- Le jeton joueur (`das_pt_…`) est délivré **une seule fois** par demande de liaison. Il ne donne accès qu'aux achats
  du joueur faits par le compte Dev AppStore qui a saisi le code. Passez `storage: localStorage` (ou tout objet
  `getItem` / `setItem` / `removeItem`) pour le conserver entre deux lancements.

## Serveur du studio (clé secrète, Node)

```ts
const devappstore = new DevAppStore({ apiKey: process.env.DEVAPPSTORE_SECRET_KEY, baseUrl: 'https://devappstore.com' });
const { code } = await devappstore.requestLinkCode(session.playerId, session.playerName); // à afficher dans le jeu
const purchases = await devappstore.getPendingPurchases(playerId);                       // tous les achats du joueur
await devappstore.ack(deliveryId);
await devappstore.unlink(playerId); // révoque tous les jetons joueur (appareils liés via la clé publique) de ce joueur
```

## API

| Méthode | Appel HTTP | Résultat |
|---|---|---|
| `requestLinkCode(playerId, playerName?)` | `POST /api/v1/link-codes` | `{ code, expires_at, link_request_id }` |
| `getLinkRequest(linkRequestId)` | `GET /api/v1/link-requests/{id}` | `{ status: 'pending' \| 'linked' \| 'expired' \| 'claimed', player_token? }` |
| `waitForLink(link, { intervalMs?, signal?, timeoutMs? })` | idem, toutes les 3 s | jeton joueur (clé publique) ou `null` (clé secrète) |
| `getPlayerToken(playerId)` / `setPlayerToken(playerId, token \| null)` / `isLinked(playerId)` | — | jeton mémorisé |
| `unlink(playerId)` | `DELETE /api/v1/player-tokens` | nombre de jetons révoqués |
| `getPendingPurchases(playerId)` | `GET /api/v1/deliveries?player_id=…` | `PurchaseEvent[]` (en attente + livrées non acquittées) |
| `onPurchase(playerId, handler)` | `GET /api/v1/deliveries/stream` (SSE) + rattrapage | `PurchaseSubscription` (`unsubscribe()`, `catchUp()`, `connected`) |
| `ack(deliveryId, playerId?)` | `POST /api/v1/deliveries/{id}/ack` | `{ ok: true }` |

Toutes les requêtes envoient `Authorization: Bearer <clé>` et, avec la clé publique, `DevAppStore-Player-Token: <jeton>`.
**Aucune clé ni aucun jeton n'est jamais placé dans une URL.** Les erreurs de l'API sont levées en `DevAppStoreError`
(`status`, `code`, `message`). L'API autorise les appels depuis n'importe quelle origine (CORS, sans cookies).

### Événements

`PurchaseEvent` : `event`, `delivery_id`, `order_id`, `game_id`, `player_id`, `product_id`, `item_type`, `quantity`,
`amount_cents` (centimes), `currency`, `created_at`.

- `purchase.completed` : créditer le joueur.
- `purchase.refunded` : la commande `order_id` a été remboursée ou contestée. Mêmes `product_id`, `quantity`… que l'achat,
  `delivery_id` propre. Retirez l'objet **si cet `order_id` avait été crédité**, sinon ignorez l'événement ; acquittez
  dans les deux cas. Un achat remboursé avant d'avoir été reçu n'est plus livré.

### Garanties de `onPurchase`

- **Temps réel** : flux SSE (`event: purchase`), lu via `fetch` + `ReadableStream` (en-têtes possibles). Un constructeur
  `EventSource` acceptant `{ headers }` (option `EventSource`, ex. polyfill) peut être fourni. L'`EventSource` natif du
  navigateur n'est jamais utilisé ; sans fetch-stream, le SDK rattrape les achats toutes les 30 s.
- **Rattrapage** : au démarrage, à chaque reconnexion, quand l'onglet redevient visible (`visibilitychange`) et quand le réseau revient.
- **Reconnexion exponentielle** : 1 s, 2 s, 4 s… jusqu'à 30 s (avec gigue) ; connexion relancée si aucune donnée pendant 45 s
  (le serveur envoie un ping toutes les 15 s). Une clé refusée (401/403) arrête les tentatives et appelle `onError`.
- **Jamais de double crédit** : dédoublonnage par `delivery_id`, handlers exécutés **en série**. Avec `storage`, les
  livraisons traitées sont retenues entre deux lancements : si l'ack s'est perdu, l'achat renvoyé est seulement ré-acquitté.
- **Ack après crédit** : si le handler lève une erreur, rien n'est acquitté ; l'achat sera proposé de nouveau.
  `autoAck: false` pour acquitter vous-même avec `ack()`.

### Options

`publishableKey` ou `apiKey` (l'une des deux), `baseUrl` (défaut `https://devappstore.com`), `fetch`, `transport`
(`auto` | `fetch` | `eventsource`), `EventSource`, `storage`, `autoAck` (true), `reconnectDelayMs` (1000),
`maxReconnectDelayMs` (30000), `idleTimeoutMs` (45000), `timeoutMs` (15000), `onError`.

## Côté serveur : vérifier un webhook

```ts
import { verifyWebhookSignature, constructWebhookEvent } from '@devappstore/sdk/server';

// Corps BRUT (avant JSON.parse) + en-tête `DevAppStore-Signature: t=…,v1=…` + secret webhook du jeu.
if (!verifyWebhookSignature(rawBody, req.headers['devappstore-signature'], process.env.DEVAPPSTORE_WEBHOOK_SECRET!)) {
  return res.writeHead(401).end();
}
const event = JSON.parse(rawBody); // ou constructWebhookEvent(rawBody, header, secret)
// Idempotence obligatoire (clé : event.delivery_id), puis répondre 2xx.
// event.event === 'purchase.refunded' : révoquer l'achat event.order_id s'il avait été crédité.
```

La signature est `HMAC-SHA256(secret, "<t>.<corps>")` en hexadécimal ; les signatures de plus de 5 minutes sont refusées.
Dev AppStore ne suit pas les redirections : l'URL du webhook doit répondre directement (2xx), en `https://` en production.
L'appel « player lookup » (`GET …/players/{player_id}`) est signé de la même façon, le corps signé étant l'ID joueur brut.

## Développement

```bash
npm test -w @devappstore/sdk        # tests vitest (fetch simulé, build et contenu du paquet)
npm run typecheck -w @devappstore/sdk
npm run build -w @devappstore/sdk   # émet dist/ : ESM (dist/*.js), CommonJS (dist/cjs/*.js), déclarations .d.ts
npm pack --dry-run -w @devappstore/sdk  # contenu publié : dist/, README.md, package.json
```

Dans le monorepo, les autres paquets consomment **le build** (`dist/`, comme un utilisateur npm) : `apps/demo-game`
reconstruit le SDK avant `dev`, `start`, `test` et `typecheck` (scripts `pre*`). Après une modification du SDK, relancez
`npm run build -w @devappstore/sdk` si un processus du jeu de démo tourne déjà. Les tests du SDK, eux, portent sur `src/`.

Publication (à faire par un mainteneur, jamais depuis la CI sans accord) : mettre à jour `version` dans `package.json`,
`SDK_VERSION` dans `src/client.ts` et `CHANGELOG.md`, puis `npm publish -w @devappstore/sdk` (le `prepack` reconstruit `dist/`).

Un exemple complet tourne dans `apps/demo-game` (`npm run demo`) : Pixel Farm utilise ce SDK avec la clé publique.
