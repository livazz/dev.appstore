# Points Dev AppStore — programme de fidélité multi-jeux (phase 3)

> Spécification produit, 9 novembre 2026. Les garde-fous juridiques ci-dessous s'appuient sur les notes de
> recherche de `docs/legal/` (en particulier `consumer.md` §4 et §5) : **ce n'est pas un avis juridique**, le
> programme doit être validé par un avocat (monnaie électronique, TVA, droit de la consommation) **avant son
> ouverture en production**. Par défaut, le programme est **désactivé en production** (`LOYALTY_ENABLED`).

## 1. Principe

Chaque achat payé sur Dev AppStore rapporte des **Points Dev AppStore** au compte du joueur, quel que soit le jeu.
Les points débloquent des **avantages** :

1. **Bons de réduction Dev AppStore** : une réduction plafonnée sur un prochain achat, **financée par Dev AppStore sur sa
   propre commission**. Le studio reçoit exactement la même somme qu'en l'absence de réduction.
2. **Objets bonus** : un objet offert par un **studio participant**, livré dans le jeu comme un achat (commande à
   0 €). Le studio choisit librement de l'offrir, sans aucune contrepartie financière de Dev AppStore ni d'un autre
   studio.

Les points **ne sont pas une monnaie** : ce sont des droits à avantages, attribués gratuitement, qui expirent.

## 2. Règles du programme (affichées au joueur sur `/account/points`)

| Règle | Valeur par défaut | Configuration |
|---|---|---|
| Barème d'attribution | **1 point par tranche de 10 centimes de commission Dev AppStore** encaissée sur la commande (arrondi à l'inférieur). À 5 % de commission : environ 1 point pour 2 € d'achat. | `LOYALTY_FEE_CENTS_PER_POINT` (défaut 10) |
| Moment de l'attribution | au passage de la commande à `paid`, une seule fois par commande | — |
| Durée de validité | **12 mois** à compter de l'attribution, lot par lot | `LOYALTY_POINTS_TTL_DAYS` (défaut 365) |
| Ordre d'utilisation | les points qui **expirent le plus tôt** sont utilisés en premier | — |
| Remboursement de la commande | les points de la commande sont **retirés** ; s'ils ont déjà été utilisés, on retire ce qui reste disponible sur le compte, **jamais en dessous de zéro** | — |
| Bons de réduction | valables **90 jours**, un bon par commande, utilisable seulement si la commission Dev AppStore de la commande couvre la réduction (montant minimum de commande affiché sur le bon), même devise | `voucherTtlDays` de la récompense |
| Objets bonus | nécessitent un compte de jeu **lié** ; stock et limite par joueur fixés avec le studio | `stock`, `perUserLimit` |
| Coût maximal pour Dev AppStore | une récompense financée par Dev AppStore ne peut pas valoir plus de **20 % de la commission** qui a généré les points nécessaires | `LOYALTY_MAX_COST_BPS` (défaut 2000) |
| Activation | activé en développement, **désactivé en production** tant que `LOYALTY_ENABLED=1` n'est pas posé | `LOYALTY_ENABLED` |

Ce que les points ne permettent **pas** : être achetés, être échangés contre de l'argent ou un avoir, être
transférés à un autre compte, être fusionnés entre comptes, être offerts, payer une partie du prix au-delà de la
réduction plafonnée. À la fermeture du compte, les points sont perdus (information préalable dans les CGV).

## 3. Garde-fous juridiques

### 3.1 Monnaie électronique et services de paiement (CMF L315-1, DSP2 art. 3 k)

La note `consumer.md` §4 signale le risque : une « monnaie Dev AppStore » utilisable dans les jeux de **plusieurs
studios** sortirait du *réseau limité* et pourrait relever de la monnaie électronique. La monnaie électronique
suppose une valeur monétaire **émise contre la remise de fonds** et **acceptée comme moyen de paiement** par des
tiers. Le programme est conçu pour ne remplir **aucune** de ces conditions :

