# Dev AppStore — checklist de revue de sécurité (vague 2)

Checklist **concrète et vérifiable** à appliquer au code livré par la vague 1. Chaque point renvoie aux menaces (`T-…`)
et défauts (`D-…`) de [`threat-model.md`](./threat-model.md).

## Mode d'emploi

1. Travailler sur la branche à revoir, après `npm install --prefer-offline --no-audit --no-fund`, `npm run db:push`, `npm run db:seed`.
2. Pour chaque point : appliquer la **vérification** (lecture ciblée, commande `rg`, test ou requête `curl`), noter le
   résultat dans le tableau de suivi en fin de document : `OK`, `KO` (avec fichier:ligne et correctif proposé), `N/A`
   (fonctionnalité absente — à justifier).
3. Un point **P0 en KO bloque la mise en production**. Un point P1 en KO bloque l'ouverture publique.
4. Quand un point demande un test, le test doit être **ajouté au dépôt** (vitest, `createTestDb()`), pas seulement exécuté à la main.

Conventions : `$W=apps/web/src`, `$API=$W/app/api`. Clés secrètes de démo : `das_secret_demo_crystal_clash` (jeu `gam_crystal`),
`das_secret_demo_pixel_farm` (jeu `gam_farm`) ; clés publiques `das_pub_demo_*` ; serveur local `http://localhost:3000`.

```bash
# Inventaire de départ : toutes les surfaces d'entrée à couvrir
rg -l "export (async )?function (GET|POST|PUT|PATCH|DELETE)" apps/web/src/app      # route handlers
rg -l "^'use server'|^\"use server\"" apps/web/src                                  # server actions
rg -n "fetch\(" apps/web/src packages --glob '!**/*.test.ts'                        # appels sortants
rg -n "process\.env\." apps/web/src packages                                        # configuration
```

---

## 1. Configuration et démarrage

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-CFG-01 | En production, l'application refuse de démarrer si `DATABASE_URL` est vide (pas de repli PGlite). | Lire `packages/db/src/index.ts` ; `NODE_ENV=production DATABASE_URL= node -e "require('@devappstore/db')"` (ou équivalent) doit échouer. | D-17, T-PLT-01 | P1 |
| CHK-CFG-02 | Les variables d'environnement serveur sont validées au démarrage (zod) : `AUTH_SECRET` ≥ 32 octets et ≠ `change-me`, `STRIPE_WEBHOOK_SECRET` présent si `STRIPE_SECRET_KEY` l'est, `CRON_SECRET` présent, `PLATFORM_FEE_BPS` entier 0–3000, `APP_URL` en `https://` en production. | `rg -n "AUTH_SECRET|CRON_SECRET|PLATFORM_FEE_BPS|STRIPE_" apps/web/src` → un module unique de lecture validée ; test unitaire des cas invalides. | D-16, T-AUTH-02, T-PAY-07 | P0 |
| CHK-CFG-03 | `.env.example` liste toutes les variables utilisées (dont `CRON_SECRET`) sans valeur exploitable. | Comparer `rg -o "process\.env\.[A-Z_]+" -N apps/web/src packages \| sort -u` avec `.env.example`. | D-16 | P2 |
| CHK-CFG-04 | `npm run db:seed` refuse de s'exécuter en production ; aucune clé `das_secret_demo*` / `das_test_demo*` (anciennes) / `whsec_demo*` n'est acceptée quand `NODE_ENV=production`. | Lire `packages/db/src/seed.ts` (garde en tête de `main`) ; test : `authenticateGame` rejette `das_test_` en mode production si c'est la politique retenue. | T-PLT-02 | P1 |
| CHK-CFG-05 | Aucun secret réel committé. | `git log -p \| rg -n "sk_live_|rk_live_|whsec_[A-Za-z0-9]{20,}|das_live_"` → vide. | A5 | P0 |
| CHK-CFG-06 | Le stub de session `devappstore_demo_user` a disparu, ou lève une erreur si `NODE_ENV=production`. | `rg -n "devappstore_demo_user|usr_demo_player" apps/web/src` → uniquement dans des tests / la garde. | D-01, T-AUTH-01 | P0 |

