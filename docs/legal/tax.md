# Fiscalité indirecte des ventes d'objets numériques aux joueurs

> **Note de recherche, pas un avis fiscal.** État au **9 novembre 2026**. À faire valider par un
> expert-comptable / avocat fiscaliste avant l'ouverture des ventes réelles ; envisager un **rescrit fiscal**
> (art. L80 B LPF) sur la qualification de Wolleen (§2.3).

## 1. Qualification des ventes

Un objet in-app (gemmes, skin, pack) livré automatiquement en ligne est, en TVA, une **prestation de services
fournie par voie électronique** (« e-service » : directive 2006/112/CE art. 58 ; règlement d'exécution
282/2011 art. 7 et annexe I). Il ne s'agit pas d'une livraison de biens, ni d'un service de
télécommunication.

Conséquences de principe pour une vente **B2C** :

- **Lieu d'imposition = pays du consommateur** (lieu d'établissement, domicile ou résidence habituelle),
  quelle que soit la localisation du vendeur.
- Le pays du client se détermine par des présomptions (règl. 282/2011 art. 24 bis–24 *quinquies*) : au moins
  **deux éléments de preuve non contradictoires** (adresse de facturation, pays de la carte / BIN, adresse IP,
  pays de la banque…). Stripe fournit pays de la carte et adresse de facturation ; Wolleen doit conserver
  l'IP de commande (voir `rgpd.md`).
- **Prix affichés TTC** au consommateur (art. L112-1 C. conso ; directive 98/6/CE).

## 2. Les deux modèles Wolleen

### 2.1 Phase 1 — « studio vendeur via Stripe Connect » (intention actuelle)

Schéma voulu : le studio vend l'objet au joueur ; Wolleen est un intermédiaire technique qui prélève une
commission (~5 %, `DEFAULT_PLATFORM_FEE_BPS = 500`) via `application_fee_amount`.

- **TVA sur la vente de l'objet** : due par le studio, au taux du pays du joueur.
  - Studio établi dans l'UE : seuil de 10 000 € de ventes B2C transfrontalières intra-UE (art. 59 *quater*)
    sous lequel il peut appliquer sa TVA nationale ; au-delà, TVA du pays du client via le **guichet unique
    OSS, régime de l'Union**.
  - Studio établi hors UE : **aucun seuil**, TVA du pays du client dès le premier euro, via **OSS régime non
    Union** (immatriculation dans un seul État membre).
- **TVA sur la commission Wolleen** : prestation B2B de Wolleen au studio (art. 44 de la directive ;
  art. 259 CGI) :
  - studio français : TVA française 20 % facturée par Wolleen ;
  - studio UE hors France : autoliquidation par le studio (mention « Autoliquidation ») ;
  - studio hors UE : hors champ de la TVA française.

### 2.2 Phase 3 — « Wolleen marchand de référence » (MoR)

Wolleen achète l'objet au studio et le revend au joueur en son nom (modèle Steam / Xsolla / app stores).

- Wolleen collecte et reverse la TVA de **toutes** les ventes B2C, au taux du pays du joueur, via son OSS
  (régime de l'Union si Wolleen est établie en France), et l'équivalent hors UE (UK, Suisse, Norvège, Canada,
  Australie, Japon, Inde, États américains…).
- Le studio facture à Wolleen une prestation B2B (autoliquidation / hors champ selon son pays).
- Wolleen porte : immatriculations, déclarations, conservation des preuves de localisation, remboursements,
  risque de contrôle — mais simplifie radicalement la vie des studios (argument commercial fort).

### 2.3 Attention : le « studio vendeur » risque d'être requalifié dès la phase 1 (UE)

L'**article 9 bis du règlement d'exécution 282/2011** (et art. 28 de la directive) crée une **présomption** :
lorsqu'un service électronique est fourni via une interface (place de marché, portail), **l'opérateur de
l'interface est présumé agir en son nom propre** — donc être le fournisseur au regard de la TVA (« deemed
supplier »). La CJUE a confirmé la validité de cette règle (**CJUE, 28 février 2023, *Fenix International*,
C-695/20**, plateforme OnlyFans).

La présomption n'est réfragable que si **le studio est explicitement désigné comme fournisseur** et que les
accords contractuels le reflètent (CGV, reçu/facture au nom du studio). Mais **elle devient irréfragable** si
l'opérateur, pour la vente concernée :

- **autorise le débit** du client, **ou**
- **autorise la livraison**, **ou**
- **fixe les conditions générales** de la vente.

Or, dans l'architecture actuelle, Wolleen crée la session Stripe Checkout, déclenche la livraison
(`enqueueDelivery`) et propose des CGV de place de marché. **Il existe donc un risque sérieux que Wolleen soit
considérée comme fournisseur réputé dès la phase 1**, et redevable de la TVA sur 100 % des ventes B2C dans
l'UE (et, par des règles analogues, au Royaume-Uni).