| Critère | Choix de conception | Où c'est appliqué |
|---|---|---|
| Émission contre remise de fonds | les points **ne s'achètent jamais** ; ils sont attribués gratuitement après l'achat d'un objet, en fonction de la **commission de Dev AppStore** (pas du montant payé par le joueur) | aucun produit « points » ; `awardPointsForOrder` |
| Valeur monétaire, remboursabilité | **aucune** conversion en argent, pas de taux affiché « 1 point = x € », pas de remboursement des points | pas d'API de conversion |
| Acceptation par des tiers comme moyen de paiement | les points ne **paient** jamais un studio : une réduction est prise **sur la commission de Dev AppStore** (le studio reçoit 100 % de sa part) ; un objet bonus est un **cadeau du studio**, sans aucun règlement entre Dev AppStore et les studios | `applyDiscountVoucher` (réduction ≤ commission de la commande) ; récompense `bonus_item` sans compensation |
| Transférabilité | points rattachés à un seul compte, aucun transfert ni cadeau | pas d'API de transfert ; suppression en cascade avec le compte |
| Durée | lots valables 12 mois | `expires_at` du registre |

Analyse : il s'agit d'un **programme de fidélité de l'opérateur de la plateforme**, qui accorde des remises sur
son propre service. L'émetteur et le financeur des avantages Dev AppStore est toujours Dev AppStore ; les studios
n'acceptent pas les points en paiement. **À faire confirmer par un avocat**, et à réexaminer si l'on voulait un
jour vendre des points, permettre de payer un studio en points, compenser les studios pour des objets bonus, ou
passer en marchand de référence (phase 3 MoR).

### 3.2 Droit de la consommation

- **Information claire** (art. L111-1, lignes directrices CPC du 21 mars 2025) : règles, barème, durée de
  validité et date d'expiration des lots affichées sur `/account/points` ; les récompenses de réduction sont
  exprimées **en euros** (« 1 € de réduction »), jamais via un taux de conversion.
- **Pas de pratiques agressives**, en particulier envers les mineurs (annexe I point 28 de la directive
  2005/29, art. L121-7) : pas de compte à rebours, pas de « dernière chance », pas de multiplicateurs temporaires
  incitatifs, pas de relance « achète pour ne pas perdre tes points ». Une seule information neutre
  « x points expirent le JJ/MM » dans les 30 jours qui précèdent.
- **Pas d'aléa** : aucune récompense aléatoire (loteries prohibées, C. sécu. int. L322-1 et s. ; loot boxes
  visées par le futur *Digital Fairness Act*).
- **Annonces de réduction** (art. L112-1-1) : le bon de fidélité est une réduction **personnelle**, pas une
  annonce de prix barré ; il ne doit pas être présenté comme une baisse du prix de l'article.
- **Modification ou fin du programme** : préavis d'au moins 30 jours dans les CGV ; les points acquis restent
  utilisables jusqu'à leur expiration, ou au moins 3 mois.
- **Remboursement et rétractation** : un remboursement retire les points de la commande ; une commande payée avec
  un bon reste remboursable au montant **effectivement payé**.

### 3.3 Autres points à valider

- **TVA** : une réduction financée par un tiers (Dev AppStore) alors que le studio est le vendeur (phase 1) peut
  modifier la base d'imposition (CJUE *Elida Gibbs* C-317/94). Le plus simple : la réduction diminue le prix payé
  **et** la commission de Dev AppStore du même montant, et le studio encaisse le même net. À valider avec `tax.md`.
- **RGPD** : le registre est une donnée de compte (base légale : exécution du contrat) ; durée = durée du compte
  + prescription, à ajouter au registre de `rgpd.md`. Pas de profilage publicitaire à partir des points.
- **Stores** (`stores.md`) : ne jamais mentionner les points dans l'interface d'un jeu iOS/Android hors des
  régions où les liens vers des achats web sont permis.

## 4. Économie

Notations : `c` = commission Dev AppStore d'une commande (centimes), `k` = centimes de commission par point
(`LOYALTY_FEE_CENTS_PER_POINT`, 10), `X` = coût maximal en part de la commission (`LOYALTY_MAX_COST_BPS`, 20 %).