## 2. Authentification et session

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-AUTH-01 | `getCurrentUser()` renvoie `null` sans session valide (aucun utilisateur par défaut). | Test : requête sans cookie sur `/account` → redirection `/login?next=%2Faccount`. `curl -sI localhost:3000/account`. | D-01 | P0 |
| CHK-AUTH-02 | Un cookie forgé (ex. `devappstore_demo_user=usr_demo_dev`, ou jeton de session aléatoire) ne donne aucun accès. | `curl -s -b "devappstore_demo_user=usr_demo_dev" localhost:3000/studio -o /dev/null -w "%{http_code} %{redirect_url}\n"` → redirection login. | T-AUTH-01 | P0 |
| CHK-AUTH-03 | Cookie de session : `HttpOnly`, `Secure` (prod), `SameSite=Lax` ou `Strict`, `Path=/`. | Inspecter `Set-Cookie` après connexion (`curl -si -X POST …/api/auth/sign-in/email`). Config Better Auth (`advanced.useSecureCookies`, `defaultCookieAttributes`). | T-AUTH-05 | P1 |
| CHK-AUTH-04 | Limitation de débit active sur connexion, inscription, réinitialisation. | Config Better Auth `rateLimit` ; 20 échecs de connexion rapides → `429`. | T-AUTH-03 | P1 |
| CHK-AUTH-05 | Messages d'erreur de connexion / inscription identiques que le compte existe ou non. | Comparer les réponses pour un e-mail existant (`joueur@devappstore.test`) et inexistant. | T-AUTH-03 | P2 |
| CHK-AUTH-06 | Paramètre `next` : seuls les chemins relatifs sont suivis. | Test unitaire de la fonction de nettoyage : `//evil.tld`, `/\evil.tld`, `https://evil.tld`, `/%2F%2Fevil.tld`, `javascript:alert(1)` → `/`. | T-AUTH-06 | P1 |
| CHK-AUTH-07 | Chaque route handler `POST/PUT/PATCH/DELETE` authentifié par cookie vérifie `Origin` (ou passe par une server action). | Pour chaque fichier listé par l'inventaire : présence d'un contrôle d'origine ; `curl -X POST -H "Origin: https://evil.tld" -b <cookie> localhost:3000/api/checkout` → `403`. | T-AUTH-05 | P1 |
| CHK-AUTH-08 | Comptes studio : e-mail vérifié avant accès aux clés ; 2FA disponible (obligatoire `owner`/`admin` avant ouverture publique). | Config Better Auth (`emailVerification`, plugin `twoFactor`) ; parcours `/studio/signup`. | T-AUTH-04 | P1 |

## 3. Autorisation et isolation multi-tenant

Préparer un **second studio** pour les tests d'accès croisé (ex. `std_evil`, utilisateur `usr_evil`, jeu `gam_evil`) dans
un fichier de test avec `createTestDb()`.

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-MT-01 | **Chaque** server action et route handler de l'espace studio appelle `requireGameAccess(gameId, …)` (ou équivalent) **dans sa propre exécution**, avant toute lecture/écriture. | Lister les server actions (`rg -l "use server" $W`), ouvrir chacune ; aucune ne se repose sur la vérification faite par la page. | T-MT-01 | P0 |
| CHK-MT-02 | Les sous-ressources sont chargées avec leur parent : `WHERE items.id = $itemId AND items.game_id = $gameId` (idem livraisons, commandes, fichiers). | `rg -n "eq\((items|orders|deliveries)\.id" apps/web/src` → chaque occurrence est combinée avec un filtre `gameId` vérifié. | T-MT-02 | P0 |
| CHK-MT-03 | Test d'accès croisé : `usr_evil` ne peut ni lire ni modifier `gam_crystal`, ses articles, ses ventes, ses clés, ses livraisons. | Test vitest qui appelle chaque action studio avec l'identité `usr_evil` et un ID de `gam_crystal` → refus, base inchangée. | T-MT-01/02/04 | P0 |
| CHK-MT-04 | Les requêtes analytiques (ventes, tendances, journaux webhook) filtrent toutes par `game_id` obtenu après contrôle d'accès ; aucun `sql\`` ne concatène une entrée client. | `rg -n "sql\`" apps/web/src` → paramètres uniquement via interpolation Drizzle ; lecture des requêtes de `/studio/games/[id]/sales`. | T-MT-04 | P0 |
| CHK-MT-05 | Les entrées des actions studio sont validées par des schémas zod `.strict()` en liste blanche ; `studioId`, `status`, `apiKeyHash`, `webhookSecret`, `stripeAccountId` ne peuvent jamais venir d'une entrée. | `rg -n "\.set\(" apps/web/src` → aucun `.set(input)` / `.set(body)` / `.set({...data})` brut ; test : envoyer `studioId`/`status:'live'` en plus → ignoré ou 400. | T-MT-05 | P0 |
| CHK-MT-06 | Les rôles sont appliqués selon la matrice du modèle de menaces (§ 6.6) : `finance` ne voit pas le secret webhook et ne change pas l'intégration ; seuls `owner` (et `admin` si retenu) touchent payouts, rotation de clés, membres. | `rg -n "requireGameAccess\(" apps/web/src` → chaque action sensible passe `roles` ; test avec un membre `finance`. | T-MT-03, D-02 | P1 |
| CHK-MT-07 | Un refus d'accès renvoie 403/404 (pas 500) et ne divulgue pas de message interne. | Appeler une route studio d'un autre studio → code HTTP ≠ 500 ; corps sans pile. | D-02 | P1 |
| CHK-MT-08 | Aucune ligne `games` complète n'est envoyée au client (props de composants client, JSON, HTML). | `curl -s localhost:3000/games/crystal-clash \| rg -c "whsec_|api_key_hash|apiKeyHash|webhookSecret"` → 0 ; idem pages studio hors écran « secret » ; `rg -n "select\(\)\.from\(games\)" apps/web/src` → justifier chaque usage. | T-MT-06, D-04 | P1 |
| CHK-MT-09 | Les jeux `draft`/`review`/`suspended` ne sont ni listés, ni consultables, ni achetables publiquement. | `curl` sur le slug d'un jeu passé en `draft` → 404 ; `POST /api/checkout` sur un de ses articles → refus. | T-UPL-08, T-PAY-01 | P1 |

