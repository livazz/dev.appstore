# @wolleen/importers

Import du catalogue d'achats in-app **existant** d'un studio depuis **App Store Connect** et **Google Play**,
normalisé en `ImportedProduct` (montants en centimes, types de `@wolleen/core`), plus une suggestion de prix web.

Module autonome, sans dépendance externe (signatures JWT ES256 / RS256 via `node:crypto`), `fetch` injectable.
Il n'est pas encore branché dans `apps/web` : ce sera fait après fusion (voir « Intégration prévue »).

```ts
import { importAppStoreCatalog, importGooglePlayCatalog, importCatalog, suggestWebPrice } from '@wolleen/importers';

const { products, warnings } = await importCatalog({
  appStore: {
    credentials: { issuerId: '57246542-…', keyId: '2X9R4HXF34', privateKey: process.env.ASC_KEY_P8! },
    appId: '1561234567', // « Apple ID » de l'app
    territory: 'FRA',    // ISO 3166-1 alpha-3
  },
  googlePlay: {
    serviceAccount: process.env.GOOGLE_PLAY_SA_JSON!, // contenu du fichier JSON
    packageName: 'com.novagames.crystal',
    regionCode: 'FR',    // ISO 3166-1 alpha-2
  },
});

for (const p of products) {
  console.log(p.productId, p.title, p.priceCents, p.currency, '→ web :', suggestWebPrice(p.priceCents, 2000));
}
```

## Type produit

```ts
interface ImportedProduct {
  source: 'app_store' | 'google_play';
  productId: string;      // id produit du store (Google, abonnements : "<productId>:<basePlanId>")
  type: ItemType;         // consumable | non_consumable | auto_renewable | non_renewing
  title: string;          // nom localisé (locale préférée → même langue → en-US → premier)
  subtitle?: string;      // description localisée (Google, abonnements : avantages si pas de description)
  priceCents: number;     // prix client TTC du territoire demandé
  currency: Currency;     // EUR | USD | GBP (autres devises → avertissement)
  period?: Period;        // week | month | year (abonnements)
  sourceId?: string;      // id technique côté store, pour resynchroniser
}
```

Les anomalies ne font pas échouer l'import : elles sont renvoyées dans `warnings`
(`no_price`, `unsupported_currency`, `unsupported_period`, `installments_plan`, `inactive`, `fetch_failed`) et doivent être
montrées au studio avant création des articles. Une erreur d'authentification lève une `StoreApiError` (statut HTTP, URL,
début du corps) ; `importCatalog` la transforme en avertissement `fetch_failed` pour ne pas bloquer l'autre store.

### `suggestWebPrice(priceCents, discountBps = 2000)`

Applique la remise (points de base) puis arrondit au palier `PRICE_TIERS_CENTS` **inférieur** le plus proche.
Exemples avec 20 % : 9,99 → 7,99 ; 1,99 → 1,49 ; 4,99 → 3,99. Au-delà du dernier palier (99,99), arrondit à « X,99 »
inférieur (149,99 → 119,99) au lieu de retomber à 99,99. Retourne `null` si le prix remisé est sous 0,49.

## Correspondances

