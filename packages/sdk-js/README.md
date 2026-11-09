# @wolleen/sdk

SDK JavaScript / TypeScript de Wolleen pour les jeux : **les achats faits sur Wolleen arrivent dans le jeu tout seuls**.
Aucune dépendance. Fonctionne dans le navigateur (HTML5, WebGL, WebView) et sous Node ≥ 20.

```ts
import { Wolleen } from '@wolleen/sdk';

const wolleen = new Wolleen({ apiKey: 'wk_live_…', baseUrl: 'https://wolleen.com', storage: localStorage });

// 1. Liaison (une fois) : afficher un code que le joueur saisit sur Wolleen.
const { code, expires_at } = await wolleen.requestLinkCode(player.id, player.name);

// 2. Livraison : le handler reçoit chaque achat une seule fois ; l'ack part quand il a résolu.
const sub = wolleen.onPurchase(player.id, async (e) => {
  if (e.event === 'purchase.completed') await inventory.add(e.product_id, e.quantity);
  if (e.event === 'purchase.refunded') await inventory.remove(e.product_id, e.quantity);
});

// À la déconnexion du joueur :
sub.unsubscribe();
```

## API

| Méthode | Appel HTTP | Résultat |
|---|---|---|
| `requestLinkCode(playerId, playerName?)` | `POST /api/v1/link-codes` | `{ code, expires_at }` |
| `getPendingPurchases(playerId)` | `GET /api/v1/deliveries?player_id=…` | `PurchaseEvent[]` (en attente + livrées non acquittées) |
| `onPurchase(playerId, handler)` | `GET /api/v1/deliveries/stream` (SSE) + rattrapage | `PurchaseSubscription` (`unsubscribe()`, `catchUp()`, `connected`) |
| `ack(deliveryId)` | `POST /api/v1/deliveries/{id}/ack` | `{ ok: true }` |

Toutes les requêtes envoient `Authorization: Bearer <apiKey>`. Les erreurs de l'API sont levées en `WolleenError`
(`status`, `code`, `message`).

### Garanties de `onPurchase`

- **Temps réel** : flux SSE (`event: purchase`), lu via `fetch` + `ReadableStream` (permet l'en-tête `Authorization`).
  Si un constructeur `EventSource` acceptant `{ headers }` est fourni (option `EventSource`, ex. polyfill), il est utilisé ;
  l'`EventSource` natif n'est utilisé qu'en dernier recours (ou `transport: 'eventsource'`), avec la clé en paramètre `access_token`.
- **Rattrapage** : au démarrage, à chaque reconnexion, quand l'onglet redevient visible (`visibilitychange`) et quand le réseau revient.
- **Reconnexion exponentielle** : 1 s, 2 s, 4 s… jusqu'à 30 s (avec gigue) ; connexion relancée si aucune donnée pendant 45 s
  (le serveur envoie un ping toutes les 15 s). Une clé refusée (401/403) arrête les tentatives et appelle `onError`.
- **Jamais de double crédit** : dédoublonnage par `delivery_id`, handlers exécutés **en série**. Passez `storage: localStorage`
  (ou tout objet `getItem`/`setItem`) pour retenir les livraisons traitées entre deux lancements : si l'ack s'est perdu,
  l'achat renvoyé est seulement ré-acquitté, pas recrédité.
- **Ack après crédit** : si le handler lève une erreur, rien n'est acquitté ; l'achat sera proposé de nouveau.
  `autoAck: false` pour acquitter vous-même avec `ack()`.

### Options

`apiKey` (obligatoire), `baseUrl` (défaut `https://wolleen.com`), `fetch`, `transport` (`auto` | `fetch` | `eventsource`),
`EventSource`, `storage`, `autoAck` (true), `reconnectDelayMs` (1000), `maxReconnectDelayMs` (30000), `idleTimeoutMs` (45000),
`timeoutMs` (15000), `onError`.

> La clé API du jeu est embarquée dans le client : elle ne donne accès qu'aux livraisons et aux codes de liaison du jeu.
> Si votre jeu a un serveur, préférez le **webhook** et gardez la clé côté serveur.

## Côté serveur : vérifier un webhook

```ts
import { verifyWebhookSignature, constructWebhookEvent } from '@wolleen/sdk/server';

// Corps BRUT (avant JSON.parse) + en-tête `Wolleen-Signature: t=…,v1=…` + secret webhook du jeu.
if (!verifyWebhookSignature(rawBody, req.headers['wolleen-signature'], process.env.WOLLEEN_WEBHOOK_SECRET!)) {
  return res.writeHead(401).end();
}
const event = JSON.parse(rawBody); // ou constructWebhookEvent(rawBody, header, secret)
// Créditer de façon idempotente (clé : event.delivery_id), puis répondre 2xx.
```

La signature est `HMAC-SHA256(secret, "<t>.<corps>")` en hexadécimal ; les signatures de plus de 5 minutes sont refusées.
L'appel « player lookup » (`GET …/players/{player_id}`) est signé de la même façon, le corps signé étant l'ID joueur brut.

## Développement

```bash
npm test -w @wolleen/sdk        # tests vitest (fetch simulé)
npm run typecheck -w @wolleen/sdk
npm run build -w @wolleen/sdk   # émet dist/ (ESM + .d.ts)
```

Un exemple complet tourne dans `apps/demo-game` (`npm run demo`).