## 4. API v1 et clés API

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-API-01 | Toutes les routes `/api/v1/*` appellent `authenticateGame` et répondent `401` sans clé, avec clé invalide, avec `Bearer` mal formé. | `for p in link-codes deliveries deliveries/stream; do curl -s -o /dev/null -w "$p %{http_code}\n" localhost:3000/api/v1/$p; done` → 401 ; idem avec `-H "Authorization: Bearer das_faux"`. | T-DLV-04 | P0 |
| CHK-API-02 | Toute requête de l'API v1 est restreinte au jeu de la clé : aucun `game_id` n'est lu dans la requête. | Lire chaque route : `game.id` provient d'`authenticateGame` ; test : clé `gam_farm` + `player_id` d'un joueur de `gam_crystal` → liste vide. | T-DLV-05, T-MT-04 | P0 |
| CHK-API-03 | Un jeu `suspended` est refusé par `authenticateGame`. | Test vitest. | D-04 | P1 |
| CHK-API-04 | La clé n'est jamais acceptée dans la query string ni journalisée. | `rg -n "searchParams.get\('(key|api_key|token)'\)" apps/web/src` → vide ; `rg -n "authorization" -i apps/web/src` → aucun `console.log` de l'en-tête. | T-DLV-04 | P1 |
| CHK-API-05 | La clé API est générée par `randomToken` (≥ 24 octets), affichée **une seule fois**, seule l'empreinte et le préfixe sont stockés. | Lire l'action de création/rotation de clé ; la valeur claire n'est ni en base ni renvoyée ensuite. | A3 | P1 |
| CHK-API-06 | **Séparation clé serveur / client** (D-05) : soit deux types de clés avec portées distinctes, soit, à défaut, documentation explicite + SDK qui n'exige jamais la clé secrète côté client. Une clé client ne peut pas : `ack` une livraison d'un autre joueur, lister/streamer un autre `player_id`, créer un code de liaison pour un `player_id` non attesté. | Lecture du schéma (`api_keys` ou équivalent), des routes v1 et de `packages/sdk-js` ; tests de portée. Si la séparation n'est pas implémentée : **KO P0** à arbitrer explicitement par le responsable produit. | D-05, T-LNK-04, T-DLV-04 | P0 |
| CHK-API-07 | Rotation sans interruption possible (plusieurs clés actives, révocation, `last_used_at`). | Schéma + écran Intégration. | T-DLV-04 | P2 |
| CHK-API-08 | Erreurs de l'API v1 au format `apiError` sans message d'exception brut ni pile. | `rg -n "apiError\(.*(e|err|error)\.message" apps/web/src` → vide. | T-PLT-04 | P2 |
| CHK-API-09 | Limitation de débit par clé et par IP sur `/api/v1/*` (`429` + `Retry-After`). | Boucle de 200 requêtes → `429` observé. | T-PLT-06 | P1 |
| CHK-API-10 | CORS : pas de `Access-Control-Allow-Origin` reflétant l'origine avec `Access-Control-Allow-Credentials: true`. | `curl -si -H "Origin: https://evil.tld" localhost:3000/api/v1/deliveries -H "Authorization: Bearer das_pub_demo_pixel_farm"` → pas d'ACAO reflété + credentials. | T-DLV-05 | P1 |

