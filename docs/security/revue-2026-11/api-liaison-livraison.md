# Revue de sécurité 2026-11 — API publique v1, clés API, liaison de compte, livraison, appels sortants

- **Date** : 10 novembre 2026 — revue en lecture seule (aucune modification du code applicatif), branche `claude/secu-api-bf963a`
  sur `9f336f1`.
- **Périmètre** : sections 4, 5, 6 et 8 de [`review-checklist.md`](../review-checklist.md), menaces 6.2 et 6.4 de
  [`threat-model.md`](../threat-model.md). Fichiers lus : `apps/web/src/app/api/v1/**`, `server/api-key.ts`,
  `player-tokens.ts`, `delivery.ts`, `delivery-http.ts`, `api-rate-limit.ts`, `rate-limit.ts` (dont
  `PostgresRateLimitStore`), `auth-rate-limit.ts` (`clientIp`), `events.ts`, `linking.ts` (codes, `id_confirm`, garde
  SSRF), `packages/db/src/notify.ts`, `api/cron/deliveries`, actions de l'onglet Intégration et `LinkSettings`,
  `packages/core/src/crypto.ts`, `packages/sdk-js/src/*`, `lib/openapi/spec.ts`.
- **Méthode** : lecture ciblée et tests d'exploitation jetables (vitest + `createTestDb()`, appel direct des route
  handlers). Les constats **F1, F2, F4 et F6** ont été **reproduits** (14 assertions vertes, fichier supprimé ensuite, extrait
  en annexe). Les autres sont vérifiés par lecture du code. Ce qui n'a pas pu être vérifié est marqué « plausible ».

## Corrections apportées (10 novembre 2026, même branche)