**Options** :

1. **Assumer dès la phase 1 le statut de fournisseur réputé** pour la TVA (Wolleen collecte la TVA via
   Stripe Tax, `liability: self`), tout en laissant le studio vendeur au regard du droit de la consommation
   (désignation du vendeur dans la fiche et le reçu). C'est la voie la plus sûre fiscalement, et elle
   prépare la phase 3.
2. **Rendre le studio réellement maître de la vente** : paiements en *direct charges* sur le compte Connect
   du studio, CGV du studio, prix fixés par le studio, Wolleen limité à un rôle de prestataire technique ou
   de traitement des paiements (les simples prestataires de paiement sont exclus de l'art. 9 bis). Plus
   difficile à défendre si Wolleen garde la main sur le checkout et la livraison.
3. **Rescrit** auprès de la DGFiP pour sécuriser le choix.

> Lien avec le code : le choix entre *destination charges* (paiement sur le compte plateforme) et *direct
> charges* (paiement sur le compte du studio) a aussi des effets juridiques (qui apparaît sur le relevé
> bancaire, qui supporte les litiges et remboursements). Les destination charges sans `on_behalf_of` font
> apparaître **Wolleen** comme marchand côté carte, ce qui contredit le discours « studio vendeur ». À
> arbitrer avec la tâche *payments*.

### 2.4 Tableau comparatif

| | Phase 1 « studio vendeur » (si la présomption est renversée) | Phase 1 avec fournisseur réputé / Phase 3 MoR |
|---|---|---|
| Redevable de la TVA B2C UE | Studio (OSS) | **Wolleen** (OSS) |
| Redevable TVA UK | Studio (immatriculation UK, pas de seuil pour non-résident) | **Wolleen** (règle UK analogue sur les plateformes) |
| Sales tax US | Studio (nexus économique par État) ; Wolleen si « marketplace facilitator » et État visant les biens numériques | **Wolleen** |
| Facturation au joueur | Au nom du studio | Au nom de Wolleen |
| Flux B2B | Wolleen → studio : commission | Studio → Wolleen : vente en gros / prestation |
| Charge de conformité | Répartie sur chaque studio (lourd pour un petit studio) | Centralisée chez Wolleen |
| Stripe Tax | `automatic_tax.liability = { type: 'account', account }` | `automatic_tax.liability = { type: 'self' }` |

## 3. Royaume-Uni

- Services numériques B2C : TVA britannique 20 % au lieu du client, **sans seuil pour les vendeurs non
  établis au Royaume-Uni** ; immatriculation auprès du HMRC (pas de guichet OSS UK).
- Règle analogue à l'art. 9 bis : l'opérateur d'une plateforme par laquelle des services numériques sont
  fournis peut être traité comme fournisseur (orientation HMRC « VAT: supplying digital services to private
  consumers ») — même analyse que §2.3, *à confirmer par un conseil UK*.

## 4. États-Unis — sales tax

- Pas de TVA fédérale ; **sales tax par État** (et localités). Environ la moitié des États taxent tout ou
  partie des « digital products » ; la définition (et l'inclusion des objets in-app, jeux, monnaies
  virtuelles) varie fortement. Les États membres du *Streamlined Sales Tax* utilisent la notion de
  « specified digital products ».
- **Nexus économique** (*South Dakota v. Wayfair*, 2018) : un vendeur distant doit collecter dès qu'il dépasse
  le seuil de l'État (souvent 100 000 $ de ventes annuelles ; le critère « 200 transactions » est abandonné
  par un nombre croissant d'États).
- **Marketplace facilitator** : les 45 États à sales tax + DC ont des lois imposant à la place de marché de
  collecter pour les vendeurs tiers ; **mais beaucoup ne visent que les biens corporels**, et la couverture
  des produits numériques est hétérogène et en évolution. Il faut une analyse État par État si Wolleen
  facilite des ventes aux États-Unis.
- **Reporting** : formulaires 1099-K émis par Stripe pour les comptes Connect américains éligibles (Stripe
  « platform tax reporting »).
- Recommandation : en phase 1, **limiter ou différer l'ouverture aux acheteurs US**, ou utiliser Stripe Tax
  en *threshold monitoring* et n'activer la collecte que là où un seuil est franchi.

## 5. Autres juridictions à garder en tête

Suisse/Norvège (TVA sur services électroniques avec seuils), Canada (TPS/TVH + TVQ, sans seuil élevé pour les
plateformes), Australie (GST, règle de plateforme), Japon (taxe à la consommation, règle de plateforme depuis
avril 2025), Inde, Corée… En phase 1, **restreindre les pays de vente** aux zones couvertes (UE, éventuellement
UK) est une mesure de maîtrise du risque simple et efficace.

## 6. Déclarations des plateformes (DAC7, art. 242 *bis* CGI)

DAC7 (directive 2021/514) et l'art. 242 *bis* CGI imposent aux opérateurs de plateforme de déclarer les
revenus de vendeurs pour des **activités limitativement énumérées** : location immobilière, services
personnels, **vente de biens**, location de moyens de transport. La vente de **contenus numériques** n'est
a priori **pas une « vente de biens »** au sens de DAC7 — Wolleen ne serait pas concernée pour ces flux,
*à confirmer*. L'obligation d'information des utilisateurs sur leurs obligations fiscales (art. 242 *bis*,
I) reste à vérifier pour Wolleen en tant qu'opérateur de plateforme mettant en relation.

## 7. Rôle de Stripe Tax

Ce que Stripe Tax fait :

- **calcul** automatique de la taxe au moment du Checkout (`automatic_tax: { enabled: true }`), selon le
  pays du client, le code produit (`txcd_…` pour biens/services numériques : à choisir avec soin, par ex.
  « video games – downloaded – non subscription » ou équivalent « digital goods ») et les immatriculations
  déclarées ;
- **surveillance des seuils** (OSS 10 000 €, nexus US) et alertes ;
- **rapports** exportables par juridiction pour les déclarations (OSS, VAT UK, sales tax) ;
- avec Connect : choix du redevable via `automatic_tax.liability` (`self` = plateforme, `account` = compte
  connecté) ; composants embarqués *Tax settings* / *Tax registrations* pour que les studios configurent leur
  propre fiscalité dans l'espace studio Wolleen (adresse du siège, code fiscal par défaut,
  immatriculations).

