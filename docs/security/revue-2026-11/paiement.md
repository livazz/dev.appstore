# Revue de sécurité 2026-11 — Paiement, remboursements, rétractation, fidélité

- **Date** : 10 novembre 2026 — base : `main` @ `9f336f1` (vagues 1 à 6 fusionnées).
- **Périmètre** : `docs/security/review-checklist.md` § 7 (CHK-PAY-01 à 13) et `docs/security/threat-model.md` § 6.3
  (T-PAY-01 à 11), plus la rétractation, les Points Dev AppStore et l'onboarding Connect.
- **Fichiers lus** : `apps/web/src/server/{payments,stripe,withdrawal,loyalty,loyalty-logic,payouts,delivery}.ts`,
  `apps/web/src/env.ts`, `apps/web/src/instrumentation.ts`, `app/api/checkout/route.ts`, `app/api/stripe/webhook/route.ts`,
  `app/api/checkout/expire/route.ts`, `app/api/cron/loyalty/route.ts`, `app/(player)/checkout/{mock,success}/*`,
  `app/(player)/account/{purchases,points}/actions.ts`, `app/studio/payouts/actions.ts`, `server/studio-logic.ts`
  (validation des prix), `server/import-logic.ts`, `packages/core/src/{constants,money}.ts`.
- **Méthode** : lecture du code ; les constats C-1 et C-2 ont été confirmés par un test vitest jetable (PGlite), supprimé
  ensuite (extrait en annexe). Aucune vraie clé Stripe utilisée, aucun code applicatif modifié.

## Synthèse