## 5. Liaison de compte

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-LNK-01 | `generateLinkCode` (CSPRNG) est la seule source de codes ; TTL = `LINK_CODE_TTL_MS`. | `rg -n "generateLinkCode|Math.random" apps/web/src packages` → aucun `Math.random` pour un code, un jeton ou un ID. | T-LNK-03 | P0 |
| CHK-LNK-02 | Saisie de code : recherche limitée au jeu de la page (`game_id` + `code` normalisé), refus si expiré ou consommé, **même message** dans tous les cas d'échec. | Lire la server action de `/games/[slug]/link` ; tests : code d'un autre jeu, expiré, consommé → même réponse. | T-LNK-03 | P1 |
| CHK-LNK-03 | Limitation des essais de saisie (par utilisateur et par IP), avec verrouillage temporaire. | Test : 6 codes faux d'affilée → refus temporaire même avec un code valide ensuite. | T-LNK-03 | P1 |
| CHK-LNK-04 | Consommation **atomique** du code et création de la liaison dans la même transaction (`UPDATE … WHERE consumed_at IS NULL AND expires_at > now() RETURNING`). | Lecture ; test de concurrence : deux consommations simultanées (`Promise.all`) → une seule liaison. | T-LNK-08 | P1 |
| CHK-LNK-05 | `POST /api/v1/link-codes` : `player_id` validé (format, longueur ≤ 64), `player_name` borné et nettoyé, plafond de codes actifs par joueur, anciens codes du joueur invalidés, réessai sur collision d'unicité. | Lecture + tests (`player_id` de 10 000 caractères → 400 ; 2 demandes → le premier code ne fonctionne plus). | T-LNK-10, D-13 | P2 |
| CHK-LNK-06 | `id_confirm` uniquement si activé par le studio (`games.linkMethods`) ; liaison enregistrée `verified=0`. | Test : jeu `gam_farm` (`['code']`) → `id_confirm` refusé. | T-LNK-01 | P1 |
| CHK-LNK-07 | Lookup : utilisateur connecté requis, limitation de débit (ex. 10 / h / utilisateur), journalisation. | Lecture + test de débit. | T-LNK-02 | P1 |
| CHK-LNK-08 | `{player_id}` substitué **après** validation de format et `encodeURIComponent`. | Test : `player_id = "../admin?x=1#"` → refusé (400) ou encodé ; l'URL appelée ne change pas de chemin. | T-LNK-06 | P1 |
| CHK-LNK-09 | Requête de lookup signée sur une chaîne qui couvre méthode + chemin + query (+ corps) — pas `signPayload('')`. | `rg -n "signPayload\(" apps/web/src` → aucun appel avec corps vide pour un `GET` ; test : la signature d'un lookup pour `A` ne vérifie pas pour `B`. | D-10, T-LNK-07 | P1 |
| CHK-LNK-10 | Réponse de lookup validée par zod (`PlayerLookupResponse`, longueurs bornées, `avatar_url` `https:`), `response.player_id === player_id demandé`, taille ≤ 16 Kio. | Tests avec un faux serveur renvoyant : un autre `player_id`, un nom de 10 Mo, du HTML. | T-LNK-07 | P1 |
| CHK-LNK-11 | Plafonds montant/vélocité pour les achats sur liaison `verified=0` ; métadonnées `link_method`, `player_id`, `game_id` transmises à Stripe (Radar). | Lecture de la création de session Checkout. | T-LNK-01 | P1 |
| CHK-LNK-12 | La livraison lit `orders.playerId` (figé), jamais `game_links` au moment de l'envoi. | `rg -n "gameLinks|getGameLink" apps/web/src/server/delivery*.ts apps/web/src/app/api/v1` → vide. | T-LNK-11 | P2 |