| Store | Source | Wolleen |
|---|---|---|
| App Store | `inAppPurchaseType` `CONSUMABLE` / `NON_CONSUMABLE` / `NON_RENEWING_SUBSCRIPTION` | `consumable` / `non_consumable` / `non_renewing` |
| App Store | abonnement (groupe d'abonnements) | `auto_renewable`, `subscriptionPeriod` `ONE_WEEK` / `ONE_MONTH` / `ONE_YEAR` → `week` / `month` / `year` |
| App Store | `TWO_MONTHS`, `THREE_MONTHS`, `SIX_MONTHS` | importé sans `period` + avertissement `unsupported_period` |
| App Store | prix | prix en vigueur à la date du jour : `manualPrices` du territoire, sinon `automaticPrices` (péréquation depuis le territoire de base) ; abonnements : `planType` `UPFRONT` uniquement |
| Google Play | produit unique (`monetization.onetimeproducts`) | option d'achat « buy » active, de préférence `legacyCompatible` ; les locations (`rentOption`) sont ignorées |
| Google Play | consommable / non consommable | non exposé par l'API (c'est l'app qui consomme) : option `oneTimeProductType` (valeur ou fonction, défaut `consumable`) |
| Google Play | forfait de base auto-renouvelable / prépayé / à versements | `auto_renewable` / `non_renewing` / `auto_renewable` + avertissement `installments_plan` |
| Google Play | `billingPeriodDuration` ISO 8601 | `P1W`/`P7D` → `week`, `P1M` → `month`, `P1Y`/`P12M` → `year`, autres → avertissement |
| Google Play | prix (`google.type.Money` units + nanos) | centimes, région demandée, uniquement si disponible pour les nouveaux acheteurs |

Produits retirés de la vente / inactifs / brouillons : ignorés avec avertissement `inactive`
(options `includeRemoved` côté Apple, `includeInactive` côté Google pour les garder).

## Obtenir les identifiants

### App Store Connect (clé d'API d'équipe)

1. Se connecter à [App Store Connect](https://appstoreconnect.apple.com) avec un compte **Account Holder** ou **Admin**
   (la première fois, l'Account Holder doit demander l'accès à l'API).
2. **Utilisateurs et accès → Intégrations → App Store Connect API → Clés d'équipe → « + »**.
3. Nommer la clé (ex. « Wolleen import ») et choisir le rôle **App Manager** (lecture des achats intégrés et des prix ;
   éviter Admin).
4. **Télécharger la clé** `AuthKey_<KEY_ID>.p8` : elle n'est téléchargeable **qu'une seule fois**.
5. Relever le **Key ID** (colonne de la clé) et l'**Issuer ID** (en haut de la page, bouton « Copier »).
6. Relever l'**Apple ID** de l'app : **Apps → <app> → Informations sur l'app → Informations générales → Apple ID**
   (nombre, ex. `1561234567` ; ce n'est pas le bundle id).
7. Côté Wolleen, stocker `issuerId`, `keyId` et le contenu du `.p8` (chiffré au repos). Les `\n` littéraux et une clé collée
   sans en-têtes `-----BEGIN PRIVATE KEY-----` sont acceptés.

Le module signe un JWT ES256 (`alg: ES256`, `kid`, `typ: JWT` ; `iss`, `iat`, `exp` ≤ 20 min, `aud: appstoreconnect-v1`),
le réutilise pendant sa validité et le renouvelle automatiquement. Les clés **individuelles** (`sub: user`) ne sont pas gérées.

### Google Play (compte de service)

1. Dans [Google Cloud Console](https://console.cloud.google.com), créer (ou choisir) un projet et **activer
   « Google Play Android Developer API »** (API et services → Bibliothèque).
2. **IAM et administration → Comptes de service → Créer un compte de service** (ex. `wolleen-import`), sans rôle Cloud.
3. Ouvrir le compte → **Clés → Ajouter une clé → Créer une clé → JSON** : un fichier
   `{ "type": "service_account", "client_email": …, "private_key": …, "private_key_id": … }` est téléchargé.
4. Dans la [Play Console](https://play.google.com/console) : **Utilisateurs et autorisations → Inviter des utilisateurs**,
   saisir l'e-mail du compte de service (`…@….iam.gserviceaccount.com`), puis lui donner accès à l'app concernée
   avec au minimum « Voir les informations sur l'application » ; si l'API répond 403 sur les produits, ajouter
   la permission « Gérer les commandes et abonnements » ou « Gérer la présence sur le Play Store » (selon la console, les intitulés varient).
5. Relever le **nom de package** (`com.studio.jeu`).
6. Côté Wolleen, stocker le contenu du fichier JSON (chiffré au repos). Les nouvelles permissions peuvent mettre
   jusqu'à 24 h à se propager (erreur 401/403 « The current user has insufficient permissions » en attendant).

Le module signe une assertion JWT RS256 (`iss` = `client_email`, `scope` = `https://www.googleapis.com/auth/androidpublisher`,
`aud` = `token_uri`, `exp` ≤ 1 h), l'échange sur `https://oauth2.googleapis.com/token`
(`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`) et met le jeton d'accès en cache.

## Endpoints utilisés

App Store Connect (`https://api.appstoreconnect.apple.com`, JSON:API, pagination `links.next`, relances sur 429 / 5xx) :

- `GET /v1/apps/{id}/inAppPurchasesV2?include=inAppPurchaseLocalizations,iapPriceSchedule&limit=200`
- `GET /v1/inAppPurchasePriceSchedules/{id}/manualPrices?filter[territory]=FRA&include=inAppPurchasePricePoint,territory`
  puis, si vide, `…/automaticPrices` (même filtre). Repli : `GET /v2/inAppPurchases/{id}/iapPriceSchedule` si la relation manque.
- `GET /v1/apps/{id}/subscriptionGroups`
- `GET /v1/subscriptionGroups/{id}/subscriptions?include=subscriptionLocalizations`
- `GET /v1/subscriptions/{id}/prices?filter[territory]=FRA&include=subscriptionPricePoint,territory`

Google Play Developer API (`https://androidpublisher.googleapis.com/androidpublisher/v3`, pagination `pageToken`) :

- `GET /applications/{packageName}/oneTimeProducts` (`monetization.onetimeproducts.list`, modèle actuel, défaut)
- `GET /applications/{packageName}/inappproducts` (`inappproducts.list`, ancien modèle : option `oneTimeApi: 'inappproducts'` ;
  Google indique qu'il reste servi tant que Play Billing Library 7 est supportée, et qu'un produit converti au nouveau modèle
  ne se gère plus que par `monetization.onetimeproducts`)
- `GET /applications/{packageName}/subscriptions` (`monetization.subscriptions.list`)

## Quotas et performances

Un appel de prix par achat intégré (deux si le prix est automatique) et un par abonnement, au plus 4 en parallèle
(`concurrency`). Apple limite à environ 3 600 requêtes / heure par clé : un catalogue de 300 articles se lit en
quelques secondes. Google : 3 appels pour la plupart des apps.

## Limites connues

- Devises Wolleen : EUR, USD, GBP. Les autres sont signalées et ignorées.
- Une seule région par import : relancer avec `territory` / `regionCode` pour un autre pays (prix par pays = phase 2).
- Offres d'introduction, codes promo, offres de reconquête, plans mensuels engagés Apple (`planType: MONTHLY`) : non importés.
- Images des produits : non importées (Apple ne les expose que pour la mise en avant, Google pas du tout).

## Intégration prévue (après fusion)

1. Espace studio, page « Importer depuis les stores » (`/studio/games/[id]/import`) : formulaire des identifiants
   (stockés chiffrés, jamais renvoyés au navigateur), appel serveur `importCatalog`, aperçu tableau avec avertissements,
   prix store, prix web suggéré éditable, cases à cocher.
2. Création des articles via le service d'articles existant ; `productId` conservé à l'identique pour que le jeu reconnaisse
   les achats (`product_id` du `PurchaseEvent`). Conflit `items_game_product_uq` → proposer la mise à jour.
3. Resynchronisation ultérieure via `sourceId`.

## Développement

```bash
npm test -w @wolleen/importers
npm run typecheck -w @wolleen/importers
```

Les tests n'appellent aucun réseau : clés générées à la volée, réponses simulées au format des API (voir `src/**/*.test.ts`).

## Sources

- Apple — [Generating Tokens for API Requests](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests),
  [List all In-App Purchases for an app](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-inapppurchasesv2),
  [Read the price schedule for an In-App Purchase](https://developer.apple.com/documentation/appstoreconnectapi/get-v2-inapppurchases-_id_-iappriceschedule),
  [manualPrices](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-inapppurchasepriceschedules-_id_-manualprices),
  [automaticPrices](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-inapppurchasepriceschedules-_id_-automaticprices),
  [List all subscription groups for an app](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-subscriptiongroups),
  [List all subscriptions for a subscription group](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-subscriptiongroups-_id_-subscriptions),
  [List all prices for a subscription](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-subscriptions-_id_-prices).
- Google — document de découverte `androidpublisher v3` (révision 20261108) :
  `https://androidpublisher.googleapis.com/$discovery/rest?version=v3` (ressources `monetization.onetimeproducts`,
  `monetization.subscriptions`, `inappproducts`, schémas `OneTimeProduct`, `Subscription`, `BasePlan`, `Money`, `InAppProduct`) ;
  [Using OAuth 2.0 for Server to Server Applications](https://developers.google.com/identity/protocols/oauth2/service-account) ;
  [billet « New tools to help drive success for one-time products »](https://android-developers.googleblog.com/2025/07/new-tools-to-help-drive-success-for-one-time-products.html) (juillet 2025).
