# Positionnement de Wolleen

> À lire avec [competitors.md](competitors.md), qui donne les chiffres et les sources. Document de travail du 9 novembre 2026.

## 1. Le constat en une phrase

La boutique web à 5 % est devenue une **commodité** : Xsolla, Stash, Tebex et Appcharge sont à environ 5 % et marchands de
référence, Unity propose 0 % depuis juillet 2026, et Epic 0 % jusqu'à 1 M$. Wolleen ne gagnera donc **pas sur le prix
seul**. Wolleen gagne s'il est **la seule place de marché officielle et multi-jeux côté joueur**, avec des boutiques qui
ressemblent vraiment au jeu, accessibles en libre-service à un studio de 5 personnes.

## 2. Où Wolleen se différencie

| Axe | Wolleen | Meilleur concurrent sur l'axe | Écart réel |
|---|---|---|---|
| **Place de marché multi-jeux côté joueur** (chercher son jeu, lier, acheter) | Cœur du produit | Codashop (générique, Asie), LootBar (non officiel), Supercell Store (un seul éditeur) | **Fort.** Aucun acteur occidental officiel et multi-studios. C'est aussi un **avantage juridique probable** : un achat initié sur Wolleen sans lien depuis l'appli échappe a priori aux frais Google et Apple sur les liens externes (à faire valider par un juriste). |
| **Éditeur visuel qui reproduit le look du jeu** | Bannière, dégradé, icône, 6 mises en page, curseurs. Phase 3 : génération IA des cartes depuis une capture | Aghanim Kinetic (sur mesure, via leurs équipes), Xsolla Site Builder (gabarits) | **Moyen à fort** si l'éditeur est vraiment en libre-service et que le résultat est bluffant en moins de 30 minutes. La génération depuis une capture serait un effet « waouh » unique. |
| **Fidélité multi-jeux** | Phase 3 | Supercell ID Rewards (mono-éditeur), Stash et Neon Loyalty (par jeu) | **Fort et défendable** : c'est un effet de réseau que les acteurs mono-studio ne peuvent pas copier. Il faut l'**avancer** dans la feuille de route (voir §6). |
| **Simplicité** | Liaison par code ou ID, webhook signé ou SDK, mode simulation, inscription en libre-service | Unity IAP 5.4 (sans code pour les studios Unity), Tebex (libre-service) | **Moyen.** Unity est redoutable pour ses propres utilisateurs. Wolleen doit viser « première vente en moins d'un jour », tous moteurs confondus. |
| **Prix** | 5 % par défaut (`DEFAULT_PLATFORM_FEE_BPS = 500`) | Unity 0 %, PayNow 2,5 à 3,5 %, Xsolla et Stash 5 % + canal | **Faible**, et même négatif tant que Wolleen n'est pas MoR (TVA à la charge du studio). |

### Faiblesses à assumer ou corriger

1. **Wolleen n'est pas marchand de référence.** Avec Stripe Connect, le studio porte la TVA, les litiges et la conformité.
   Pour un petit studio européen qui vend dans 27 pays, c'est un frein majeur. Il faut soit avancer Stripe Tax et une
   offre MoR (Stripe Managed Payments ou partenaire MoR), soit **facturer nettement moins de 5 %** tant que ce n'est pas
   le cas.
2. **Petits paniers :** sur Stripe, frais carte EEE standard d'environ 1,5 % + 0,25 € (à vérifier selon le contrat).
   - Article à **0,99 €** : environ 0,26 € de Stripe + 0,05 € de Wolleen. Le studio garde environ **69 %**, moins que
     sur l'App Store Small Business (85 %).
   - Article à **4,99 €** : environ 0,32 € + 0,25 €. Le studio garde environ **88 %**.
   - Article à **19,99 €** : environ 0,55 € + 1,00 €. Le studio garde environ **92 %**.

   → Il faut un **prix plancher conseillé (≥ 4,99 €)** ou, plus tard, un **porte-monnaie Wolleen** (recharge unique,
   dépensée dans plusieurs jeux) qui amortit le coût fixe et sert la fidélité multi-jeux.