## 6. Appels sortants vers les URL des studios (anti-SSRF)

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-SSRF-01 | Un seul module effectue les appels vers `webhookUrl` / `playerLookupUrl` (`safeFetch` ou équivalent) ; aucun `fetch(game.webhookUrl…)` direct ailleurs. | `rg -n "webhookUrl|playerLookupUrl" apps/web/src` → les `fetch` passent tous par ce module. | T-LNK-05, T-DLV-08 | P1 |
| CHK-SSRF-02 | En production : `https:` uniquement ; refus de `http:`, `file:`, `data:`, `gopher:`, ports non standard si politique retenue, identifiants dans l'URL (`user:pass@`). | Tests unitaires du validateur. | D-22 | P1 |
| CHK-SSRF-03 | Blocage après **résolution DNS** des IP : `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `100.64/10`, `0.0.0.0/8`, `224/4`, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:0:0/96` (IPv4 mappées), et formes décimales/octales/hex (`2130706433`, `0177.0.0.1`, `0x7f.1`). | Tests unitaires avec ces cas ; un nom DNS résolvant vers `127.0.0.1` (ex. `localtest.me`) est refusé. | T-LNK-05 | P1 |
| CHK-SSRF-04 | Anti-DNS-rebinding : la connexion utilise l'IP validée (agent/`lookup` personnalisé), pas une seconde résolution. | Lecture du code (`dns.lookup` + `Agent` undici avec `connect.lookup`, ou équivalent). | T-LNK-05 | P1 |
| CHK-SSRF-05 | `redirect: 'manual'` (ou `error`) ; 3xx traité comme un échec. | Test avec un faux serveur qui redirige vers `http://169.254.169.254/` → échec, aucune requête suivie. | T-DLV-08 | P1 |
| CHK-SSRF-06 | Timeout (`AbortSignal.timeout`, ≤ 5 s lookup, ≤ 10 s webhook) et taille de réponse lue plafonnée. | Lecture ; test avec un serveur qui ne répond jamais / renvoie 100 Mo. | T-DLV-12 | P1 |
| CHK-SSRF-07 | Le journal d'intégration (`webhook_attempts`, `deliveries.lastError`) ne stocke ni n'affiche plus que quelques centaines d'octets échappés de la réponse ; erreurs réseau normalisées (pas de message système détaillé). | Lecture du dispatcher et de la page `/studio/games/[id]/integration`. | T-DLV-08 | P1 |
| CHK-SSRF-08 | Validation aussi à l'**enregistrement** de l'URL (feedback studio), `localhost` autorisé seulement hors production (seed `http://localhost:4100`). | Lecture de l'action d'enregistrement ; test en `NODE_ENV=production`. | D-22 | P2 |