- Points attribués : `⌊c / k⌋`. Chaque point représente donc au moins `k` centimes de commission encaissée.
- Une récompense financée par Dev AppStore de valeur `V` doit coûter au moins `P ≥ V / (X · k)` points.
  Avec les défauts : `P ≥ V / 2`, soit **1 € de réduction = 50 points** = 5 € de commission = 100 € d'achats à 5 %.
- **Coût maximal garanti : X = 20 % de la commission** qui a généré les points, avant même la *breakage* (points
  expirés ou jamais utilisés). Le contrôle est fait à la création de la récompense **et** au moment du rachat :
  si la configuration change, une récompense devenue trop généreuse n'est plus rachetable.
- **Plafond par commande** : la réduction ne peut pas dépasser la commission de la commande sur laquelle elle
  s'applique. Dev AppStore n'est **jamais en perte** sur une commande et le studio touche toujours sa part entière.
  Exemple à 5 % : un bon de 1 € s'utilise sur une commande d'au moins 20 €.
- **Remboursements** : les points sont repris ; le coût d'un avantage déjà consommé avant le remboursement est
  borné par la reprise sur le solde restant (le reliquat est une perte assumée, elle-même plafonnée par X).
- **Objets bonus** : coût nul pour Dev AppStore (cadeau du studio, qui y gagne de l'acquisition et de la rétention).
  Le coût en points est fixé avec le studio ; pas de contrainte X.

Tableau indicatif (commission 5 %, réglages par défaut) :

| Dépense cumulée | Commission Dev AppStore | Points | Exemple d'avantage |
|---|---|---|---|
| 20 € | 1,00 € | 10 | objet bonus d'un studio (10 à 50 points) |
| 100 € | 5,00 € | 50 | bon de 1 € (coût Dev AppStore : 20 % de 5 €) |
| 200 € | 10,00 € | 100 | bon de 2 € |

## 5. Modèle de données (`packages/db/src/schema/loyalty.ts`)

- `loyalty_entries` : **registre immuable** (uniquement des INSERT). `delta` signé, `reason` (`order_award`,
  `order_revoke`, `redemption`, `expiry`, `adjustment`), `order_id?`, `redemption_id?`, `ref_entry_id?` (lot
  concerné par une expiration), `expires_at` (lots positifs), `created_at`, `seq` (ordre total). Contraintes :
  `UNIQUE(order_id, reason)` (une attribution et une reprise par commande), `UNIQUE(ref_entry_id, reason)` (une
  expiration par lot), `CHECK` sur le signe de `delta` selon la raison.
- `loyalty_rewards` : catalogue. `discount` (valeur en centimes, devise) ou `bonus_item` (jeu, article), coût en
  points, stock, limite par joueur, période de disponibilité.
- `loyalty_redemptions` : rachats. Bons `issued` → `used` (commande) ; objets bonus `delivered` (commande à 0 €
  livrée par le système de livraison existant).

Le solde se calcule en rejouant le registre par lots, les lots qui expirent le plus tôt étant consommés en
premier : `getBalance` exclut toujours les lots expirés, même si le job d'expiration n'est pas encore passé ;
`expirePoints()` matérialise les expirations dans le registre pour l'historique.

## 6. Concurrence et idempotence

- Toutes les écritures qui dépendent du solde (rachat, reprise, attribution, expiration) prennent un **verrou
  consultatif transactionnel par utilisateur** (`pg_advisory_xact_lock`) : deux rachats simultanés ne peuvent pas
  dépenser deux fois les mêmes points.
- `awardPointsForOrder` est idempotent (contrainte d'unicité et vérification sous verrou) et refuse une commande
  non payée ou déjà reprise. `revokePointsForOrder` est idempotent et inscrit une reprise (éventuellement de 0
  point) qui bloque toute attribution ultérieure.
- Le stock d'une récompense est décrémenté par un `UPDATE … WHERE redeemed_count < stock` dans la même transaction.

## 7. Suites

Notification neutre 30 jours avant expiration, administration des récompenses et espace studio « objets bonus »,
application des bons dans le checkout (branchement décrit dans le rapport de la tâche), statistiques de
*breakage* et de coût réel par mois.