3. **Promesse joueur « moins cher » :** c'est le studio qui fixe le prix. Il faut l'**outiller** : afficher l'économie
   par rapport au prix du store, et suggérer un bonus web (+10 % de monnaie, comme Supercell) plutôt qu'une baisse de
   prix sèche qui irrite les stores.

## 3. Recommandation de commission

**Principe :** une grille simple, publique et sans astérisque, à la manière de Tebex. C'est la meilleure arme face à la
complexité de Xsolla et aux tarifs sur devis d'Appcharge et Aghanim.

| Offre | Commission Wolleen | Frais de paiement | Conditions |
|---|---|---|---|
| **Fondateurs** (les 50 premiers studios) | **0 % pendant 12 mois**, plafonné à 100 k€ de volume par studio | Refacturés au coût réel (Stripe), détaillés sur chaque commande | Retour produit mensuel, logo et témoignage autorisés |
| **Standard** (tant que Wolleen n'est pas MoR) | **3,5 %** | Au coût réel | Aucun engagement |
| **Standard** (une fois MoR, Stripe Tax ou partenaire) | **5 %** | Au coût réel | Aligné sur Xsolla et Stash, mais TVA incluse |
| **Volume** | 3 % au-delà de 1 M€ par an et par jeu | Au coût réel | Négociable au-delà de 5 M€ |

À noter :

- **Option à tester : la commission différenciée par source.** Sur une vente issue du **trafic du studio** (lien depuis le
  jeu, code de liaison), on applique la grille ci-dessus. Sur une vente **apportée par Wolleen** (joueur arrivé par la
  recherche ou les catégories de la place de marché, sans lien du studio), on prend 8 à 10 %. La place de marché devient
  un canal d'acquisition payé à la performance, ce qui justifie une marge supérieure au simple PSP. Prérequis : une
  attribution fiable (paramètre de source au moment de la liaison ou de l'achat).
- **Garder 1 % pour la fidélité multi-jeux** (points Wolleen) dans la grille à 5 %, et l'annoncer comme tel :
  « 1 point sur 5 revient au joueur ».
- La valeur actuelle `DEFAULT_PLATFORM_FEE_BPS = 500` reste un bon défaut technique. Les offres ci-dessus se pilotent par
  studio (`PLATFORM_FEE_BPS` ou un champ par studio, à prévoir côté données).

## 4. Cibles prioritaires

### Studios

| Priorité | Profil | Pourquoi |
|---|---|---|
| **1** | **Studios indépendants et AA de free-to-play mobile, 5 à 50 personnes, 100 k€ à 5 M€ de revenu in-app par an**, Europe (France d'abord) et Amérique du Nord | Trop petits pour qu'Appcharge, Aghanim ou Xsolla les accompagnent, assez gros pour que 25 points de marge comptent. Ils n'ont pas d'équipe web : l'éditeur visuel et le libre-service répondent exactement à ce manque. |
| **2** | **Jeux PC et navigateur free-to-play** (MMO indépendants, jeux web, jeux Steam avec monnaie in-game) | Leur public est déjà habitué à payer sur le web. Pas de frais de lien Google ou Apple. Intégration par webhook simple. |
| **3** | Éditeurs mid-core qui ont déjà un prestataire (migration) | Cycle de vente long : à viser plus tard, avec des études de cas. |

**Genres :** cibler les plus forts en D2C et en réachat, c'est-à-dire **RPG et gacha**, **stratégie et 4X**, **idle et
jeux de collection**, et **simulation et ferme** (cohérent avec la démo `gam_farm`). Le **casino social** est le premier
genre D2C (environ 30 % du revenu hors stores), mais il pose des risques de conformité et d'acceptation par les PSP
(Stripe restreint certaines catégories) : à **exclure au lancement**. Le puzzle et l'hypercasual monétisent peu en
in-app et ont une faible part D2C : à **ne pas prioriser**.

### Joueurs

**Joueurs engagés qui dépensent** (au moins un achat par mois) des jeux du catalogue, avec deux portes d'entrée : le jeu
lui-même (code de liaison, bonus web) et la recherche web (« acheter des gemmes <jeu> moins cher »). Ils veulent trois
choses : **officiel**, **livré tout de suite**, **plus avantageux**.

## 5. Acquisition : vaincre le catalogue vide (risque n° 1)

Une place de marché sans jeux n'attire pas de joueurs, et sans joueurs elle n'intéresse pas les studios. La stratégie
consiste à **faire venir les studios pour l'outil, puis à les retenir par le réseau** :

### Phase A : l'outil d'abord (mois 0 à 6, objectif 20 jeux en ligne)

1. **Vendre Wolleen comme une boutique web en marque blanche** (`/games/[slug]` partageable, et plus tard domaine
   personnalisé), avec un trafic **apporté par le studio** (lien dans le jeu, Discord, réseaux sociaux). La valeur ne
   dépend pas encore de la place de marché.
2. **Ne pas ouvrir la page d'accueil « catalogue » au grand public avant environ 15 à 20 jeux.** En attendant, mettre en
   avant les boutiques individuelles plutôt qu'un catalogue clairsemé.
3. **Accompagnement des fondateurs :** l'équipe Wolleen **construit elle-même la boutique** du studio avec l'éditeur
   (à partir de captures du jeu), branche le webhook avec lui et vise la **première vente en moins de 48 h**. Chaque
   boutique sert ensuite de vitrine commerciale.
4. **Chasse ciblée :** lister environ 200 jeux free-to-play européens de la cible (sources : classements Sensor Tower et
   AppMagic, Steam, salons). Approcher en direct avec une **maquette de leur boutique déjà faite** dans l'éditeur.
   C'est l'avantage unique de l'éditeur visuel : la maquette personnalisée sert de pitch.
5. **Canaux de l'écosystème :** SNJV, Game Connection, Stunfest, Gamescom, Pocket Gamer Connects ; incubateurs et
   accélérateurs (Pôle Images, Pulsar, Plaine Images) ; serveurs Discord de développeurs indépendants ; Reddit
   r/gamedev ; game jams sponsorisées.
6. **Réduire le coût d'intégration :** ajouter un mode « **codes d'échange** » (le studio importe des codes, Wolleen les
   remet au joueur, comme Supercell avec ses codes sur le web). Un jeu sans serveur pourrait alors vendre dès le premier
   jour, sans webhook ni SDK. C'est la meilleure arme contre le catalogue vide.

### Phase B : le réseau (à partir d'environ 20 jeux)

1. **Ouvrir le catalogue joueur** par niche (un genre et une langue) pour qu'il paraisse plein dans sa catégorie.
   « 12 RPG » vaut mieux que « 40 jeux en vrac ».
2. **Bouton « Demande ton jeu »** sur les recherches sans résultat : le joueur laisse son e-mail et le nom du jeu. Les
   votes alimentent la prospection (« 340 joueurs de votre jeu vous attendent sur Wolleen »).
3. **Fidélité multi-jeux (points Wolleen)** : c'est la raison de revenir sur Wolleen plutôt que sur la boutique d'un seul
   studio. Chaque studio qui rejoint enrichit la valeur des points pour tous.
4. **Créateurs de contenu :** codes créateur, comme Tebex (1 %) et Supercell (programme créateurs), avec une part
   partagée entre studio et Wolleen. Cibler les créateurs YouTube et Twitch des genres prioritaires.
5. **SEO :** une page par jeu et par article (« <monnaie> <jeu> officiel, moins cher, livraison instantanée »).
   C'est la porte d'entrée joueur que Codashop exploite massivement.
6. **Promotions croisées :** « vous jouez à X, découvrez Y » avec un bonus de bienvenue financé par le studio Y.

### À éviter

- Acheter du trafic joueur payant avant d'avoir un catalogue dense : le coût d'acquisition serait gaspillé.
- Courir après un gros éditeur dès le départ : cycle de 6 à 12 mois, exigences de MoR, de SOC 2 et de PCI.
- Les revendeurs gris (modèle LootBar) : la confiance de « l'officiel » est l'actif principal.

## 6. Ajustements suggérés à la feuille de route

| Sujet | Plan actuel | Suggestion |
|---|---|---|
| Stripe Tax et TVA | Phase 2 | **À avancer en priorité** : condition pour facturer 5 % |
| Fidélité multi-jeux | Phase 3 | **Phase 2** : version minimale (points gagnés partout, dépensés partout, en bon de réduction) |
| Génération IA des cartes depuis une capture | Phase 3 | Prototype tôt, à des fins **commerciales** (maquettes de prospection) |
| Mode codes d'échange | Absent | **Phase 1.5** : livraison sans intégration |
| Attribution de la source de vente | Absent | Phase 2 : prérequis de la commission différenciée et du calcul du coût d'acquisition |
| MoR mondial | Phase 3 | Étudier dès la phase 2 un partenaire MoR plutôt que de le construire |

## 7. Métriques à suivre

### Offre (studios et catalogue)
- **Jeux en ligne** (au moins une vente payée) et **jeux actifs** (au moins une vente sur les 30 derniers jours)
- **Délai jusqu'à la première vente** : de l'inscription du studio au premier `paid`. Cible : moins de 48 h pour les
  fondateurs
- **Délai d'intégration** : clé API → première livraison `delivered` ou `acknowledged`
- **Funnel studio** : inscription → boutique publiée → intégration validée → première vente → 10 ventes
- Rétention des studios à 3 et 6 mois, et volume par studio

### Demande (joueurs)
- **Taux de recherches sans résultat** et **votes « Demande ton jeu »** (indicateur direct du catalogue vide)
- Taux de conversion visite boutique → achat, et **taux de réussite de la liaison** (code et id_confirm)
- **Taux d'abandon du checkout**
- **Part des joueurs qui achètent dans 2 jeux ou plus** (preuve de l'effet place de marché et de la fidélité)
- Taux de réachat à 30 et 90 jours, panier moyen
- **Part du trafic apporté par Wolleen** par rapport au trafic du studio (justifie la valeur de la place de marché)

### Fiabilité et risque
- **Délai de livraison** (`paid` → `delivered`), au 50e et au 95e centile. Cible : moins de 10 s au 95e centile pour le
  webhook
- **Taux de livraison automatique sans intervention**, et taux de relances épuisées
- Zéro double crédit (incident critique)
- **Taux de rétrofacturation** (cible : moins de 0,5 %, le seuil d'alerte des réseaux de cartes étant proche de 1 %),
  taux de remboursement, fraude

### Économie
- **Volume de ventes (GMV)**, **commission effective** (revenu Wolleen ÷ GMV), revenu net après frais Stripe
- Part de la marge rendue au joueur (points de fidélité, bonus) et coût d'acquisition joueur et studio
- **Économie réelle pour le studio** par rapport aux stores (indicateur commercial clé pour les études de cas)

## 8. En résumé

1. Ne pas se vendre comme « une boutique à 5 % de plus », mais comme **« le Supercell Store des studios indépendants »** :
   une place de marché officielle et multi-jeux, une fidélité partagée et des boutiques qui ont l'air du jeu.
2. **Tarif simple et public** : 0 % pour les fondateurs, 3,5 % tant que Wolleen n'est pas MoR, 5 % une fois MoR (dont 1 %
   reversé en fidélité). Option à tester : une commission majorée sur les ventes apportées par la place de marché.
3. Cible : **studios free-to-play mobile et PC de 5 à 50 personnes, en Europe, sur les genres RPG, stratégie, idle et
   simulation**.
4. **Contre le catalogue vide :** marque blanche d'abord, accompagnement des fondateurs avec une maquette déjà faite,
   mode codes d'échange, catalogue ouvert par niche seulement à partir d'environ 20 jeux, bouton « Demande ton jeu ».