## 7. Paiement

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-PAY-01 | `POST /api/checkout` n'accepte que `{ itemId }` (zod `.strict()`) ; prix, devise, `productId`, `gameId`, `playerId` lus en base. | Lecture ; test : corps `{ itemId, priceCents: 1, currency: 'USD', quantity: 100 }` → 400 ou valeurs ignorées ; la session Stripe / commande a le prix de la base. | T-PAY-01 | P0 |
| CHK-PAY-02 | Refus si article inactif, jeu non `live`, utilisateur non lié au jeu, studio sans `stripeChargesEnabled` (hors simulation). | Tests vitest pour chaque cas. | T-PAY-01 | P0 |
| CHK-PAY-03 | Prix validés à l'écriture (entier, ∈ `PRICE_TIERS_CENTS` ou bornes) ; montant Stripe = `priceCents × quantity` avec `quantity = 1` en phase 1. | Lecture de l'action de l'éditeur et de la création Checkout. | T-PAY-02, D-09 | P1 |
| CHK-PAY-04 | `application_fee_amount = feeCents(amountCents, PLATFORM_FEE_BPS validé)` calculé côté serveur ; `platformFeeCents` stocké. | Lecture + test. | T-PAY-07 | P1 |
| CHK-PAY-05 | `success_url` / `cancel_url` construites depuis `APP_URL`, jamais depuis `Host` / `X-Forwarded-Host`. | `rg -n "headers\(\).get\('(host|x-forwarded-host)'\)" apps/web/src` → pas utilisé pour des URL. | T-PAY-09 | P1 |
| CHK-PAY-06 | Webhook Stripe : corps brut (`await req.text()`), `stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)` ; `400` si signature absente/invalide ; refus si secret vide. | Lecture ; `curl -X POST localhost:3000/api/stripe/webhook -d '{"type":"checkout.session.completed"}'` → 400, commande inchangée. | T-PAY-03 | P0 |
| CHK-PAY-07 | Passage à `paid` par **transition conditionnelle** (`WHERE status='pending' … RETURNING`) ; `enqueueDelivery` appelé seulement si une ligne a changé. | Lecture ; test : traiter deux fois le même événement → une seule livraison, un seul appel au dispatcher. | T-PAY-04 | P0 |
| CHK-PAY-08 | La commande est retrouvée par `stripeCheckoutSessionId` (unique) ; `payment_status === 'paid'`, `amount_total` et `currency` comparés à la commande ; événements asynchrones (`async_payment_succeeded/failed`) gérés. | Lecture ; test : événement signé avec un montant différent → commande non payée, alerte journalisée. | T-PAY-04 | P0 |
| CHK-PAY-09 | La page `/checkout/success` ne marque rien comme payé (ou relit la session via l'API Stripe et applique la même transition conditionnelle). | Lecture ; visiter `/checkout/success?session_id=cs_faux` → aucune écriture. | T-PAY-06 | P0 |
| CHK-PAY-10 | **Mode simulation impossible en production** : démarrage en échec si `NODE_ENV=production` et `STRIPE_SECRET_KEY` vide ; `sk_live_` exigé en production (sauf drapeau explicite de préproduction). | Lecture du module de config ; `NODE_ENV=production STRIPE_SECRET_KEY= npm run start -w @devappstore/web` → échec. | T-PAY-05 | P0 |
| CHK-PAY-11 | `/checkout/mock` : vérifie côté serveur que le mode simulation est actif, que la commande appartient à l'utilisateur courant et est `pending` ; utilise la même transition conditionnelle. | Tests : commande d'un autre utilisateur → refus ; mode Stripe actif → 404. | T-PAY-05 | P0 |
| CHK-PAY-12 | `stripeAccountId` n'est écrit que par le flux d'onboarding Connect (compte créé côté serveur), réservé au rôle `owner` ; `stripeChargesEnabled` mis à jour par `account.updated` ou relecture API. | `rg -n "stripeAccountId" apps/web/src` → aucune écriture depuis une entrée utilisateur. | T-PAY-08 | P1 |
| CHK-PAY-13 | Les erreurs Stripe ne sont pas renvoyées brutes au client ; pas de log du corps complet des événements. | Lecture. | T-PAY-11 | P2 |

## 8. Livraison (webhook sortant, SDK, SSE, ack, cron)

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-DLV-01 | `enqueueDelivery` refuse une commande non `paid`. | Test : commande `pending` → exception, aucune ligne `deliveries`. | D-06 | P0 |
| CHK-DLV-02 | `enqueueDelivery` est réellement idempotent sous concurrence et renvoie l'ID existant (`insert … onConflictDoNothing().returning()` puis relecture). | Test : `Promise.all([enqueueDelivery(o), enqueueDelivery(o)])` → même ID, une seule ligne, un seul envoi. | D-07 | P1 |
| CHK-DLV-03 | Le webhook sortant est signé par `signPayload(bodyExact, game.webhookSecret)` sur **la chaîne exacte envoyée** (pas de re-sérialisation entre signature et envoi) ; en-tête `DevAppStore-Signature`. | Lecture du dispatcher ; test avec faux serveur qui vérifie via `verifySignature`. | T-DLV-01 | P0 |
| CHK-DLV-04 | Seul un **2xx** passe la livraison à `delivered` ; 3xx/4xx/5xx/timeout → relance selon `nextAttemptAt(attempts ≥ 1)` puis `failed` ; transitions via `canTransition`. | Tests : 302, 500, timeout ; vérifier `attempts` et `nextAttemptAt` (attention à `nextAttemptAt(0)` → `null`, D-14). | T-DLV-03, D-14 | P1 |
| CHK-DLV-05 | Réservation atomique des livraisons dues (pas de double envoi par deux exécutions concurrentes du cron / dispatcher). | Lecture (`UPDATE … WHERE next_attempt_at <= now() … RETURNING` ou `FOR UPDATE SKIP LOCKED`) ; test : deux `dispatchDelivery(id)` simultanés → une seule requête HTTP. | T-DLV-03 | P1 |
| CHK-DLV-06 | Canal créditeur défini : une livraison `delivered` par webhook n'est pas recréditée via le SDK (ou documentation + SDK imposant un magasin d'idempotence commun sur `delivery_id`). | Lecture de `GET /api/v1/deliveries` et du SDK ; décision écrite dans la doc d'intégration. | D-15 | P1 |
| CHK-DLV-07 | `GET /api/v1/deliveries` et `/stream` : `player_id` obligatoire et validé ; filtre `game_id = jeu authentifié AND player_id = …`. | Test : sans `player_id` → 400 ; clé `gam_farm` ne voit rien de `gam_crystal`. | T-DLV-05 | P0 |
| CHK-DLV-08 | `POST /api/v1/deliveries/{id}/ack` : `WHERE id = $1 AND game_id = <jeu authentifié>` ; 404 identique pour « inexistant » et « autre jeu » ; idempotent (`ack` répété → `{ ok: true }` sans effet). | Tests : ack d'une livraison de `gam_crystal` avec la clé `gam_farm` → 404, statut inchangé. | T-DLV-07 | P0 |
| CHK-DLV-09 | SSE : clé uniquement en en-tête ; heartbeat ; durée max de connexion ; plafond de connexions par clé/joueur ; `Content-Type: text/event-stream`, `Cache-Control: no-cache`, désabonnement à la fermeture (`req.signal`). | Lecture ; ouvrir 100 flux avec la même clé → refus au-delà du plafond ; vérifier l'absence de fuite d'écouteurs (`AbortSignal`). | T-DLV-05/06 | P2 |
| CHK-DLV-10 | Les événements SSE ne contiennent que le `PurchaseEvent` du joueur (pas d'e-mail ni de données d'autres joueurs). | Lecture du sérialiseur. | T-PLT-07 | P1 |
| CHK-DLV-11 | `/api/cron/deliveries` : refus si `CRON_SECRET` vide ; comparaison à temps constant de `Authorization: Bearer <secret>` ; traitement par lots bornés. | `curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/cron/deliveries` et `-H "Authorization: Bearer undefined"` → 401 ; `rg -n "CRON_SECRET" apps/web/src`. | T-DLV-11 | P1 |
| CHK-DLV-12 | Secret webhook : affiché seulement aux rôles autorisés, jamais dans une réponse d'API ni un composant client hors écran dédié ; rotation possible ; chiffré au repos (ou décision documentée de report). | Lecture de la page Intégration et du schéma. | T-DLV-09, D-16 | P1 |
| CHK-DLV-13 | Changement de `webhookUrl` / `playerLookupUrl` / rotation : rôle restreint, ré-authentification ou confirmation, entrée d'audit. | Lecture. | T-DLV-10 | P2 |
| CHK-DLV-14 | Le SDK (`packages/sdk-js`) expose `verifyWebhook(rawBody, header, secret)` (temps constant, tolérance, multi-`v1`) et documente l'idempotence obligatoire sur `delivery_id` ; il persiste les `delivery_id` crédités avant l'`ack`. | Lecture du SDK et de son README ; test unitaire de `verifyWebhook`. | T-DLV-01/02, D-12 | P1 |
| CHK-DLV-15 | URL `webhook_attempts.url` journalisées sans query string sensible. | Lecture. | T-PLT-04 | P2 |

