# PROJET — Conditions studio (contrat de distribution Dev AppStore)

> **PROJET À FAIRE VALIDER PAR UN AVOCAT. NE PAS PUBLIER EN L'ÉTAT.**
> Version de travail du 9 novembre 2026, modèle **phase 1** (Studio vendeur, Dev AppStore place de marché,
> paiements Stripe Connect). Les passages `[…]` sont à compléter ; les « Notes » sont internes.
> Le contrat doit respecter le **règlement (UE) 2019/1150 « P2B »** (Dev AppStore est un service d'intermédiation
> en ligne pour des entreprises utilisatrices) : clauses claires, préavis de modification, motivation des
> suspensions, paramètres de classement, traitement des plaintes, médiation.

---

## Article 1 — Définitions

- **Dev AppStore** : [Dev AppStore SAS], exploitant la plateforme.
- **Studio** : la personne morale ou le professionnel qui publie un ou plusieurs Jeux et vend des Objets via
  la plateforme.
- **Jeu** : jeu vidéo édité par le Studio, distribué sur des plateformes tierces (App Store, Google Play,
  PC, consoles, web).
- **Objet** : contenu numérique (monnaie virtuelle, objet, pack, accès) vendu par le Studio aux Joueurs via
  la Boutique.
- **Boutique** : la page publique du Jeu sur Dev AppStore, configurée par le Studio dans l'espace studio.
- **Joueur** : utilisateur final de Dev AppStore.
- **Commande** : achat d'un Objet par un Joueur.
- **Livraison** : crédit de l'Objet sur le compte de jeu du Joueur, par webhook signé ou SDK.
- **Commission** : rémunération de Dev AppStore définie à l'article 6.
- **Prix** : prix TTC payé par le Joueur.

## Article 2 — Objet

2.1. Dev AppStore met à disposition du Studio : une Boutique publique, un catalogue et un moteur de recherche,
la liaison des comptes de jeu, l'encaissement des paiements via Stripe Connect, l'acheminement des
Commandes vers le Jeu (API, webhooks, SDK), des outils de suivi des ventes.

2.2. **Rôles** : le Studio est le **vendeur** des Objets aux Joueurs ; Dev AppStore agit en tant
qu'**intermédiaire**. Dev AppStore ne détient jamais les fonds des Joueurs : ils sont encaissés et reversés par
Stripe, établissement agréé, dans le cadre du compte Connect du Studio.

> **Note** : à revoir en fonction de la conclusion fiscale (`tax.md` §2.3). Si Dev AppStore est fournisseur
> réputé pour la TVA, insérer un article « Dev AppStore collecte et reverse la TVA sur les ventes aux
> consommateurs ; le Studio facture à Dev AppStore [le Prix HT diminué de la Commission] ». Le modèle phase 3
> (marchand de référence) nécessitera un contrat distinct (achat-revente ou commission à la vente).

## Article 3 — Inscription et vérification

3.1. Le Studio crée un compte studio, désigne ses membres et leurs rôles, et ouvre un **compte Stripe
Connect** ; il accepte le *Stripe Connected Account Agreement*.

3.2. Le Studio fournit des informations exactes et à jour (dénomination, immatriculation, adresse,
représentant, coordonnées, n° TVA) permettant d'informer les Joueurs sur l'identité du vendeur et, le cas
échéant, de satisfaire à l'obligation de **traçabilité des professionnels** (art. 30 DSA).

3.3. Aucune vente n'est possible tant que la vérification Stripe n'est pas finalisée.

## Article 4 — Catalogue, contenus et conformité

4.1. Le Studio fixe librement ses Prix et le contenu de sa Boutique (textes, visuels, bannières, mises en
page).

4.2. Le Studio garantit :

- détenir tous les droits sur le Jeu, les marques, visuels et contenus fournis, et concède à Dev AppStore une
  licence gratuite, non exclusive, mondiale, pour la durée du contrat, de les reproduire et représenter sur
  la plateforme et dans sa communication promotionnelle ;
- l'exactitude des descriptions des Objets et du **prix en euros des monnaies virtuelles** ;
- l'affichage des **probabilités** de tout Objet aléatoire et le respect des législations nationales
  (interdiction des loot boxes payantes dans certains pays : le Studio désactive la vente concernée) ;