Ce que Stripe Tax **ne fait pas** (ou pas seul) :

- il **ne décide pas qui est redevable** : la qualification (studio vendeur vs fournisseur réputé) relève de
  Wolleen et de son conseil ; Stripe décline toute responsabilité ;
- il **n'immatricule pas** automatiquement et **ne dépose pas** les déclarations partout (offre de dépôt via
  partenaires, couverture variable, *à vérifier*) ;
- il ne gère pas la **facturation** conforme au droit local (mentions obligatoires de la facture/reçu) sans
  paramétrage.

Coût : facturation à l'usage (de l'ordre de 0,5 % par transaction où une taxe est calculée, *à vérifier sur
la page tarifs Stripe*), à intégrer dans le calcul de la marge sur une commission de 5 %.

## 8. Points d'impact produit

- **Prix** : la base actuelle stocke un `priceCents` unique. Pour des prix TTC par pays, deux politiques :
  (a) **prix TTC identique partout** (la marge nette varie selon le taux : 17 % au Luxembourg, 27 % en
  Hongrie) ; (b) **prix HT fixe + TVA** (prix affiché différent par pays). Recommandation : (a) avec des
  paliers de prix par devise, comme les stores.
- **Commission** : préciser contractuellement si les 5 % s'appliquent au **prix HT** (recommandé) ou TTC.
- **Remboursements / avoirs** : la TVA collectée doit être régularisée (Stripe Tax gère les remboursements
  via `tax.transactions` / avoirs).
- **Preuves de localisation** : conserver deux éléments non contradictoires par commande pendant **10 ans**
  (art. 63 *quater* règl. 282/2011 pour OSS).

## Sources (consultées le 9 novembre 2026)

- Directive 2006/112/CE (art. 28, 44, 58, 59 *quater*, 369 *bis* et s.) — https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32006L0112
- Règlement d'exécution (UE) 282/2011 (art. 7, 9 bis, 24 bis et s., 63 *quater*) — https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32011R0282
- CJUE, 28 février 2023, *Fenix International Ltd*, C-695/20 — https://curia.europa.eu/juris/liste.jsf?num=C-695/20
- Commission européenne, guide OSS — https://vat-one-stop-shop.ec.europa.eu/
- HMRC, « VAT: supplying digital services to private consumers » — https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers
- *South Dakota v. Wayfair, Inc.*, 585 U.S. 162 (2018)
- Guides 2026 sur les lois « marketplace facilitator » (couverture des biens numériques hétérogène) : https://trykintsugi.com/blog/marketplace-facilitator-laws-by-state.md ; https://www.numeral.com/blog/marketplace-facilitator
- Stripe, *Tax for platforms* — https://docs.stripe.com/tax/tax-for-platforms ; *Tax for marketplaces* — https://docs.stripe.com/tax/tax-for-marketplaces ; composant *Tax settings* — https://docs.stripe.com/connect/supported-embedded-components/tax-settings ; *Platform tax reporting* — https://docs.stripe.com/connect/platform-tax-reporting
- Directive (UE) 2021/514 (DAC7) et art. 242 *bis* CGI — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043662596