## 9. Uploads et contenu studio

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-UPL-01 | `POST /api/uploads` exige un utilisateur membre d'un studio (et rattache le fichier au studio). | `curl -s -o /dev/null -w "%{http_code}" -F file=@x.png localhost:3000/api/uploads` sans session → 401. | T-UPL-04 | P1 |
| CHK-UPL-02 | Type déterminé par les **octets** (sharp `metadata().format`), liste blanche PNG/JPEG/WebP(/GIF) ; **SVG refusé** ; l'extension et le `Content-Type` client sont ignorés. | Tests : SVG avec `<script>`, HTML renommé `.png`, polyglotte GIF/JS → refus. | T-UPL-01 | P0 |
| CHK-UPL-03 | Ré-encodage systématique par sharp (suppression EXIF/ICC superflus), `limitInputPixels` défini, dimensions et taille max (ex. 5 Mo) contrôlées **avant** lecture complète. | Lecture ; test : PNG 20 000 × 20 000 → refus sans pic mémoire. | T-UPL-01/03 | P1 |
| CHK-UPL-04 | Clé de stockage générée côté serveur (`newId` + extension du format réel) ; le nom de fichier client n'apparaît jamais dans le chemin. | Lecture ; `rg -n "\.name\b" $API/uploads` → pas utilisé dans un chemin. | T-UPL-02 | P0 |
| CHK-UPL-05 | `GET /api/uploads/[...key]` : regex stricte sur la clé, `path.resolve` + vérification du préfixe racine ; refus de `..`, `%2e%2e`, `%2f`, `\`, `%00`, segments multiples non prévus. | `for k in ..%2F..%2F.env %2e%2e/%2e%2e/package.json ..\\..\\.env a/../../.env; do curl -s -o /dev/null -w "$k %{http_code}\n" "localhost:3000/api/uploads/$k"; done` → 400/404, jamais le contenu. | T-UPL-02 | P0 |
| CHK-UPL-06 | En-têtes de service : `Content-Type` forcé selon le format stocké, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control` adapté. | `curl -sI localhost:3000/api/uploads/<clé>`. | T-UPL-01 | P0 |
| CHK-UPL-07 | `iconUrl`, `bannerUrl`, `models[].imageUrl` n'acceptent que des URL d'uploads Dev AppStore (ou `data:image/` du seed en dev). | Test sur l'action de l'éditeur : `https://pistage.tld/x.png`, `javascript:…` → refus. | T-UPL-05 | P2 |
| CHK-UPL-08 | Couleurs `ItemStyle` / `GameTheme` validées (`^#[0-9a-fA-F]{6}$` ou `transparent`), nombres bornés (`GRID_LIMITS`, `borderWidth`), `layout ∈ 1..6`, `bgType` énuméré. | Test : `bg1 = "red, url(https://pistage.tld/x)"` → refus. | T-UPL-06, D-18 | P2 |
| CHK-UPL-09 | Aucun `dangerouslySetInnerHTML` sur du contenu studio/joueur ; `href` dynamiques limités à `https:`/chemins relatifs. | `rg -n "dangerouslySetInnerHTML" apps/web/src` → vide ou justifié (contenu statique) ; `rg -n "href=\{" apps/web/src` → revue. | T-UPL-07 | P1 |

## 10. En-têtes HTTP, journaux, dépendances