Le socle est solide : prix, devise, jeu et joueur sont lus en base, le corps du checkout est `.strict()`, le webhook
vérifie la signature sur le corps brut avec idempotence par `event.id`, montant/devise sont contrôlés, toutes les
transitions de statut sont conditionnelles, le mode simulation est verrouillé en production (démarrage refusé + garde
à l'exécution), l'onboarding Connect n'écrit `stripeAccountId` que depuis un compte créé côté serveur.

Les faiblesses trouvées concernent surtout **la fidélité couplée aux remboursements** :

| # | Gravité | Constat | Statut |
|---|---|---|---|
| C-1 | **Haute** | La rétractation ne reprend pas les Points Dev AppStore : achat → rétractation → points conservés, à l'infini | Confirmé (test) |
| C-2 | Moyenne | Reprise des points bornée par le solde : dépenser les points puis rembourser/contester garde la récompense | Confirmé (test + code) |
| C-3 | Moyenne | Remboursement impossible en charge directe si le studio perd `charges_enabled` (ou session/PI sur le mauvais compte) | Vérifié (code) |
| C-4 | Moyenne | Paiement encaissé mais montant/devise « incohérents » : 200 à Stripe, commande jamais payée ni remboursée automatiquement (risque Adaptive Pricing) | Code vérifié, déclencheur **plausible** |
| C-5 | Basse | Le palier de prix 0,49 € / 0,49 $ est enregistrable mais inachetable (minimum Stripe 50) | Vérifié (code) |
| C-6 | Basse | Bons de réduction : rachetables (points débités) mais non branchés au checkout | Vérifié (code) |
| C-7 | Basse | Course rétractation / envoi webhook en vol : objet crédité **et** remboursé (atténué par `purchase.refunded`) | Vérifié (code) |
| C-8 | Basse | Plafond de 5 commandes `pending` non atomique (compter puis insérer) | Vérifié (code) |
| C-9 | Basse | Charge directe : repli par `metadata.order_id` sans vérifier `event.account` | **Plausible** (comptes Express : peu exploitable) |
| C-10 | Basse | Objet bonus (fidélité) livré même si l'article est désactivé | Vérifié (code) |
| C-11 | Info | `NODE_ENV` inconnu + `SKIP_ENV_VALIDATION=1` → lecture tolérante en `development` → simulation possible | **Plausible** (configuration d'opérateur) |

Aucun constat critique : pas de prix modifiable côté client, pas de paiement simulé atteignable avec la configuration
de production validée, pas de double livraison ni de double crédit sur rejeu de webhook, pas de rétractation sur la
commande d'un autre, pas de versement vers le compte Connect d'un autre studio.

---

## Constats détaillés

### C-1 — Haute — La rétractation ne reprend pas les points de fidélité

- **Où** : `apps/web/src/server/withdrawal.ts:185-195` (passage `paid → refunded` direct, sans `revokePointsForOrder`) ;
  `apps/web/src/server/payments.ts:547-557` (le `charge.refunded` qui suit trouve la commande déjà `refunded` :
  `transitioned=false`, `afterOrderRefunded` — donc la reprise des points — n'est jamais appelé).
  Points attribués dès le paiement : `payments.ts:469-473` (`afterOrderPaid` → `awardPointsForOrder`).
- **Scénario** : un joueur choisit un jeu **sans webhook** (SDK : la livraison reste `pending` tant que le jeu n'est pas
  lancé, `delivery.ts:313-322`) ou dont le serveur est en panne. Il achète un article à 99,99 € → commission 5 € →
  500 points (`pointsForFee`, 10 c/point). Il clique « Me rétracter » sans lancer le jeu : remboursement intégral,
  points conservés. Il recommence (5 commandes `pending` max, mais aucune limite sur les commandes payées puis
  rétractées). Il échange ensuite les points contre des objets bonus (`redeemReward`, coût porté par les studios) ou
  des bons. Coût pour Dev AppStore : frais Stripe non remboursés à chaque cycle + récompenses gratuites. En simulation
  (pas de webhook du tout) le résultat est identique.
- **Confirmation** : test jetable (annexe A, cas 1) — solde `+25` après paiement, commande `refunded` après
  `withdrawOrder`, `markOrderRefunded` ultérieur sans effet, solde toujours `+25`.
- **Correctif** : dans `withdrawOrder`, après la mise à jour conditionnelle `paid → refunded`, appeler
  `revokePointsForOrder(orderId, { note: 'rétractation' })` (idempotent, ne doit pas bloquer la rétractation :
  `.catch` + journal). Mieux : factoriser une fonction unique « commande remboursée » (`markOrderRefunded` accepte un
  motif) utilisée par le webhook **et** la rétractation, pour qu'une suite (points, `enqueueRefund`, e-mails) ne puisse
  plus être oubliée d'un côté. Optionnel : n'attribuer les points qu'à la livraison confirmée (`delivered`/`acknowledged`)
  ou après la fin du délai de rétractation.
- **Test de non-régression** (`withdrawal.test.ts`) : « la rétractation reprend les points de la commande » — commande
  payée + `awardPointsForOrder`, `withdrawOrder` (simulation), puis `getBalance` revenu à la valeur initiale et une
  écriture `order_revoke` pour la commande ; rejouer `markOrderRefunded` ne crée pas de seconde reprise.

### C-2 — Moyenne — Reprise des points bornée par le solde (dépenser puis rembourser)

- **Où** : `apps/web/src/server/loyalty-logic.ts:206-210` (`pointsToRevoke = min(attribués − expirés, solde)`),
  appliqué par `loyalty.ts:146-168`.
- **Scénario** : achat → points attribués immédiatement → rachat immédiat d'un objet bonus (`redeemReward`) →
  remboursement (litige `charge.dispute.created`, remboursement manuel par un studio en charge directe, ou C-1 une fois
  corrigé si la livraison est encore `pending`). La reprise est limitée au solde restant (0) : l'objet bonus reste
  acquis. Choix documenté (« jamais de solde négatif ») mais il rend le cycle « acheter, dépenser, contester » rentable.
- **Confirmation** : test jetable (annexe A, cas 2) et lecture de `pointsToRevoke`.
- **Correctif** (au choix, décision produit) : (a) points « en attente » non dépensables tant que la livraison n'est
  pas confirmée **et** que le délai de rétractation (14 j) n'est pas écoulé ; (b) autoriser un solde négatif (dette
  imputée sur les gains futurs, rachats bloqués tant que < 0) ; (c) à défaut, révoquer la récompense rachetée avec ces
  points (bon `issued` → `cancelled`). Dans tous les cas, journaliser une alerte quand la reprise est partielle.
- **Test** (`loyalty.test.ts`) : « remboursement après rachat : la dette est conservée (ou les points n'étaient pas
  dépensables) » — attribuer 25 points, racheter 20, rembourser : solde ≤ 0 ou rachat refusé avant la confirmation.

### C-3 — Moyenne — Remboursement dirigé vers le mauvais compte Stripe en charge directe

- **Où** : `apps/web/src/server/withdrawal.ts:214-215` et `payments.ts:331-337` (`checkoutRequestOptions` n'ajoute
  `stripeAccount` que si `connectAccountOf(studio)` — c.-à-d. `stripeChargesEnabled` **actuel** est vrai) ; même
  logique dans `syncOrderWithStripe` (`payments.ts:781-786`).
- **Scénario** : `CHARGE_MODEL=direct`. Un joueur achète ; le paiement est créé sur le compte du studio. Plus tard,
  Stripe désactive les paiements du studio (`account.updated` → `stripeChargesEnabled=false`, vérification KYC, etc.).
  Le joueur se rétracte : la livraison est arrêtée (`withdrawal.ts:149-158`), puis le remboursement est demandé **sur
  le compte plateforme** (PI inconnu) → `refund_failed`. Le joueur ne peut plus être remboursé en ligne ni livré :
  manquement au délai légal de 14 jours (art. L221-24). Même défaut pour la resynchronisation de `/checkout/success`.
- **Correctif** : figer le compte encaisseur sur la commande au checkout (nouvelle colonne `orders.stripeAccountId`
  + `chargeModel`, remplie dans `createCheckout`) et l'utiliser pour `retrieve`/`refunds.create`, indépendamment de
  l'état actuel du studio. Migration : `npm run db:generate -w @devappstore/db`.
- **Test** (`withdrawal.test.ts`) : commande en charge directe, studio passé à `stripeChargesEnabled=false` →
  `refunds.create` appelé avec `{ stripeAccount: 'acct_studio' }`.

### C-4 — Moyenne — Paiement encaissé avec montant/devise « incohérents » : aucun dénouement automatique

- **Où** : `apps/web/src/server/payments.ts:660-670` (alerte, `handled:false`) puis `processStripeEvent`
  (`payments.ts:757-763`) marque l'événement traité et la route renvoie 200 : pas de rejeu, commande laissée `pending`
  puis passée à `failed` par le cron, aucun remboursement.
- **Scénario (plausible, non vérifiable sans compte de test)** : si **Adaptive Pricing** (conversion de devise
  automatique de Stripe Checkout, activable dans le tableau de bord) est actif, `session.currency`/`amount_total`
  peuvent être exprimés dans la devise du client → toute commande d'un client hors zone euro échoue au contrôle alors
  que la carte est débitée. Le contrôle protège bien contre la livraison sans paiement correct ; le risque est
  financier/juridique (client débité, rien livré, rien remboursé) et de réputation.
- **Correctif** : passer explicitement `adaptive_pricing: { enabled: false }` dans `buildCheckoutSessionParams` (ou,
  si on veut la garder, comparer `session.currency_conversion.source_currency` / `amount_total` côté source) ; et sur
  alerte de montant pour une session `payment_status='paid'`, déclencher un remboursement automatique (clé
  d'idempotence par session) ou au minimum une alerte opérateur persistante visible dans `/admin`.
- **Test** (`payments.test.ts`) : la session construite contient `adaptive_pricing.enabled === false` ; une session
  payée au mauvais montant déclenche `refunds.create` (Stripe simulé) et passe la commande à `refunded`.

### C-5 — Basse — Palier 0,49 inachetable

- **Où** : `packages/core/src/constants.ts:18-19` (`PRICE_TIERS_CENTS` commence à 49) vs
  `apps/web/src/server/payments.ts:68` (`MIN_CHARGE_CENTS` EUR/USD = 50) et `payments.ts:392-394`.
- **Scénario** : un studio crée un article à 0,49 € (accepté par `studio-logic.ts:85-87`, proposé par l'import
  App Store) ; tout achat échoue en 422 `amount_too_low`. Pas de faille, mais un article « publié » inachetable.
- **Correctif** : refuser à l'écriture les paliers < `MIN_CHARGE_CENTS[currency]` (validation dépendante de la devise
  du jeu), ou retirer 49 des paliers EUR/USD ; l'import (`priceForWeb`, `MIN_TIER`) doit suivre.
- **Test** (`studio-logic.test.ts`) : article à 49 dans un jeu EUR → erreur de validation ; jeu GBP → accepté.

### C-6 — Basse — Bons de réduction rachetables mais inutilisables

- **Où** : `apps/web/src/server/loyalty.ts:488-537` (« à brancher dans le checkout ») — `applyDiscountVoucher`
  n'est appelé nulle part hors tests ; `createCheckout` (`payments.ts:363-449`) ignore les bons ; `applyCheckoutSession`
  refuse toute remise (`payments.ts:661-663`).
- **Scénario** : si une récompense `discount` est active, le joueur dépense ses points pour un bon qu'il ne peut
  jamais utiliser (perte de valeur, réclamation consommateur). Pas d'impact de sécurité tant que ce n'est pas branché.
- **Correctif** : masquer/désactiver les récompenses `discount` (`listRewards`, `redeemReward`) tant que le checkout
  ne les gère pas. Au branchement : appliquer le bon **dans la même transaction** que la création de la commande,
  facturer `amountCents − discount`, `application_fee_amount = platformFeeCents − discount`, adapter le contrôle du
  webhook (montant attendu = montant remisé) et libérer le bon sur `failed`/expiration (`releaseDiscountVoucher`).
- **Test** : `redeemReward` d'une récompense `discount` → `reward_unavailable` tant que le drapeau n'est pas activé.

### C-7 — Basse — Rétractation pendant un envoi de webhook en vol

- **Où** : `apps/web/src/server/delivery.ts:323-366` (le POST au serveur du studio part après la prise de bail ; le
  passage à `delivered` est conditionnel à `pending`) et `withdrawal.ts:149-158` (arrêt `pending → failed`).
- **Scénario** : le jeu est crédité par la requête en vol pendant que la rétractation arrête la livraison ; la mise à
  jour `delivered` échoue (statut `failed`), le joueur est remboursé **et** crédité. Atténué : `enqueueRefund` émet
  `purchase.refunded` et la doc demande au jeu de révoquer.
- **Correctif** : refuser la rétractation si un bail d'envoi est en cours (`nextAttemptAt > now` et `attempts` en
  cours) — ou la différer jusqu'à la fin de la tentative — ; garder `purchase.refunded` comme filet.
- **Test** (`withdrawal.test.ts`) : livraison avec bail actif → `withdrawOrder` renvoie une erreur « réessayez ».

### C-8 — Basse — Plafond de commandes `pending` non atomique

- **Où** : `apps/web/src/server/payments.ts:403-428` (`countOpenPendingOrders` puis `insert`, hors transaction).
- **Scénario** : N requêtes `POST /api/checkout` simultanées dépassent la limite de 5 (création de sessions Stripe en
  masse, bruit dans les tableaux de bord). Impact faible (limiteur de débit API en amont).
- **Correctif** : verrou consultatif par utilisateur (`pg_advisory_xact_lock`) autour du compte + insertion.
- **Test** : 10 `createCheckout` concurrents → au plus 5 commandes `pending`.

### C-9 — Basse (plausible) — Charge directe : événement d'un autre compte connecté

- **Où** : `apps/web/src/server/payments.ts:646-658` (repli par `metadata.order_id`/`client_reference_id` quand la
  commande n'a pas encore de session) et `payments.ts:570-581` (`findOrderIdByPayment`) — `event.account` n'est jamais
  comparé au compte du studio de la commande.
- **Scénario** : en `CHARGE_MODEL=direct`, l'endpoint Connect reçoit les événements de **tous** les comptes connectés.
  Un studio capable de créer ses propres sessions Checkout pourrait viser une commande d'un autre studio encore sans
  `stripeCheckoutSessionId` (fenêtre courte entre `insert` et `update`, ou commande `failed` après échec de création de
  session, que `markOrderPaid` accepte). Peu exploitable avec des comptes **Express** (pas de clés API côté studio),
  d'où « plausible ».
- **Correctif** : dans `handleStripeEvent`, si `event.account` est défini, exiger qu'il soit égal au compte du studio
  de la commande (ou au compte figé sur la commande, cf. C-3) ; ne jamais utiliser le repli par métadonnée pour un
  événement venant d'un compte connecté.
- **Test** (`payments.test.ts`) : événement `checkout.session.completed` signé avec `account: 'acct_autre'` → non
  traité, alerte.

### C-10 — Basse — Objet bonus livré même si l'article est désactivé

- **Où** : `apps/web/src/server/loyalty.ts:372-378` (contrôle `games.status = 'live'` mais pas `items.active`).
- **Scénario** : un studio désactive un article (retiré du jeu) ; la récompense qui le cite reste rachetable et
  livre un `product_id` que le jeu ne connaît plus (livraison en échec, points perdus pour le joueur).
- **Correctif** : ajouter `eq(items.active, true)` au contrôle et filtrer `listRewards` de la même façon.
- **Test** (`loyalty.test.ts`) : récompense sur article inactif → `reward_unavailable`.

### C-11 — Info (plausible) — Lecture tolérante de `NODE_ENV`

- **Où** : `apps/web/src/env.ts:34-37` et `env.ts:271-289` (`readEnv` supprime une variable invalide et retombe sur
  le défaut `development`) ; contourne `instrumentation.ts` si `SKIP_ENV_VALIDATION=1`.
- **Scénario** : un opérateur déploie avec `NODE_ENV=staging` (invalide) **et** `SKIP_ENV_VALIDATION=1` sans clé Stripe
  → `isProduction=false` → `/checkout/mock` actif (boutique gratuite). Nécessite deux erreurs de configuration.
- **Correctif** : dans `readEnv`, une valeur de `NODE_ENV` invalide doit être traitée comme `production` (repli sûr),
  et `SKIP_ENV_VALIDATION` refusé hors `NEXT_PHASE=phase-production-build`.
- **Test** (`env.test.ts`) : `readEnv({ NODE_ENV: 'staging' }).isProduction === true`.

---

## Statut de la checklist (§ 7)

| ID | Statut | Justification |
|---|---|---|
| CHK-PAY-01 | **OK** | `route.ts:52` zod `.strict()` `{ itemId, withdrawalWaiver }` ; prix/devise/produit/jeu/joueur lus en base (`payments.ts:380-427`). Test existant `payments.test.ts:418`. |
| CHK-PAY-02 | **OK** | Article inactif / jeu non `live` (`payments.ts:381`), non lié (`:386-389`), vendeur non prêt en production ou en direct (`:397-400`). Tests `payments.test.ts:144,151,372,388`. Réserve : sessions déjà créées restent payables 23 h après dépublication/suspension (accepté). |
| CHK-PAY-03 | **OK** (réserve C-5) | Paliers validés à l'écriture (`studio-logic.ts:85-87`, import via `createItemFor`) ; `quantity: 1` côté Stripe (`payments.ts:302`), la quantité de l'article est un attribut de livraison. |
| CHK-PAY-04 | **OK** | `PLATFORM_FEE_BPS` borné 0–3000 au démarrage (`env.ts:76-83`) ; `computePlatformFee(amountCents)` serveur, stocké (`payments.ts:421`) et utilisé comme `application_fee_amount` (`:288-293`). |
| CHK-PAY-05 | **OK** | `appOrigin` : `APP_URL` prioritaire et obligatoire (https) en production (`stripe.ts:166-176`, `env.ts:155-156`) ; repli `Host` seulement hors production. |
| CHK-PAY-06 | **OK** | `req.text()` + `constructEvent` tolérance 300 s (`webhook/route.ts:30-33`, `stripe.ts:141-156`) ; 400 si signature absente/invalide ; 500 si aucun secret ; secret obligatoire au démarrage si clé définie (`env.ts:169-171`). |
| CHK-PAY-07 | **OK** | `UPDATE … WHERE status IN ('pending','failed') RETURNING` (`payments.ts:487-491`) ; `enqueueDelivery` idempotent (contrainte unique `deliveries.orderId`, `delivery.ts:89-99`) ; table `stripe_events`. Tests `payments.test.ts:223,242`. |
| CHK-PAY-08 | **OK** (réserve C-4) | Recherche par `stripeCheckoutSessionId`, repli métadonnée limité (`payments.ts:646-658`) ; `payment_status`, `amount_total`, sous-total, remise et devise contrôlés (`:660-671`) ; `async_payment_succeeded/failed` gérés. |
| CHK-PAY-09 | **OK** | `/checkout/success` : commande de l'utilisateur uniquement, resynchronisation par l'API Stripe authentifiée puis mêmes contrôles (`success/page.tsx`, `payments.ts:770-795`) ; aucun `session_id` lu depuis l'URL. |
| CHK-PAY-10 | **OK** (info C-11) | Démarrage refusé si `NODE_ENV=production` sans clé, avec clé test sans drapeau, ou sans secret webhook (`env.ts:160-171`, `instrumentation.ts`) ; garde d'exécution `paymentsConfigProblem` (`stripe.ts:60-66`) ; événements `livemode:false` ignorés en production (`payments.ts:681-683`). |
| CHK-PAY-11 | **OK** | `/checkout/mock` : `notFound()` hors simulation (`mock/page.tsx:24`) ; `payMockOrder` : `assertSimulationAllowed`, `userId`, `pending`, non expirée, transition conditionnelle (`payments.ts:608-624`). Tests `payments.test.ts:273-287,443-471`. |
| CHK-PAY-12 | **OK** | `stripeAccountId` écrit seulement par `ensureConnectAccount` (compte créé côté serveur, `WHERE stripeAccountId IS NULL`, `payouts.ts:134-155`) ; actions réservées à `owner` (`studio/payouts/actions.ts:10-19`) ; `stripeChargesEnabled` par `account.updated` (signé) ou relecture API (`payouts.ts:99-106`). Ré-authentification non vérifiée (domaine auth). |
| CHK-PAY-13 | **OK** | Réponses génériques (`route.ts:97-100`, `webhook/route.ts:39-41`) ; journaux limités au type, à l'id et au message d'erreur, jamais au corps de l'événement. |

### Points complémentaires du périmètre

| Sujet | Statut | Commentaire |
|---|---|---|
| Rétractation sur la commande d'un autre | **OK** | `withdrawOrder` filtre `orders.userId` sous `FOR UPDATE` (`withdrawal.ts:139-145`) ; server action liée à l'utilisateur connecté. |
| Double remboursement (rétractation rejouée, webhook ensuite) | **OK** | Clé d'idempotence `devappstore_withdrawal_<order>` ; `charge.refunded` ultérieur sans effet. |
| Rétractation : reprise des points | **KO** | C-1. |
| Case de renonciation, preuve stockée | **OK** | `withdrawalWaiver === true` exigé (`payments.ts:370-372`) ; horodatage, version CGV, IP tronquée /24–/48 stockés (`:424-426`). L'IP vient de `X-Forwarded-For` (déclaratif, documenté). |
| Points : double dépense en concurrence | **OK** | Verrou consultatif par utilisateur + débit dans la même transaction (`loyalty.ts:57-59,366-451`) ; stock décrémenté conditionnellement. |
| Points : double crédit sur rejeu de webhook | **OK** | Unicité `(order_id, reason)` + contrôle sous verrou (`loyalty.ts:108-131`). |
| Points négatifs | **OK** (mais voir C-2) | Solde jamais négatif par construction (`pointsToRevoke`), au prix de C-2. |
| Expiration des points et des bons | **OK** | `replayLedger` exclut les lots expirés ; cron protégé par `cronGuard`. |
| Plafond de coût des récompenses | **OK** | `isRewardWithinBudget` appliqué à la liste et au rachat (`loyalty-logic.ts:77-82`, `loyalty.ts:369`). |
| Arrondis en centimes | **OK** | Montants entiers partout ; `feeCents` = `Math.round` (`money.ts:9-11`) ; points = `floor` ; bon ≤ commission. |
| Versement vers le compte Connect d'un autre studio | **OK** | Destination = `studios.stripeAccountId` du studio du jeu de l'article, lu en base au checkout. |
| Remboursement en charge directe | **KO** | C-3. |
| Litiges / remboursements Stripe (T-PAY-10) | **OK** | `charge.refunded` total et `charge.dispute.created` → `refunded` + `purchase.refunded` ; partiel → alerte. |

---

## Annexe A — Test d'exploitation jetable (supprimé après exécution)

Fichier temporaire `apps/web/src/server/zz-exploit-paiement.test.ts`, même préparation que `withdrawal.test.ts`
(base PGlite de test, jeu sans webhook, joueur lié, récompense `bonus_item` à 20 points). Résultat : 2 tests verts
(les deux comportements sont reproduits).

```ts
it('rétractation : les points de la commande remboursée sont conservés', async () => {
  const before = await L.getBalance('usr_x');
  const id = await paidOrder(); // commande payée 49,99 €, commission 250 c, livraison pending, awardPointsForOrder
  expect(await L.getBalance('usr_x')).toBe(before + 25);
  await W.withdrawOrder('usr_x', id, { now: NOW, stripe: null, simulationAllowed: true, acknowledge: false });
  expect((await db.select().from(D.orders).where(D.eq(D.orders.id, id)))[0]!.status).toBe('refunded');
  expect((await P.markOrderRefunded(id)).transitioned).toBe(false); // charge.refunded qui suit : sans effet
  expect(await L.getBalance('usr_x')).toBe(before + 25);            // CONSTAT C-1 : points non repris
});

it('remboursement/litige après rachat : reprise bornée par le solde', async () => {
  const start = await L.getBalance('usr_x');
  const id = await paidOrder();                       // +25
  expect((await L.redeemReward('usr_x', 'lrw_x')).ok).toBe(true); // −20, objet bonus livré
  await P.markOrderRefunded(id);                      // reprise = min(25, solde)
  const [rev] = await db.select().from(D.loyaltyEntries)
    .where(D.and(D.eq(D.loyaltyEntries.orderId, id), D.eq(D.loyaltyEntries.reason, 'order_revoke')));
  expect(-rev!.delta).toBeLessThanOrEqual(start + 5); // CONSTAT C-2 : l'objet bonus reste acquis
});
```

## Annexe B — Hors périmètre, à transmettre

- Suspension d'un **utilisateur** : `createCheckout` ne la vérifie pas lui-même (dépend de `getCurrentUser`) — à
  confirmer par la revue « authentification ».
- `CHARGE_MODEL=direct` avec des comptes **Express** : Stripe recommande les charges directes avec des comptes
  Standard ; à trancher avec la décision TVA (aucune modification faite).