Tests de non-régression : `apps/web/src/server/secu-2026-11.test.ts` (30 tests), plus les compléments indiqués.
Vérifié : `npm run typecheck`, `npm test` (tous verts, sauf `packages/db/src/migrations.test.ts`, rouge **par construction** tant que
la migration n'est pas générée, cf. « À faire à la fusion » ; avec la migration générée localement puis retirée, il passe),
`npm run build -w @devappstore/web`. E2E non relancés.

| # | Statut | Correctif | Test |
|---|---|---|---|
| F1 | **Corrigé** | Quota par jeu compté **par source** (`codesPerGame` 120/min pour la clé secrète, `codesPerGamePublishable` 600/min pour la clé publique) ; un code public n'invalide **aucun** code ; un code secret n'invalide que les codes secrets du joueur (`linking.ts`, `createLinkCode`, option `source`, renvoie `linkRequestId`). Reste : un attaquant disposant de nombreuses IP réelles peut encore épuiser le quota *public* d'un jeu (le serveur du studio n'est plus affecté). | `secu-2026-11` « F1 » (3 tests) |
| F2 | **Corrigé** | Place de flux par joueur **et par origine** : `stream:player:<jeu>:secret:<joueur>` ou `…:user:<compte du jeton>:<joueur>` (`api-rate-limit.ts`). | « F2 » |
| F3 / A-05 | **Corrigé** | Utilitaire unique `server/client-ip.ts` : n-ième valeur de `X-Forwarded-For` en partant de la droite, `TRUSTED_PROXY_HOPS` (défaut 1, 0 = en-têtes ignorés), validation du format IP ; utilisé par l'API v1, les formulaires de connexion / inscription (`auth-rate-limit.ts` réexporte `clientIp`) et la liaison. Non traité : `payments.ts:163` a sa propre extraction (hors périmètre « paiement », métadonnée Stripe et non limiteur) ; l'éviction du magasin mémoire reste possible mais n'est plus pilotable par un en-tête falsifié. | « F3 / A-05 » (4 tests) ; `auth-security.test.ts` et `v1-rate-limit.test.ts` adaptés (valeur de gauche falsifiée ignorée) |
| F4 | **Corrigé** | `acknowledgeDelivery` : un achat dont la commande n'est plus `paid` ou arrêté pour rétractation répond `ok` sans effet (ni statut `acknowledged`, ni e-mail). | « F4 » |
| F5 | **Corrigé** | Lookup signé sur `devappstore-lookup-v1:<player_id>` (`signLookup` / `verifyLookupSignature` dans `@devappstore/core` et le SDK `@devappstore/sdk/server`, `signLookupRequest`). **Changement de contrat** pour les studios qui vérifiaient l'ancien format : docs (`/docs/player-lookup`, README du SDK), exemple de vecteur et jeu de démo mis à jour. | « F5 », `sdk-js/src/server.test.ts`, `demo-game/src/app.test.ts`, `lib/docs/examples.test.ts` |
| F6 | **Corrigé** | `::ffff:0:0/96` (contrôle de l'IPv4 incluse), `64:ff9b:1::/48`, `2001:10::/28`, `2001:20::/28` bloqués. | « F6 » |
| F7 | **Corrigé** | Chiffrement au repos sans dépendance (`server/webhook-secrets.ts` sur `server/secrets.ts` : AES-256-GCM, HKDF de `AUTH_SECRET`/`BETTER_AUTH_SECRET`, `info` dédié, AAD = id du jeu, format `enc:v1:…`) ; valeurs historiques en clair chiffrées à la première utilisation ; rotation avec **recouvrement de 24 h** (deux `v1=` signés, `signPayloadMulti`) ou immédiate (case « secret compromis ») ; `verifySignature` (core) accepte plusieurs `v1`. Limite documentée : changer `AUTH_SECRET` rend les secrets illisibles (message explicite, régénération par le studio). `createGame` (studio, hors périmètre) écrit encore le secret en clair : chiffré au premier envoi. | « F7 » (3 tests) |
| F8 / A-08 | **Corrigé** | Rotations (clé secrète, clé publique, secret webhook), révocation de l'ancienne clé, URL du webhook et URL de recherche réservées à **owner / admin** (`INTEGRATION_ADMINS`) ; `developer` garde l'affichage du secret, l'événement de test, les relances, la révocation de jetons ; nouvelle table `integration_audit_log` (acteur, rôle, action, URL sans query string, jamais de secret) affichée dans l'onglet Intégration. Non fait : notification e-mail aux propriétaires, ré-authentification. | « F8 / A-08 » (2 tests) |
| F9 | **Corrigé** | Ancienne clé secrète acceptée 24 h après rotation (`apiKeyPreviousHash`, `…ExpiresAt`), révocation immédiate possible (« clé compromise » ou bouton « Révoquer maintenant »), `apiKeyLastUsedAt` / `apiKeyPreviousLastUsedAt` (au plus toutes les 5 min) affichés. Pas de table multi-clés (deux clés au plus). | « F9 » (2 tests) |
| F10 | **Corrigé** | Saisies de code : 30 / 15 min par IP (tous comptes) ; recherches `id_confirm` : 30 / 10 min par IP ; alerte journalisée au-delà de 200 échecs / 15 min pour un jeu (magasin `getRateLimitStore`, partagé si `RATE_LIMIT_STORE=postgres`). | « F10 » (2 tests) |
| F11 | **Corrigé** | Un code demandé avec la clé publique renvoie `confirmation_required` (rien n'est consommé) ; la page affiche le `player_id` visé, le nom déclaré « non vérifié » et une mise en garde, puis « Oui, c'est mon compte de jeu ». Codes du serveur du studio : inchangé. | « F11 » (2 tests) |
| F12 | **Corrigé** | Expiration glissante des jetons joueur : 90 jours sans usage (`PLAYER_TOKEN_IDLE_TTL_MS`), sans changement de schéma. Compatible SDK : `401 player_token_required` ⇒ le SDK oublie le jeton et repasse en attente de liaison (comportement existant). | « F12 » |
| F13 | **Partiel** | Fait : `authenticateGame` supprimée ; le SDK refuse une clé secrète dans un navigateur (`window` + `document`), option `dangerouslyAllowSecretKeyInBrowser` ; rattrapages après reconnexion LISTEN étalés (`resyncJitterMs`, 5 s) ; `verifySignature` multi-`v1`. Non fait : plafonds de flux SSE partagés entre instances (toujours par instance, documenté dans `docs/deploy.md`). | « F13 », `sdk-js/src/client.test.ts`, `delivery.test.ts`, `v1-keys.test.ts` |

### À faire à la fusion

1. **Schéma modifié, migration non générée** (consigne) : `packages/db/src/schema/studio.ts` ajoute à `games` les colonnes
   `webhook_secret_previous`, `webhook_secret_previous_expires_at`, `api_key_previous_hash`, `api_key_previous_prefix`,
   `api_key_previous_expires_at`, `api_key_last_used_at`, `api_key_previous_last_used_at`, et la table
   `integration_audit_log` (+ index `integration_audit_game_idx`). Lancer `npm run db:generate -w @devappstore/db`
   (vérifié localement : migration `0003` sans invite, puis `migrations.test.ts` vert), puis `npm run db:push`.
2. **`apps/web/src/env.ts`** (non modifié ici) : ajouter `TRUSTED_PROXY_HOPS` (optionnel, entier 0–10, défaut 1). Déjà
   dans `.env.example` et `docs/deploy.md` ; `client-ip.ts` le lit directement et lève une erreur si la valeur est invalide.
3. Studios existants : prévenir du changement de signature du lookup (F5) ; le jeu de démo est à jour.
4. Relancer les e2e (`cd e2e && npx playwright test --trace off`) : le parcours utilise la clé secrète, donc sans étape
   de confirmation, mais l'onglet Intégration a changé pour le rôle `developer`.

## Synthèse

L'architecture est saine sur l'essentiel : clés séparées (secrète / publique + jeton joueur), portée stricte
`(jeu, player_id, compte acheteur)` sur la liste, le flux et l'ack, consommation atomique des codes, garde SSRF
complète (résolution contrôlée à la connexion, pas de redirection, délais et tailles bornés), signature sur la chaîne
exacte envoyée, bail atomique contre la double livraison, NOTIFY réduit à des identifiants avec relecture en base.
**Aucun accès aux livraisons d'un autre jeu ou d'un autre joueur, aucun contournement SSRF exploitable et aucune
falsification de webhook n'ont été trouvés.**

Les faiblesses restantes portent sur la **disponibilité** : la clé publique (non secrète par conception) suffit pour
bloquer la liaison de tous les joueurs d'un jeu (F1) ou le flux temps réel d'un joueur ciblé (F2).

| # | Gravité | Constat | Statut |
|---|---|---|---|
| F1 | **Haute** | La clé publique permet d'épuiser le quota de codes de liaison du jeu (120/min, toutes sources confondues) et d'invalider le code affiché à un joueur ciblé, y compris un code émis par le serveur du studio | reproduit |
| F2 | Moyenne | Un tiers obtient un jeton joueur pour le `player_id` d'une victime et occupe ses 3 places de flux SSE : le serveur du studio comme l'appareil de la victime reçoivent `429 too_many_streams` | reproduit |
| F3 | Moyenne | Limites « par IP » de l'API v1 contournables en changeant `X-Forwarded-For` hors d'un proxy qui réécrit l'en-tête ; éviction du magasin mémoire | vérifié (lecture + utilisé dans F1) |
| F4 | Basse | `ack` accepté sur une livraison arrêtée (rétractation / remboursement) : elle passe à `acknowledged` et déclenche l'e-mail « achat livré » | reproduit |
| F5 | Basse | Même format et même secret HMAC pour l'appel « player lookup » (`t.player_id`) et pour les webhooks (`t.corps`) : pas de séparation de domaine | vérifié (lecture) ; exploitation plausible seulement |
| F6 | Basse | Garde SSRF : préfixes IPv6 `::ffff:0:0/96` (IPv4 traduites), `64:ff9b:1::/48` (NAT64 local) et `2001:20::/28` non bloqués | reproduit (impact plausible seulement) |
| F7 | Moyenne | Secret webhook : stocké en clair, rotation sans période de recouvrement (coupure immédiate des webhooks en vol et des relances) | vérifié (lecture) |
| F8 | Basse | Changement de `webhookUrl` / `playerLookupUrl` et rotation de clés sans journal d'audit, notification ni ré-authentification ; ouvert au rôle `developer` | vérifié (lecture) |
| F9 | Basse | Une seule clé secrète par jeu, rotation avec coupure immédiate, pas de `last_used_at` | vérifié (lecture) |
| F10 | Basse | Saisie de code et recherche `id_confirm` limitées **par utilisateur** seulement (ni par IP, ni globalement par jeu, aucune alerte) | vérifié (lecture) |
| F11 | Basse | Code demandé avec la clé publique : aucun écran de confirmation avant la liaison ; `player_name` choisi par le client affiché comme « Actuellement lié à … » | vérifié (lecture) |
| F12 | Basse | Jetons joueur sans expiration ; un jeton volé (stockage local) permet indéfiniment d'acquitter les livraisons de ce compte | vérifié (lecture) |
| F13 | Info | Plafonds de flux par instance (10 000 par clé publique) et rattrapage simultané de tous les flux à chaque reconnexion LISTEN ; `authenticateGame` (mort) renvoie la ligne complète avec les secrets ; le SDK accepte une clé secrète dans un navigateur sans avertir | vérifié (lecture) ; impact plausible |

---

## Constats détaillés

### F1 — Haute — Déni de service sur la liaison par code via la clé publique

**Où** : `apps/web/src/server/linking.ts:146-156` (quota `codesPerGame` = 120/min compté sur **toutes** les lignes
`link_codes` du jeu, quelle que soit la clé), `linking.ts:161-165` (création d'un code ⇒ expiration immédiate des codes
actifs du même `player_id`, quelle que soit leur source), `apps/web/src/app/api/v1/link-codes/route.ts:31` (accessible
avec la seule clé publique), limites de `guardApi` (`api-rate-limit.ts:29` : 20/min par IP, 600/min par clé).

**Scénarios** (la clé publique `das_pub_…` est embarquée dans chaque client du jeu, donc publique) :

1. *Blocage global* : 120 requêtes `POST /api/v1/link-codes` par minute avec des `player_id` aléatoires (6 IP, ou une
   seule avec `X-Forwarded-For` variable, cf. F3) ⇒ plus **aucun** code ne peut être émis pour ce jeu, **y compris par le
   serveur du studio avec sa clé secrète** (`429 rate_limited`). La liaison est un préalable à tout achat : les ventes
   du jeu s'arrêtent tant que l'attaque dure. Coût pour l'attaquant : 2 requêtes par seconde et par jeu visé.
2. *Blocage ciblé* : le `player_id` d'un joueur est souvent visible (pseudo, ID affiché en jeu, classement). Un script
   qui demande un code pour ce `player_id` toutes les quelques secondes fait expirer immédiatement le code affiché au
   joueur légitime : il ne peut jamais se lier.

**Reproduit** : un code émis avec la clé secrète pour `victim_42` devient inutilisable (`redeemLinkCode` → échec) dès qu'un
code est demandé avec la clé publique pour le même `player_id`. Après 130 demandes publiques (IP variables), une
demande avec la clé secrète reçoit `429`.

**Correctif proposé** :
- séparer les quotas par source : le quota par jeu ne s'applique qu'aux codes `source = 'publishable'` ; le serveur du
  studio (clé secrète) a son propre quota, nettement plus haut ;
- côté clé publique, ajouter un quota **par `player_id`** (ex. 5 codes / 10 min) et un quota par IP plus serré ;
- ne pas laisser un code `publishable` invalider un code `secret` : n'expirer que les codes de **même source** (ou ne pas
  invalider du tout côté public : la création d'un nouveau code public ne doit pas annuler un code en cours, plafonner
  plutôt le nombre de codes actifs par `player_id` à 2 ou 3) ;
- à moyen terme, un jeton d'attestation de plateforme (App Attest / Play Integrity) ou un défi (preuve de travail
  légère) sur la clé publique.