- la conformité du Jeu et des Objets aux lois applicables (consommation, protection des mineurs,
  classification PEGI/ESRB, jeux d'argent) ;
- **la conformité de son Jeu aux règles des plateformes de distribution** (App Store Review Guidelines,
  Google Play policies, consoles), notamment : (i) maintenir chaque Objet **également disponible en achat
  intégré** sur iOS lorsque requis (règle Apple 3.1.3(b)) ; (ii) ne pas inclure dans le Jeu ou sa fiche de
  boutons, liens ou incitations vers Dev AppStore dans les régions où cela est interdit. Dev AppStore fournit une
  information indicative (documentation d'intégration) mais **le Studio est seul responsable** de sa
  relation avec ces plateformes ; Dev AppStore n'est pas responsable d'un rejet ou d'un retrait du Jeu.

4.3. Dev AppStore peut refuser ou retirer un contenu manifestement illicite, trompeur ou contraire aux présentes,
dans les conditions de l'article 12.

## Article 5 — Livraison des Objets

5.1. Le Studio intègre l'une des méthodes de livraison (webhook signé `DevAppStore-Signature` et/ou SDK) et
s'engage à :

- **vérifier la signature** de chaque notification et traiter `delivery_id` / `order_id` comme **clés
  d'idempotence** (jamais de double crédit, jamais de crédit sans Commande valide) ;
- **créditer l'Objet** sur le compte de jeu désigné dès réception, et au plus tard [24 heures] après le
  paiement ou à la prochaine connexion du Joueur ;
- répondre 2xx (webhook) ou appeler `ack` (SDK) uniquement après crédit effectif ;
- maintenir une disponibilité raisonnable de son point de terminaison et de son service de recherche de
  joueur (`playerLookupUrl`) ;
- conserver les Objets livrés sur le compte du Joueur conformément aux conditions du Jeu.

5.2. Dev AppStore achemine les Commandes, procède aux relances automatiques et met à disposition un journal des
livraisons. Dev AppStore n'est pas responsable d'un défaut de crédit imputable au Jeu.

5.3. **Défaut de livraison** : si une Commande n'est pas livrée dans [72 heures], Dev AppStore peut, après en
avoir informé le Studio, **rembourser le Joueur** pour le compte du Studio.

5.4. **Révocation** : en cas de remboursement ou de rétrofacturation, le Studio s'efforce de retirer
l'Objet du compte de jeu, sur notification de Dev AppStore [événement d'API à venir].

## Article 6 — Commission et frais

6.1. Dev AppStore perçoit une **Commission de [5] %** calculée sur le **Prix hors taxes** de chaque Commande payée.
[Option : taux réduit pour les [●] premiers mois / premiers [●] € de ventes.]

6.2. **Frais de paiement** : les frais Stripe (traitement des cartes, conversion de devise, Stripe Tax)
sont [inclus dans la Commission / supportés par le Studio et indiqués dans le tableau de bord]. [Note : à
arbitrer — avec 5 % de Commission, des frais de carte de ~1,5 % + 0,25 € réduisent fortement la marge sur
les petits paniers.]

6.3. La Commission est prélevée automatiquement sur chaque paiement (`application_fee_amount`). Dev AppStore
émet une **facture mensuelle** de Commission (TVA française 20 % pour un Studio établi en France ;
autoliquidation pour un Studio établi dans un autre État membre ; hors champ pour un Studio établi hors UE).

6.4. **Remboursements** : en cas de remboursement total, la Commission [est / n'est pas] restituée au
Studio. [Recommandation : restituer la Commission sur les remboursements légaux, la conserver sur les
remboursements commerciaux décidés par le Studio.]

6.5. Toute modification de la Commission est notifiée **au moins 15 jours à l'avance** (art. 3 P2B) ; le
Studio peut résilier sans frais avant son entrée en vigueur.

## Article 7 — Reversements

Les fonds nets (Prix − TVA éventuellement collectée par Dev AppStore − Commission − frais) sont versés par Stripe
sur le compte bancaire du Studio selon le calendrier de son compte Connect [J+7 glissants]. Dev AppStore peut
demander à Stripe de constituer une **réserve** proportionnée en cas de taux de litiges anormal.

## Article 8 — Fiscalité

8.1. [Phase 1, si le Studio reste redevable :] Le Studio est seul redevable des taxes sur ses ventes (TVA,
sales tax) et des déclarations correspondantes. Dev AppStore met à sa disposition Stripe Tax et des rapports par
juridiction.

8.2. Le Studio indique son statut fiscal et ses immatriculations ; il garantit Dev AppStore contre toute
réclamation fiscale liée à ses ventes, **sauf** si Dev AppStore est légalement redevable en tant que fournisseur
réputé.

## Article 9 — Remboursements, litiges et rétrofacturations

9.1. Dev AppStore gère le premier niveau du support Joueur et exécute les remboursements dus en application de
la loi ou des conditions joueurs, **pour le compte et aux frais du Studio**.

9.2. Les **rétrofacturations** (montant et frais de litige) sont supportées par le Studio. Dev AppStore répond aux
litiges en produisant les preuves disponibles (acceptation des conditions, renonciation au droit de
rétractation, journal de livraison) ; le Studio fournit à première demande les preuves d'utilisation de
l'Objet dans le Jeu.

9.3. Si le taux de litiges d'un Jeu dépasse [1] % sur un mois, Dev AppStore peut exiger un plan de remédiation,
une réserve, ou suspendre les ventes du Jeu (article 12).

## Article 10 — Fermeture d'un Jeu et continuité

10.1. Le Studio informe Dev AppStore et les Joueurs **au moins [90] jours** avant la fermeture d'un Jeu ou la
suppression d'Objets vendus via Dev AppStore ; les ventes cessent dès l'annonce.

10.2. Le Studio rembourse, à ses frais, les monnaies virtuelles non utilisées achetées via Dev AppStore dans les
[30] jours précédant l'annonce, et plus largement respecte ses obligations légales de conformité.

## Article 11 — Données personnelles

11.1. Dev AppStore et le Studio agissent chacun en **responsable de traitement indépendant** : Dev AppStore pour la
gestion des comptes, des paiements et de la plateforme ; le Studio pour la gestion du Jeu et du compte de
jeu.

11.2. Dev AppStore transmet au Studio les seules données nécessaires à la liaison et à la Livraison
(`player_id`, nom de joueur, identifiants de Commande et de livraison, Objet, quantité, date ; pas
d'adresse e-mail ni de données de paiement, sauf accord du Joueur). Le Studio ne réutilise pas ces données à
d'autres fins sans base légale propre.

11.3. Chaque partie assure la sécurité des données (clés API secrètes, vérification HMAC, chiffrement en
transit), notifie l'autre sans délai de toute violation affectant les données échangées et coopère pour
répondre aux demandes d'exercice de droits. [Annexe : accord de partage de données, art. 26 RGPD si des
traitements conjoints sont identifiés.]

## Article 12 — Suspension et résiliation (règlement P2B)

12.1. Dev AppStore peut **restreindre ou suspendre** une Boutique ou un Objet en cas de manquement, d'illicéité,
de fraude ou de taux de litiges excessif ; elle en communique les **motifs** au Studio au plus tard au moment
où la mesure prend effet, sur support durable (art. 4 P2B).

12.2. La **résiliation** de l'ensemble des services par Dev AppStore requiert un **préavis de 30 jours** motivé,
sauf obligation légale, manquement grave ou répété (art. 4 P2B).

12.3. Le Studio peut résilier à tout moment avec un préavis de [30] jours. Les obligations de Livraison, de
remboursement et de continuité (art. 5, 9, 10) survivent pour les Commandes passées.

12.4. Le Studio peut contester une mesure via le système interne de traitement des plaintes (art. 13).

## Article 13 — Plaintes, médiation, classement

13.1. **Plaintes** : [adresse / formulaire] ; réponse motivée sous [15] jours. [Note : obligation P2B
art. 11 — les petites entreprises en sont exemptées, mais la pratique est recommandée.]

13.2. **Médiation** : Dev AppStore désigne [deux médiateurs ou plus] (art. 12 P2B).

13.3. **Classement** : les principaux paramètres de classement du catalogue et de la recherche sont
[pertinence textuelle, ventes récentes, note, nouveauté, mise en avant éditoriale] ; tout placement
rémunéré est signalé (art. 5 P2B). [À aligner sur l'implémentation de la tâche *catalog*.]

## Article 14 — Responsabilité

14.1. Chaque partie répond des dommages directs causés par ses manquements. La responsabilité de Dev AppStore
est limitée, hors faute lourde ou dolosive, au montant des Commissions perçues au titre du Jeu concerné au
cours des [12] derniers mois.

14.2. Le Studio garantit Dev AppStore contre toute réclamation de tiers (Joueurs, ayants droit, autorités,
plateformes de distribution) résultant du Jeu, des Objets ou de ses contenus.

## Article 15 — Confidentialité, communication

Clés API, données de ventes non publiques et termes négociés sont confidentiels. Dev AppStore peut mentionner le
nom et le logo du Studio comme référence [sauf opposition].

## Article 16 — Modification des conditions

Toute modification est notifiée **au moins 15 jours** à l'avance sur support durable (art. 3 P2B) ; le Studio
peut résilier avant l'entrée en vigueur. Délai réduit uniquement en cas d'obligation légale ou de risque de
sécurité.

## Article 17 — Droit applicable et juridiction

Droit français. À défaut d'accord amiable ou de médiation, compétence exclusive des **tribunaux de [Paris]**,
sous réserve des règles impératives.

---

### Annexe A — Niveaux de service techniques (indicatifs)

| Indicateur | Engagement Studio |
|---|---|
| Délai de crédit après notification | < 1 min (cible), < 24 h (maximum) |
| Disponibilité du webhook / lookup | [99 %] mensuelle |
| Réponse du support niveau 2 | [2] jours ouvrés |
| Taux de litiges | < [1] % mensuel |

### Annexe B — Données échangées (rappel)

`player_id`, `player_name`, `order_id`, `delivery_id`, identifiant d'Objet, quantité, prix, devise,
horodatage, statut de livraison.