| ID | Vérification | Comment vérifier | Réf. | Prio |
|---|---|---|---|---|
| CHK-HDR-01 | En-têtes globaux : `Content-Security-Policy` (scripts avec nonce ou `'self'`, `frame-ancestors 'none'`, `form-action 'self' https://checkout.stripe.com`), `Strict-Transport-Security` (prod), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. | `curl -sI localhost:3000/ \| rg -i "content-security|strict-transport|x-content-type|referrer|frame"` ; `apps/web/next.config.ts` ou `middleware.ts`. | D-20, T-PLT-03, T-AUTH-07 | P1 |
| CHK-LOG-01 | Aucun log d'en-tête `Authorization`, de clé, de secret webhook, de cookie, de corps de webhook complet. | `rg -n "console\.(log|info|error)\(" apps/web/src` → revue de chaque appel. | T-PLT-04 | P2 |
| CHK-LOG-02 | Actions studio sensibles journalisées (prix, intégration, clés, membres, payouts) avec acteur et horodatage. | Lecture (table d'audit) — peut être `N/A` en vague 2 si reporté et tracé. | T-AUTH-08 | P2 |
| CHK-DEP-01 | Pas de nouvelle dépendance non justifiée ; `npm audit --omit=dev` sans vulnérabilité haute/critique exploitable. | `git diff main -- package.json '**/package.json'` ; `npm audit --omit=dev`. | T-PLT-05 | P2 |
| CHK-DEP-02 | `ci.yml` : `permissions: contents: read` ; pas de `pull_request_target`. | Lecture. | D-21 | P3 |

## 11. Tests de sécurité minimaux à exiger dans le dépôt

La vague 2 vérifie la **présence** de ces tests (vitest + `createTestDb()`) et les ajoute s'ils manquent :

- [ ] Accès croisé studio A / studio B sur chaque action studio (CHK-MT-03).
- [ ] Mass assignment : champs interdits ignorés ou rejetés (CHK-MT-05).
- [ ] API v1 sans clé / clé d'un autre jeu → 401 / 404 (CHK-API-01, CHK-API-02, CHK-DLV-08).
- [ ] Webhook Stripe non signé → 400 ; événement rejoué → une seule livraison (CHK-PAY-06, CHK-PAY-07).
- [ ] Montant ou devise incohérents dans l'événement → commande non payée (CHK-PAY-08).
- [ ] Mode simulation refusé en production (CHK-PAY-10).
- [ ] `enqueueDelivery` sur commande `pending` → refus ; concurrence → un seul ID (CHK-DLV-01, CHK-DLV-02).
- [ ] Signature du webhook sortant vérifiable par `verifySignature` sur le corps exact (CHK-DLV-03).
- [ ] Consommation concurrente d'un code de liaison → une seule liaison (CHK-LNK-04).
- [ ] Validateur SSRF : liste d'URL/IP interdites (CHK-SSRF-02, CHK-SSRF-03) et redirection refusée (CHK-SSRF-05).
- [ ] Upload SVG/HTML refusé ; clé traversante refusée (CHK-UPL-02, CHK-UPL-05).
- [ ] Nettoyage du paramètre `next` (CHK-AUTH-06).

---

## Tableau de suivi (à remplir par la vague 2)

| ID | Résultat (OK / KO / N/A) | Fichier:ligne | Correctif / commentaire |
|---|---|---|---|
| CHK-CFG-02 | | | |
| CHK-CFG-05 | | | |
| CHK-CFG-06 | | | |
| CHK-AUTH-01 | | | |
| CHK-AUTH-02 | | | |
| CHK-MT-01 | | | |
| CHK-MT-02 | | | |
| CHK-MT-03 | | | |
| CHK-MT-04 | | | |
| CHK-MT-05 | | | |
| CHK-API-01 | | | |
| CHK-API-02 | | | |
| CHK-API-06 | | | |
| CHK-LNK-01 | | | |
| CHK-PAY-01 | | | |
| CHK-PAY-02 | | | |
| CHK-PAY-06 | | | |
| CHK-PAY-07 | | | |
| CHK-PAY-08 | | | |
| CHK-PAY-09 | | | |
| CHK-PAY-10 | | | |
| CHK-PAY-11 | | | |
| CHK-DLV-01 | | | |
| CHK-DLV-03 | | | |
| CHK-DLV-07 | | | |
| CHK-DLV-08 | | | |
| CHK-UPL-02 | | | |
| CHK-UPL-04 | | | |
| CHK-UPL-05 | | | |
| CHK-UPL-06 | | | |
| *(points P1–P3 : ajouter une ligne par point revu)* | | | |

Le tableau ci-dessus pré-remplit les **points P0** ; la revue n'est terminée que lorsque chacun a un résultat.