**Tests de non-régression** :
- `link-codes` : 200 demandes publiques avec IP variables ⇒ une demande avec la clé secrète reste `200` ;
- un code `secret` pour `P` reste utilisable après une demande publique pour `P` ;
- au-delà de N demandes publiques pour le même `player_id` dans la fenêtre ⇒ `429`, sans effet sur les autres joueurs.

### F2 — Moyenne — Occupation des places de flux SSE d'un joueur ciblé

**Où** : `apps/web/src/server/api-rate-limit.ts:111` (clé de concurrence `stream:player:${gameId}:${playerId}`, plafond
3, sans le compte acheteur), `api-rate-limit.ts:37-42` ; `link-codes/route.ts:14-15` (n'importe qui peut obtenir un jeton
pour n'importe quel `player_id`).

**Scénario** : l'attaquant demande un code avec la clé publique pour le `player_id` de la victime, le saisit avec **son
propre** compte Dev AppStore, échange la demande contre un jeton `das_pt_…` (portée : `player_id` de la victime, achats de
l'attaquant — donc aucune fuite de données). Il ouvre 3 flux `GET /api/v1/deliveries/stream` et les rouvre toutes les
30 min. Sur cette instance, plus personne ne peut ouvrir de flux pour ce joueur : ni l'appareil de la victime, ni le
serveur du studio (clé secrète). Le SDK de la victime réessaie en boucle (`client.ts:567-603`) et ne reçoit plus les achats
en temps réel (rattrapage seulement au rétablissement). Avec N instances, il faut 3 × N flux.

**Reproduit** : 3 flux ouverts avec le jeton de l'attaquant ⇒ le flux de la clé secrète pour le même `player_id` reçoit
`429 too_many_streams`.

**Correctif proposé** : inclure le compte acheteur dans la clé de concurrence pour les jetons
(`stream:player:${gameId}:${playerId}:${userId}`) et donner à la clé secrète un compteur séparé
(`stream:secret:${gameId}:${playerId}`). Optionnel : un flux plus récent du même jeton remplace le plus ancien au lieu
d'être refusé.

**Test de non-régression** : 3 flux avec un jeton (compte A, joueur P) ⇒ un flux avec un jeton (compte B, joueur P) et un
flux avec la clé secrète pour P sont acceptés ; un 4e flux du compte A pour P ⇒ `429`.

### F3 — Moyenne — Limites « par IP » contournables selon le déploiement

**Où** : `apps/web/src/server/auth-rate-limit.ts:76-79` (`clientIp` prend la **première** valeur de `X-Forwarded-For`,
fournie par le client si le proxy ajoute au lieu de remplacer), utilisée par `guardApi` (`api-rate-limit.ts:77-83`) ;
`rate-limit.ts:47,82-89` (magasin mémoire plafonné à 100 000 clés avec éviction des plus anciennes).

**Scénario** : derrière un proxy qui *ajoute* l'IP (nginx `proxy_add_x_forwarded_for`, ALB, Cloudflare sans réécriture),
chaque requête avec un `X-Forwarded-For` différent tombe dans un compteur neuf : les limites par IP (600/min global,
20/min `link-codes`, 60/min `stream`, 120/min `link-requests`) ne servent plus à rien (utilisé dans la reproduction de F1).
En magasin mémoire, des centaines de milliers d'IP fictives évincent aussi les compteurs **par clé** les plus anciens, ce
qui remet à zéro les limites par clé. Sur Vercel, `X-Forwarded-For` est réécrit par la plateforme : risque faible
dans ce cas (non vérifiable ici). Point transverse probablement aussi relevé par la revue « auth ».

**Correctif proposé** : variable `TRUSTED_PROXY_HOPS` (ou `TRUST_PROXY`) validée dans `env.ts` ; prendre la n-ième valeur
**en partant de la droite** ; en l'absence de configuration en production, utiliser `x-real-ip` posé par la plateforme
ou refuser de démarrer. Ne pas évincer les compteurs par clé avant les compteurs par IP (deux magasins distincts).

**Tests** : `clientIp` avec `X-Forwarded-For: 6.6.6.6, 203.0.113.7` et 1 saut de confiance ⇒ `203.0.113.7` ; 150 000 IP
fictives ⇒ le compteur `v1:key:…` n'est pas réinitialisé.

### F4 — Basse — `ack` d'une livraison arrêtée

**Où** : `apps/web/src/server/delivery.ts:553-575` (aucune condition sur le statut source à part `≠ acknowledged` ; le
commentaire l. 551 accepte explicitement `failed`), sans `canTransition` (`packages/core/src/delivery.ts:11`).

**Scénario** : une livraison arrêtée par rétractation (`failed`, `WITHDRAWAL_STOP_REASON`) ou par remboursement avant
confirmation (`delivery.ts:128-131`) peut être acquittée par le serveur du studio, ou par le joueur lui-même avec son jeton.
Elle passe à `acknowledged` sur une commande `refunded`, ce qui déclenche l'e-mail « achat livré » (`notifyDelivered`)
et fausse le journal et les analytics. Si le remboursement Stripe de la rétractation a échoué, la nouvelle tentative du
joueur est bloquée par `withdrawalBlocker` (`withdrawal.ts:76`, `already_delivered`). Pas de gain financier direct
identifié.

**Correctif proposé** : refuser l'ack (réponse `{ ok: true }` sans effet, ou `409`) quand la commande n'est plus `paid`
ou que `lastError = WITHDRAWAL_STOP_REASON` ; passer les transitions par `canTransition`.

**Test** : livraison `failed` avec `WITHDRAWAL_STOP_REASON` ⇒ après ack, le statut reste `failed` et aucun e-mail ne part.

### F5 — Basse — Pas de séparation de domaine entre la signature du lookup et celle des webhooks

**Où** : `linking.ts:498` (`signPayload(playerId, webhookSecret)` ⇒ HMAC de `${t}.${player_id}`) et `delivery.ts:250`
(`signPayload(body, webhookSecret)` ⇒ HMAC de `${t}.${corps}`), même en-tête `DevAppStore-Signature`.

**Scénario (plausible)** : l'en-tête d'un lookup est une signature valide de webhook pour un *corps* égal au
`player_id` saisi (64 caractères au plus, accolades et guillemets permis par `playerIdSchema`). Quelqu'un qui capture un
en-tête de lookup (journal du studio, proxy, APM) dispose pendant 300 s d'un en-tête qui passe `verifyWebhookSignature`
pour ce corps, par exemple un JSON court. L'exploitation suppose cette capture et un endpoint webhook peu strict sur le
schéma : non démontrée.

**Correctif** : préfixer la chaîne signée du lookup (`lookup.v1.${t}.GET.${chemin}.${player_id}`) ou utiliser un en-tête
distinct (`DevAppStore-Lookup-Signature`), avec une période de transition dans le SDK (`verifyLookupSignature`).

**Test** : la signature produite par `fetchPlayerLookup` pour `X` ne vérifie pas avec `verifyWebhookSignature(X, …)`.

### F6 — Basse — Préfixes IPv6 spéciaux non couverts par la garde SSRF

**Où** : `linking.ts:294-331` (`isBlockedAddress`).

**Constat reproduit** : `::ffff:0:127.0.0.1` (IPv4 traduite, SIIT `::ffff:0:0/96`), `64:ff9b:1::7f00:1` (NAT64
local `64:ff9b:1::/48`, RFC 8215) et `2001:20::1` (ORCHIDv2) ne sont pas bloquées. `::ffff:a.b.c.d`, `::`, `::1`, ULA,
lien local, NAT64 `64:ff9b::/96` et 6to4 le sont bien. Impact plausible seulement : il faut un hôte dont la pile route ces
préfixes vers une ressource interne (passerelle NAT64/SIIT dans le VPC). Les formes IPv4 décimales, octales et hex sont
normalisées par l'analyseur WHATWG avant contrôle : OK.

**Correctif** : ajouter `::ffff:0:0/96` (contrôle des 32 bits bas comme pour les mappées), `64:ff9b:1::/48`,
`2001:20::/28`, `2001:10::/28` ; ou basculer en liste blanche « unicast global » (`2000::/3` moins les sous-plages
réservées).

**Test** : `isBlockedAddress` renvoie `true` pour ces trois adresses.

### F7 — Moyenne — Secret webhook en clair et rotation sans recouvrement

**Où** : `apps/web/src/app/studio/games/[id]/integration/actions.ts:61-68` (nouveau secret immédiatement actif, l'ancien
oublié) ; `packages/db` (colonne `games.webhookSecret` en clair) ; `revealWebhookSecret` (l. 53-59) ouvert à
`owner/admin/developer`.

**Scénario** : (a) rotation après une fuite ⇒ toutes les livraisons en vol et les relances signées avec le nouveau secret
sont rejetées par le serveur du studio tant qu'il n'est pas redéployé (livraisons en échec, relances épuisées) ; le studio
hésite donc à tourner le secret. (b) Un dump de base (sauvegarde, réplique, injection SQL ailleurs) donne les secrets de
**tous** les studios ⇒ faux `purchase.completed` acceptés partout (T-DLV-09). Le SDK accepte déjà plusieurs `v1`
(`sdk-js/src/server.ts:45-54`), mais le serveur n'en émet qu'un.

**Correctif** : colonne `webhookSecretPrevious` + `previousExpiresAt` (24 h), double `v1=` dans l'en-tête pendant la
transition ; chiffrement applicatif (AES-GCM, clé maître dans l'environnement, validée par `env.ts`) ou décision de report
écrite (D-16).

**Tests** : après rotation, l'en-tête contient deux `v1` vérifiables avec l'ancien et le nouveau secret ; après expiration,
un seul. Si chiffrement : la valeur en base ≠ secret clair.

### F8 — Basse — Changements d'intégration sans audit

**Où** : `integration/actions.ts:14` (`EDITORS` inclut `developer`), `:75-94` (`updateWebhookUrl`), `:34-51`
(rotations de clés), `components/studio/link-settings-actions.ts:26` (`playerLookupUrl`).

**Scénario** : un compte `developer` compromis redirige `webhookUrl` vers son serveur (`player_id`, montants de tous les
achats suivants) ou fait tourner la clé secrète (coupure du studio), sans trace ni alerte au propriétaire (T-DLV-10).

**Correctif** : réserver URL et rotations à `owner/admin` (ou confirmation par mot de passe / 2FA récente), entrée d'audit
(acteur, ancienne → nouvelle valeur masquée), e-mail aux propriétaires.

**Test** : `updateWebhookUrl` par un `developer` ⇒ refus (si la décision est prise) ; par un `owner` ⇒ une ligne d'audit.

### F9 — Basse — Rotation de la clé secrète avec coupure

**Où** : `integration/actions.ts:34-41`, `server/api-key.ts:119` (une seule empreinte `games.apiKeyHash`).

**Impact** : la rotation après une fuite coupe immédiatement le serveur du studio ; aucune date de dernière utilisation
pour savoir si l'ancienne clé sert encore (CHK-API-07, P2).

**Correctif** : table `api_keys` (plusieurs clés actives, `last_used_at`, `revoked_at`, expiration programmée de l'ancienne).

**Test** : deux clés actives authentifient ; la clé révoquée ⇒ `401` ; `last_used_at` mis à jour (au plus toutes les 5 min).

### F10 — Basse — Essais de saisie et recherches limités par utilisateur seulement

**Où** : `linking.ts:52-58`, `:233-239` (5 échecs / 15 min **par utilisateur**), `:541-548` (10 recherches / 10 min par
utilisateur).

**Analyse** : avec 2⁴⁰ codes et 10 000 codes actifs, il faut environ 10⁸ essais pour une chance sur deux, soit environ
2·10⁷ comptes à ce rythme : la force brute reste impraticable tant que la création de comptes est elle-même limitée
(domaine « auth »). Mais le point CHK-LNK-03 demande aussi une limite par IP et l'oracle `id_confirm` (T-LNK-02) n'est
limité que par compte. Aucune alerte sur un taux d'échec anormal par jeu.

**Correctif** : compteurs supplémentaires par IP (`getRateLimitStore()`, ex. 20 échecs / h) et par jeu (alerte au-delà d'un
seuil), mêmes réponses qu'aujourd'hui.

**Test** : 21 échecs depuis la même IP avec 5 comptes différents ⇒ refus temporaire.

### F11 — Basse — Liaison sans confirmation pour les codes « publics »

**Où** : `linking.ts:262-265` (lien `verified = 0` créé directement), `app/(player)/games/[slug]/link/page.tsx:67,95`
(`playerName` fourni par le client affiché).

**Scénario** (arnaque « achète pour moi », T-LNK-01/09) : l'escroc génère un code avec la clé publique, avec
`player_name` = « Ton compte » (64 caractères, nettoyé des caractères invisibles mais libre), et fait saisir ce code à la
victime ; ses achats suivants partent vers le joueur de l'escroc. Avec `id_confirm`, une étape « Est-ce bien vous ? »
existe ; avec un code public, non.

**Correctif** : pour un code `source = 'publishable'`, page de confirmation « Les achats seront livrés à
<player_id> (nom déclaré par le jeu : …) », avec l'ID mis en avant et le badge « non vérifié ».

**Test** : saisie d'un code public ⇒ état « à confirmer » sans lien créé tant que la confirmation n'est pas envoyée.

### F12 — Basse — Jetons joueur sans expiration

**Où** : `server/api-key.ts:91-104` (seul `revokedAt` est contrôlé), stockage côté SDK (`client.ts:151-163`, `localStorage`).

**Impact** : un jeton exfiltré (XSS dans un jeu HTML5, appareil partagé) donne indéfiniment le droit de lister et
d'**acquitter** les livraisons de ce compte pour ce joueur : le jeu légitime ne les verra plus (non-livraison). Révocable
par le joueur (désliaison) ou le studio, mais seulement une fois le problème remarqué.

**Correctif** : expiration glissante (ex. 90 jours sans usage, `lastUsedAt` existe déjà) et rotation à l'échange.

**Test** : jeton dont `lastUsedAt` date de plus de 90 jours ⇒ `401 player_token_required`.

### F13 — Info — Points de durcissement

- `api-rate-limit.ts:35-43` : plafonds de flux **par instance** (10 000 par clé publique) ; avec les flux de 30 min et la
  limite d'ouverture par IP contournable (F3), une poignée de clients peut tenir des milliers de connexions.
  `events.ts:133-142` : à chaque reconnexion LISTEN, tous les flux relisent la base en même temps (2 requêtes par flux) :
  pic de charge potentiel (plausible, non mesuré). Étaler les `onResync` (gigue de 0 à 10 s).
- `server/api-key.ts:129-134` : `authenticateGame` n'est plus appelé nulle part et renvoie `select()` complet (dont
  `webhookSecret`, `apiKeyHash`) : à supprimer pour éviter une réutilisation imprudente.
- `packages/sdk-js/src/client.ts:86-90` : toute clé non `das_pub_` est traitée comme secrète, même dans un navigateur.
  Lever une erreur si `typeof window !== 'undefined'` et que la clé commence par `das_secret_` / `das_live_` / `das_test_`.
- `packages/core/src/crypto.ts:12-20` (`verifySignature` côté serveur) ne gère qu'un `v1` ; à aligner sur le SDK si F7
  est corrigé.
- NOTIFY (`notify.ts`, `events.ts:89-160`) : charge utile réduite à des identifiants, envoyée en paramètre
  (`pg_notify($1,$2)` / client paramétré), canal validé par regex, notification ignorée si le jeu et le joueur relus ne
  correspondent pas : **pas d'injection possible** ; un acteur capable d'envoyer un NOTIFY ne provoque qu'une relecture.

---

## Statut de la checklist

Légende : **OK** vérifié conforme · **KO** non conforme (constat associé) · **Partiel** conforme sur l'essentiel, réserve
notée · **NV** non vérifiable dans ce périmètre.

### 4. API v1 et clés API

| ID | Statut | Justification |
|---|---|---|
| CHK-API-01 | OK | Les 6 routes v1 passent par `guardApi` → `authenticateApi` (`api-rate-limit.ts:85-86`) ; `Bearer` absent, mal formé, inconnu ou > 200 caractères ⇒ `401`. |
| CHK-API-02 | OK | `game` vient toujours de l'authentification ; aucun `game_id` lu dans la requête ; requêtes filtrées par `gameId` (`delivery.ts:522,556-561`, `player-tokens.ts:46`). |
| CHK-API-03 | OK | `api-key.ts:115,120` (jeu `suspended` ⇒ null). |
| CHK-API-04 | OK | Aucune lecture de clé dans la query (`rg` vide) ; aucun journal de l'en-tête `Authorization`. |
| CHK-API-05 | OK | `randomToken` 24 octets, empreinte SHA-256 + préfixe, clé affichée une seule fois (`integration/actions.ts:34-41`, `studio-logic.ts:185`). La clé publique est stockée en clair, ce qui est voulu. |
| CHK-API-06 | Partiel | Séparation effective (secrète / publique + jeton lié au compte acheteur) ; l'ack, la liste et le flux d'un autre joueur ou acheteur sont refusés (tests existants `v1-keys.test.ts`). Réserves : F1, F2 (la clé publique sert de levier de déni de service). |
| CHK-API-07 | KO (P2) | F9. |
| CHK-API-08 | OK | Messages d'erreur statiques ; aucun `e.message` renvoyé (`rg` vide). |
| CHK-API-09 | Partiel | `429` + `Retry-After` par IP et par clé, magasin partagé possible (Postgres, UPSERT conditionnel atomique, correct sous concurrence). Réserve : F3. |
| CHK-API-10 | OK | `Access-Control-Allow-Origin: *`, jamais d'origine reflétée ni de `Allow-Credentials` (`delivery-http.ts:15-21`). |

### 5. Liaison de compte

| ID | Statut | Justification |
|---|---|---|
| CHK-LNK-01 | OK | `generateLinkCode` (`randomInt`, CSPRNG) seule source ; TTL `LINK_CODE_TTL_MS` ; seul `Math.random` du dépôt : gigue de reconnexion du SDK. |
| CHK-LNK-02 | OK | Recherche `game_id` + code normalisé, refus si expiré ou consommé, message identique (« Code invalide ou expiré ») dans tous les cas (`linking.ts:240-254`). |
| CHK-LNK-03 | Partiel | Par utilisateur (5 / 15 min, sous verrou consultatif) ; ni par IP ni par jeu : F10. |
| CHK-LNK-04 | OK | `UPDATE … WHERE consumed_at IS NULL AND expires_at > now RETURNING` et `upsert` du lien dans la même transaction (`linking.ts:233-267`). |
| CHK-LNK-05 | KO | Validation, nettoyage du nom, un seul code actif par joueur et réessai sur collision : OK. Mais le quota par jeu est partagé et l'invalidation ne tient pas compte de la source : F1. |
| CHK-LNK-06 | OK | `id_confirm` refusé si absent de `linkMethods` (`linking.ts:533,566`) ; lien `verified = 0`. |
| CHK-LNK-07 | Partiel | Connexion requise, 10 / 10 min par utilisateur, réservation avant l'appel, journalisation (`link_attempts`) ; pas de limite par IP : F10. |
| CHK-LNK-08 | OK | `playerIdSchema` (≤ 64, sans caractère de contrôle, refus de `.` et `..`) puis `encodeURIComponent` ; modèle vérifié (`{player_id}` seulement dans le chemin ou la query, `checkLookupTemplate`). |
| CHK-LNK-09 | Partiel | Signature sur le `player_id` (pas un corps vide), donc non rejouable pour un autre joueur ; pas de séparation de domaine avec les webhooks : F5. |
| CHK-LNK-10 | OK | Schéma zod, longueurs bornées, ≤ 16 Kio, `avatar_url` en `https:` en production. Écart documenté : le `player_id` renvoyé fait foi (canonicalisation), il n'est pas comparé à la saisie. |
| CHK-LNK-11 | NV | Métadonnées `link_method` / `link_verified` transmises à Stripe (`payments.ts:283`) ; plafonds pour `verified = 0` non trouvés : à trancher par la revue « paiement ». |
| CHK-LNK-12 | OK | La livraison lit `orders.playerId` (`delivery.ts:81,91`) ; aucun accès à `game_links` dans `delivery*.ts` ni dans `api/v1`. |

### 6. Appels sortants (anti-SSRF)

| ID | Statut | Justification |
|---|---|---|
| CHK-SSRF-01 | OK | Seuls `safeHttpGet` et `safeHttpRequest` (`linking.ts:388,728`) appellent `playerLookupUrl` et `webhookUrl` ; aucun `fetch` direct dans `server/` hors S3. |
| CHK-SSRF-02 | OK | `http(s)` seulement, `https` obligatoire en production, URL avec identifiants refusées (`linking.ts:352-354`, `delivery.ts:183`). |
| CHK-SSRF-03 | Partiel | Plages IPv4 et IPv6 complètes, mappées, NAT64, 6to4, formes décimales, octales et hex normalisées par `URL` ; réserve : F6. |
| CHK-SSRF-04 | OK | `lookup` contrôlé passé à `http(s).request` (`linking.ts:371-382,405,747`) : la connexion utilise l'adresse vérifiée, toutes les adresses sont contrôlées (`all: true`). |
| CHK-SSRF-05 | OK | `http.request` ne suit pas les redirections ; 3xx = échec (`delivery.ts:258`). |
| CHK-SSRF-06 | OK | Lookup : 5 s et 16 Kio (erreur au-delà) ; webhook : 10 s et 1 Kio lu. Le délai couvre DNS, connexion et corps. |
| CHK-SSRF-07 | OK | Corps de réponse jamais stocké ; erreurs normalisées (`describeNetworkError`) ; lookup : messages génériques. |
| CHK-SSRF-08 | OK | Validation à l'enregistrement avec résolution DNS en production (`validateWebhookUrl`, `updateLinkSettings`) ; `localhost` seulement hors production. |

### 8. Livraison

| ID | Statut | Justification |
|---|---|---|
| CHK-DLV-01 | OK | `delivery.ts:68-70`. |
| CHK-DLV-02 | OK | `insert … onConflictDoNothing().returning()` puis relecture ; seul le créateur envoie (`delivery.ts:89-101`). |
| CHK-DLV-03 | OK | `JSON.stringify(payload)` une fois, signé et envoyé tel quel (`delivery.ts:338`, `250-253`). |
| CHK-DLV-04 | Partiel | Seul un 2xx ⇒ `delivered` ; relances via `nextAttemptAt(total ≥ 1)` puis `failed`. `canTransition` n'est pas utilisé (mises à jour conditionnelles sur le statut à la place) ; voir F4 pour l'ack. |
| CHK-DLV-05 | OK | Bail atomique (`delivery.ts:327-332`) et `FOR UPDATE SKIP LOCKED` + sous-requête scalaire dans le cron (`378-395`). |
| CHK-DLV-06 | Partiel | `delivery_id` identique sur tous les canaux, idempotence imposée par la doc et le SDK ; avec webhook, les livraisons `delivered` non acquittées restent listées pour le SDK : pas de choix du canal créditeur par jeu (acceptable si la doc d'idempotence est suivie). |
| CHK-DLV-07 | OK | `player_id` obligatoire (clé secrète) ou imposé par le jeton (clé publique, `403` si différent) ; filtre `game_id` + `player_id` + acheteur. |
| CHK-DLV-08 | Partiel | `WHERE id AND game_id` (+ joueur et acheteur pour un jeton), `404` identique, idempotent. Réserve : F4 (ack d'une livraison arrêtée). |
| CHK-DLV-09 | Partiel | Clé en en-tête, heartbeat 15 s, durée maximale 30 min, plafonds, `text/event-stream`, `no-cache`, nettoyage sur `abort` et `cancel`. Réserves : F2, F13 (plafonds par instance). |
| CHK-DLV-10 | OK | Seul le `PurchaseEvent` est envoyé ; `meta.userId` sert au filtrage côté serveur et n'est jamais sérialisé. |
| CHK-DLV-11 | OK | `cronGuard` : `503` sans secret hors développement, comparaison à temps constant, lots bornés (50, concurrence 4, budget 45 s). |
| CHK-DLV-12 | KO | F7 (stockage en clair, rotation sans recouvrement). Affichage réservé `owner/admin/developer`, jamais renvoyé par l'API ni lu pour le rendu : OK. |
| CHK-DLV-13 | KO (P2) | F8. |
| CHK-DLV-14 | OK | `verifyWebhookSignature` (temps constant, tolérance 300 s, plusieurs `v1`), README sur l'idempotence, `_markProcessed` avant `ackOnce` (`client.ts:461-468`). |
| CHK-DLV-15 | OK | `redactUrl` retire les identifiants, la query et le fragment (`delivery.ts:220-231`). |

## Menaces 6.2 et 6.4 du modèle

| Menace | État |
|---|---|
| T-LNK-01 | Partiel — `verified = 0` et métadonnées Stripe OK ; plafonds non vérifiés (paiement) ; F11. |
| T-LNK-02 | Partiel — limite par compte et journal ; F10. |
| T-LNK-03 | OK pour la force brute (cf. calcul F10) ; réponse identique. |
| T-LNK-04 | OK — code public ⇒ lien non vérifié, jeton limité aux achats du compte qui a saisi le code. |
| T-LNK-05 | OK — réserve F6. |
| T-LNK-06 | OK. |
| T-LNK-07 | Partiel — signature liée au `player_id`, HTTPS en production, réponse validée ; F5. |
| T-LNK-08 | OK. |
| T-LNK-09 | Partiel — codes précédents invalidés, désliaison ; mais F1 (invalidation ciblée) et F11. |
| T-LNK-10 | KO — F1. |
| T-LNK-11 | OK. |
| T-DLV-01 | OK — vérification SDK sur le corps brut ; pas de bouton « événement mal signé » dans l'onglet Intégration (amélioration). |
| T-DLV-02 | OK — HTTPS en production, idempotence documentée. |
| T-DLV-03 | OK (a, c, d) ; (b) cf. CHK-DLV-06. |
| T-DLV-04 | Partiel — séparation des clés OK ; F9, F12. |
| T-DLV-05 | OK. |
| T-DLV-06 | Partiel — F2, F13. |
| T-DLV-07 | OK — réserve F4. |
| T-DLV-08 | OK. |
| T-DLV-09 | KO — F7. |
| T-DLV-10 | KO (P2) — F8. |
| T-DLV-11 | OK. |
| T-DLV-12 | Partiel — timeout de 10 s et lots bornés ; pas de coupe-circuit par jeu (un studio lent occupe les 4 workers du cron pendant 10 s chacun). |
| T-DLV-13 | OK — `webhook_attempts`, `deliveredAt`, `acknowledgedAt`. |

## Annexe — extrait des tests d'exploitation (supprimés du dépôt)

Fichier jetable `apps/web/src/app/api/v1/zz-secu-exploit.test.ts`, même préambule que `v1-keys.test.ts`
(`vi.mock('@devappstore/db')` → `createTestDb()`), jeux `gam_x` / `gam_y` avec `linkMethods: ['code']` et une clé publique.
Résultat : `14 passed`.

```ts
// F1 — invalidation ciblée
const legit = await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: SECRET, body: { player_id: 'victim_42' } }));
const { code } = await legit.json();
await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: PUB, body: { player_id: 'victim_42' } }));
expect((await redeemLinkCode('usr_victim', game, code)).ok).toBe(false);

// F1 — épuisement du quota du jeu (X-Forwarded-For variable : limite par IP sans effet, cf. F3)
for (let i = 0; i < 130; i++)
  await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: PUB, body: { player_id: `junk_${i}` }, ip: `10.9.${i >> 8}.${i & 255}` }));
expect((await linkCodesRoute.POST(req('/api/v1/link-codes', { method: 'POST', key: SECRET, body: { player_id: 'honest' } }))).status).toBe(429);

// F2 — jeton de l'attaquant pour le player_id de la victime, 3 flux, puis flux de la clé secrète refusé
// (code public pour 'star_player' → redeemLinkCode('usr_evil', …) → GET /link-requests/{id} → player_token)
for (let i = 0; i < 3; i++) expect((await streamRoute.GET(req('/api/v1/deliveries/stream', { key: PUB_Y, token: player_token }))).status).toBe(200);
const victim = await streamRoute.GET(req('/api/v1/deliveries/stream?player_id=star_player', { key: SECRET_Y }));
expect(victim.status).toBe(429); // error.code === 'too_many_streams'

// F4 — livraison failed (WITHDRAWAL_STOP_REASON), commande refunded
expect(await acknowledgeDelivery('gam_x', id)).toBe('ok'); // statut → 'acknowledged'

// F6
for (const ip of ['::ffff:0:127.0.0.1', '64:ff9b:1::7f00:1', '2001:20::1']) expect(isBlockedAddress(ip)).toBe(false);
```
