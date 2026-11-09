# Paysage concurrentiel : boutiques web (D2C) pour achats in-app

> Veille réalisée le 9 novembre 2026, par recherche web uniquement. Les pages officielles de tarifs (xsolla.com, stash.gg,
> docs.tebex.io) n'étaient pas accessibles depuis l'environnement de recherche. Les chiffres viennent donc des extraits indexés
> de ces pages, de communiqués et de la presse spécialisée. Les chiffres marqués **(à vérifier)** viennent d'un tiers ou
> d'un concurrent. Il faut les confirmer avant de les citer en externe. Les sources sont listées en fin de document.

## 1. Contexte de marché (2025-2026)

### Taille et adoption

- Les revenus D2C des jeux mobiles atteignent **environ 17 Md$, soit environ 15 % du marché des achats in-app mobiles**
  (rapport Appcharge 2026, estimation proche chez Bain pour 2025).
- **74 % des 50 jeux mobiles les plus rentables** ont une boutique web en 2026, contre 12 % en 2019 (Bain, cité par
  Wnhub et Pocketgamer.biz). Pour Appcharge, 72 % du top 20.
- Côté studios, l'enquête Omdia × FastSpring (avril-juin 2026) montre que 38 % des entreprises font **10 à 19 % de leur
  revenu en D2C**. Aucune de l'échantillon n'en fait 50 % ou plus. Les meilleurs cas dépassent largement cette moyenne :
  Playtika et Huuuge sont à environ 40 %, et Xsolla cite des studios à 70 % (best case vendeur).
- Le D2C pèse surtout dans le **casino social** (environ 30 % du revenu hors stores, Sensor Tower), puis le RPG. Il reste
  faible sur le puzzle et la stratégie.

### Réglementation : ce qui a ouvert la porte

| Plateforme | Situation (novembre 2026) |
|---|---|
| **Apple (États-Unis)** | Les liens vers un achat externe sont autorisés depuis l'injonction Epic c. Apple. En décembre 2025, la Cour d'appel du 9e circuit a jugé la commission de 27 % « prohibitive ». L'affaire est renvoyée en première instance pour fixer la commission éventuelle. **0 % de commission Apple sur les achats via lien externe tant que rien n'est fixé** (à vérifier sur le dossier n° 4:20-cv-05640-YGR). |
| **Google Play (États-Unis, R.-U., EEE)** | Nouvelle grille depuis le **30 juin 2026** : frais de service, plus 5 % de frais de facturation si l'on utilise Google Play Billing. Google prélève aussi une commission sur les achats web reliés à une installation, soit **environ 10 à 20 % selon le programme** (chiffres divergents selon les sources). Aux États-Unis, ces frais sur les liens web sont dus à partir du 1er octobre 2026. |
| **UE (DMA)** | Liens externes et moyens de paiement alternatifs autorisés. Apple y conserve des frais spécifiques. |
| **Epic Games Store** | 0 % sur le premier million de dollars par application et par an, puis 12 %. Web Shops annoncés en mai 2025. Le barème propre aux Web Shops n'a pas été confirmé publiquement. |

**À retenir pour Dev AppStore :** les frais de Google portent sur les achats **reliés à l'application**, par un lien ou une
installation existante. Un achat que le joueur fait de lui-même sur une place de marché externe, sans lien depuis
l'appli, sort a priori de ce périmètre. C'est le cas de Codashop ou du Supercell Store visité directement. Cet avantage
structurel doit être confirmé par un juriste.

## 2. Tableau de synthèse

| Acteur | Modèle | Commission publique | Liaison de compte | LiveOps / personnalisation | Fidélité | SDK / intégration | Clients connus |
|---|---|---|---|---|---|---|---|
| **Xsolla Web Shop** | MoR | **5 % + « coût du canal »** (paiement), sans frais d'installation. Rétrofacturation 7 à 15 $ (carte) | ID joueur sans mot de passe, deep link depuis le jeu, QR code, Xsolla Login | Promos, offres personnalisées, codes, événements | Oui (récompenses quotidiennes, points) | SDK Unity/Unreal, API, webhooks | Plus de 800 Web Shops actifs, plus de 400 lancements fin 2024 |
| **Appcharge** | MoR | Non publique. Promet de garder « jusqu'à 95 % » | ID joueur, liens app → web (« payment links ») | API de personnalisation par joueur (offres, soldes, segments), rafraîchie à la connexion, après achat et toutes les 5 min | Oui | SDK mobile, checkout intégré | King, Huuuge, Tripledot, Product Madness, SciPlay, KamaGames. Plus de 150 jeux, 1 Md$ de volume annualisé (mars 2026) |
| **Stash** | MoR | **5 % fixe + frais de canal refacturés**, soit environ 10 % au total selon son propre simulateur | ID joueur, catalogue unifié | Remises dynamiques, offres | **Oui, axe fort** (paliers, XP de fidélité). Revenu quotidien ×7 sur Warhammer 40K: Tacticus | SDK Unity, Stash Pay (pop-ups de paiement iOS dans le jeu), partenaire Unity IAP | Snowprint (Tacticus). Partenariat Adyen |
| **Aghanim** | MoR | Non publique | ID joueur | **LiveOps Builder** avec modèles (« Blueprints »), personnalisation par IA, segmentation, analytique prédictive | Oui | Framework **Kinetic** de personnalisation du site, Checkout 2.0, paiements instantanés | Nexters (Hero Wars, août 2026), Vertigo Games (Critical Strike, revenu web ×3 en un mois) |
| **Coda (Codapay, Custom Commerce, Codashop)** | MoR | Non publique | ID joueur | Boutiques sur mesure | Partielle | API Codapay, **intégré à Unity IAP 5.4** | Plus de 300 éditeurs : Activision, EA (FC Mobile), Riot, Farlight, miHoYo (via Codashop) |
| **Tebex** | MoR | **5 % de frais de plateforme** (15 % pour FiveM), plus frais de passerelle (environ 2,49 % + 0,40 $), 1 % sur les codes créateur, virement à 12 £ | Pseudo / compte serveur | Ventes, coupons, abonnements | Codes créateur | Plugins serveurs (Minecraft, FiveM, Rust…), API | Écosystème serveurs PC, offre « Tebex Studios » |
| **PayNow.gg** | MoR | 3,5 % / 3 % / 2,5 % selon l'offre (après frais de passerelle, données du vendeur) | Pseudo / compte serveur | Basique | Non | Plugins serveurs | Serveurs de jeux (concurrent direct de Tebex) |
| **Neon (neonpay)** | MoR | Non publique | ID joueur | Neon Shop, Neon Console | **Neon Loyalty** | Checkout hébergé, intégré ou direct | Partenariat Razorpay (Inde) |
| **Supercell Store** | Boutique propriétaire d'un éditeur | n/a | **Supercell ID** (un compte pour tous les jeux Supercell) | Offres exclusives au web, personnalisées par compte. Événements communautaires (barre de progression mondiale) | **ID Rewards** : points gagnés sur un jeu et dépensés dans n'importe quel jeu Supercell. Expiration 12 mois | Interne | 5 jeux Supercell (Clash of Clans, Clash Royale, Brawl Stars…) |
| **Unity IAP 5.4 (webshop)** | Unity n'est pas MoR, il délègue au PSP choisi | **0 % Unity**, seuls les frais du PSP s'appliquent | Via le jeu Unity | Boutique sans code | Non | Natif Unity. PSP : Stripe, Coda, Stash | Disponible depuis le 1er juillet 2026 |
| **Stripe (pour le gaming)** | Le studio est marchand (Stripe Managed Payments en option) | Barème Stripe standard | Aucune | Aucune | Aucune | Checkout, Link, Billing. Partenaire Unity | Voodoo (économie annoncée jusqu'à 90 % des frais de paiement aux États-Unis) |
| **FastSpring / Paddle** | MoR généralistes | Paddle environ 5 % + 0,50 $ **(à vérifier)**. FastSpring : % plus montant fixe | Aucune | Faible | Non | API e-commerce | Logiciels et jeux PC (clés), peu d'in-app |
| **Places de marché de recharge** (Codashop, Midasbuy, LootBar, Razer Gold, SEAGM) | Revendeurs / distributeurs officiels (sauf LootBar) | Marge distributeur non publique | Saisie de l'ID joueur | Promos | Points (Razer Gold) | Accords éditeurs | Codashop : Moonton, Garena, Krafton, miHoYo. Midasbuy : jeux Tencent uniquement. LootBar : plus de 150 jeux, réputation contestée |

MoR = marchand de référence (*merchant of record*). Le prestataire est le vendeur légal : il collecte et reverse la TVA,
porte la fraude et les rétrofacturations, et fait le support de paiement.

## 3. Fiches détaillées

### Xsolla (Web Shop, Pay Station)

- **Positionnement :** leader historique et le plus complet. Il revendique plus de 800 Web Shops actifs et la plus large
  couverture de moyens de paiement. Son *Xsolla Report Mobile D2C Edition* (septembre 2026) inclut un tableau
  réglementaire par pays.
- **Tarifs :** 5 % des transactions plus le coût du canal de paiement (pages Pay Station et Site Builder). Ni frais
  d'installation ni coût d'intégration. Frais additionnels : rétrofacturation carte de 7 à 15 $, PayPal 10 $.
  Selon un concurrent, le tout revient à environ 5 % + 0,50 $ pour un petit studio **(à vérifier)**.
- **Liaison :** connexion par ID utilisateur (sans inscription), deep link depuis le jeu (seule méthode qui permet
  d'enregistrer un moyen de paiement), QR code sur ordinateur, Xsolla Login.
- **Annonce :** une « nouvelle génération » de Web Shop est prévue fin 2026. Xsolla anticipe des boutiques « natives IA »,
  une **banalisation des prix** et la boutique comme **surface de découverte possédée**.
- **Faiblesses perçues :** complexité, frais additionnels peu lisibles, image d'outil pour gros éditeurs.

### Appcharge

- **Positionnement :** pure player D2C mobile (Israël), financé à hauteur de 58 M$ en série B (août 2025). Il est passé de
  500 M$ (juillet 2025) à **1 Md$ de volume annualisé (mars 2026)** et vise 10 Md$ d'ici un à deux ans.
- **Tarifs :** non publics, sur devis. Le message « gardez jusqu'à 95 % » suggère environ 5 % hors cas particuliers.
- **Forces :** personnalisation fine par API côté studio (offres, soldes, segments), liens de paiement app → web,
  clientèle casino social et casual.

### Stash (stash.gg)

- **Positionnement :** fondé par Justin Kan (cofondateur de Twitch). Discours « transparent » et orienté petits et moyens
  studios. Partenaire Adyen et partenaire Unity IAP.
- **Tarifs :** **5 % fixes plus frais de canal refacturés au réel**. Son simulateur retient environ 10 % au total
  (entre 8 et 12 % selon le pays et le moyen de paiement).
- **Forces :** **fidélité** (étude de cas Tacticus : revenu quotidien de la boutique ×7, 75 % de réachat), Stash Pay
  (paiement web en pop-up dans le jeu iOS), contenus pédagogiques (simulateur « une boutique web vaut-elle le coup ? »).

### Aghanim

- **Positionnement :** fondé par l'ex-CEO et l'ex-CTO de Xsolla. Il vend des « Game Hubs », des sites riches qui vont
  au-delà de la simple boutique.
- **Tarifs :** non publics.
- **Forces :** LiveOps Builder avec campagnes préconfigurées, personnalisation par IA, framework Kinetic de
  personnalisation visuelle avancée, paiements instantanés. Arguments clés : migration en 30 jours depuis un autre
  prestataire, 40 % des joueurs sur le hub dès la première semaine (Vertigo).
- **Lecture :** c'est le concurrent le plus proche sur la **personnalisation visuelle**, mais il est opéré par des équipes
  d'intégration, sans éditeur en libre-service.

### Coda (Codapay, Custom Commerce, Codashop)

- **Positionnement :** géant asiatique (Singapour, licence MPI de la MAS obtenue en 2026). Plus de 400 moyens de paiement
  dans plus de 70 marchés, plus de 300 éditeurs.
- **Double casquette :** **Codashop** est une place de marché grand public multi-jeux (recharge par ID joueur), et
  **Custom Commerce** fait des boutiques en marque blanche pour les éditeurs.
- **Intégration :** prestataire de paiement natif d'**Unity IAP 5.4**.
- **Lecture :** c'est le seul acteur qui combine déjà place de marché joueur et boutique éditeur, mais avec une esthétique
  de recharge générique, sans reproduire l'univers de chaque jeu, et un fort ancrage en Asie du Sud-Est.

### Tebex (et PayNow)

- **Positionnement :** référence des serveurs communautaires PC (Minecraft, FiveM, Rust). MoR avec protection vendeur :
  pas de perte sur rétrofacturation pour la plupart des créateurs.
- **Tarifs publics, ce qui est rare :** 5 % de frais de plateforme (15 % pour FiveM), avant taxes et frais de passerelle.
  Passerelle à environ 2,49 % + 0,40 $, 1 % sur les codes créateur, virement à 12 £.
- **PayNow** l'attaque frontalement par le prix (2,5 à 3,5 %, chiffres du vendeur).
- **Lecture :** Tebex prouve qu'un modèle à 5 % affiché publiquement et en libre-service fonctionne pour des milliers de
  petits créateurs.

### Supercell Store (modèle propriétaire de référence)

- C'est un cas d'école pour Dev AppStore : **un compte (Supercell ID) pour plusieurs jeux**, des **points de fidélité
  utilisables dans tous les jeux** (ID Rewards), des **offres exclusives au web** (offre quotidienne Clash Royale, bonus
  de gemmes d'environ 10 % sur Brawl Stars **(à vérifier)**), des événements communautaires propres au web et des codes
  d'échange déplacés vers le web pour y attirer les joueurs.
- Stash attribue au Supercell Store une contribution au passage de 5 jeux au-delà du milliard de dollars.
- **Lecture :** Dev AppStore peut offrir à des studios indépendants ce que Supercell s'est construit en interne, en mutualisant
  compte, points et trafic entre studios.

### Unity IAP 5.4 et Stripe

- Depuis le **1er juillet 2026**, Unity propose une boutique web sans code intégrée au SDK IAP. Unity ne prend **aucune
  commission**. Stripe, Coda et Stash servent de PSP.
- **C'est la menace la plus sérieuse pour la simplicité et le prix :** un studio Unity obtient une boutique web
  « gratuite » sans quitter son outil. Il paie seulement les frais du PSP, et le studio est marchand si ce PSP est Stripe.
- En revanche, Unity ne propose ni place de marché joueur, ni fidélité inter-jeux, ni reproduction visuelle poussée.

### Places de marché de recharge (Codashop, Midasbuy, LootBar, Razer Gold, SEAGM)

- Ce sont les seuls acteurs déjà **orientés joueur et multi-jeux**, comme Dev AppStore. Les joueurs y cherchent leur jeu,
  saisissent leur ID et rechargent.
- Midasbuy ne sert que les jeux Tencent. Codashop est très fort en Asie du Sud-Est et canal officiel de miHoYo.
  LootBar couvre plus de 150 jeux avec de fortes remises, mais sa fiabilité est contestée (connexion par mot de passe sur
  certains jeux).
- **Lecture :** la demande joueur pour un « Codashop occidental, officiel et soigné » existe. La confiance est le premier
  critère : ventes officielles et livraison garantie.

## 4. Ce que le marché enseigne

1. **5 % est devenu le prix de référence**, et c'est un plancher pour un MoR (Xsolla, Stash, Tebex, implicitement
   Appcharge). En dessous : PayNow (2,5 à 3,5 %), Unity (0 %) et Epic (0 % jusqu'à 1 M$). **Le prix seul ne différencie
   plus.**
2. **Les acteurs établis sont des marchands de référence.** Ils prennent en charge TVA, fraude et litiges.
   Dev AppStore (Stripe Connect avec `application_fee_amount`) **n'est pas MoR à ce stade** : le studio reste vendeur et
   responsable de la TVA (Stripe Tax est prévu en phase 2). C'est un handicap face à un concurrent à 5 % qui inclut
   la conformité.
3. **La valeur se déplace vers la LiveOps, la personnalisation et la fidélité** (Aghanim, Stash, Appcharge). La boutique
   brute devient une commodité, ce que Xsolla écrit lui-même.
4. **Personne ne fait vraiment de place de marché occidentale, multi-studios et officielle côté joueur.** Codashop et
   LootBar sont génériques et d'abord asiatiques. Le Supercell Store est mono-éditeur. Xsolla voit la boutique devenir une
   « surface de découverte », mais pour chaque jeu séparément.
5. **La reproduction fidèle de l'univers du jeu** est un argument réel (Kinetic chez Aghanim), mais elle passe aujourd'hui
   par des équipes d'intégration, pas par un éditeur en libre-service.

## Sources

Les liens suivis d'un astérisque renvoient à un concurrent ou à un contenu promotionnel.

- Bain / Wnhub, « web shops are now available for 74% of top mobile games » : https://wnhub.io/news/analytics/item-51815
- Pocketgamer.biz, « Mobile game D2C revenues reach $17bn » : https://www.pocketgamer.biz/report-mobile-game-d2c-revenues-reach-17bn-as-publishers-push-beyond-app-stores/
- Appcharge, rapport 2026 (700 M$ de transactions) : https://appcharge.com/blog/inside-700-m-of-mobile-game-dtc-transactions-2026-report
- Omdia × FastSpring (GameDev Reports) : https://gamedevreports.substack.com/p/omdia-and-fastspring-d2c-game-monetization
- Sensor Tower via Pocketgamer.biz : https://www.pocketgamer.biz/sensor-tower-reveals-the-hidden-impact-of-d2c-revenue-in-mobile-games/
- Xsolla Report Mobile D2C Edition (BusinessWire, 28/09/2026) : https://secure.businesswire.com/news/home/20260928312597/en/Xsolla-Releases-The-Xsolla-Report-Mobile-D2C-Edition
- Xsolla, tarifs Pay Station : https://xsolla.com/products/paystation/pricing (page non joignable, extrait indexé)
- Xsolla, authentification Web Shop : https://developers.xsolla.com/solutions/web-shop/create-web-shop/set-up-authentication/
- Xsolla, plus de 400 lancements (Game Developer) : https://www.gamedeveloper.com/press-release/xsolla-reaffirms-market-leadership-in-web-shop-solutions-with-the-most-comprehensive-feature-set-and-over-400-successful-launches
- Fungies, « Xsolla alternatives »* : https://fungies.io/alternatives/xsolla
- GamesBeat, Appcharge 1 Md$ : https://gamesbeat.com/appcharge-reaches-1-billion-in-annualized-dtc-transaction-volume/
- GamesBeat, Appcharge série B : https://gamesbeat.com/appcharge-raises-58m-for-direct-to-consumer-platform/
- Appcharge, personnalisation (docs) : https://docs.appcharge.com/guides/webstore/personalization/about-personalization
- Stash, paiements et simulateur : https://www.stash.gg/v2/payments-v2, https://www.stash.gg/fee-calculator
- Stash, étude de cas fidélité : https://www.stash.gg/blog/how-stash-unlocked-a-7x-jump-in-daily-webshop-revenue-powered-by-loyalty
- Stash, Supercell Store : https://www.stash.gg/blog/supercell-store
- Stash × Adyen (GamesBeat) : https://gamesbeat.com/stash-and-adyen-partner-to-bring-enterprise-grade-payments-to-game-web-shops/
- Aghanim, Checkout 2.0 et Kinetic : https://technode.global/prnasia/aghanim-unveils-checkout-2-0-kinetic-framework-more-to-power-the-future-of-game-commerce/
- Aghanim × Nexters (GamesBeat) : https://gamesbeat.com/aghanim-will-provide-d2c-gaming-store-to-nexters-global/
- Aghanim × Vertigo (GamesBeat) : https://gamesbeat.com/vertigo-games-scores-175-boost-in-critical-strike-revenues-after-switching-web-shops/
- Coda, offres gaming : https://www.coda.co/industries/online-gaming-payments/
- Coda, licence MPI : https://tribune.net.ph/2026/06/16/gaming-payments-giant-coda-gets-singapore-mpi-license
- Coda × EA FC Mobile : https://gamedeveloper.com/press-release/coda-partners-with-ea-sports-fc-to-launch-fc-mobile-webstore
- Tebex, frais de plateforme : https://docs.tebex.io/creators/pricing-and-plans/tebex-platform-fee
- PayNow vs Tebex* : https://paynow.gg/compare/tebex
- Neon, MoR (docs) : https://docs.neonpay.com/docs/merchant-of-record-mor
- Supercell, ID Rewards : https://supercell.com/en/news/id-rewards et https://support.clashroyale.com/hc/en-us/articles/49484922416795-Supercell-ID-Rewards
- Supercell Store (support) : https://support.supercell.com/supercell-store/en/articles/what-is-the-supercell-store-3.html
- Unity IAP 5.4 D2C : https://unity.com/blog/unity-iap-d2c-launch-blog et https://docs.unity.com/en-us/iAP/webshop
- Unity × Stripe (Mobilegamer.biz) : https://mobilegamer.biz/unity-and-stripe-enter-the-webshop-race/
- Stripe pour le gaming : https://stripe.com/industries/gaming
- Epic, 0 % jusqu'à 1 M$ et Web Shops : https://www.macrumors.com/2025/05/01/epic-games-webshops-ios-developers/ et https://mobilegamer.biz/epic-to-launch-webshops-and-zero-commission-scheme-next-month/
- Epic c. Apple, 9e circuit (déc. 2025) : https://www.iclarified.com/99335/appeals-court-reverses-zero-commission-ban-on-apple-says-27-fee-is-too-high
- Epic c. Apple, renvoi (avr. 2026) : https://www.macrumors.com/2026/04/29/epic-games-wins-reversal-app-store-fee-battle/
- Google Play, nouvelle grille au 30/06/2026 : https://www.techrepublic.com/article/news-google-play-store-fees-third-party-payments/ et https://www.stash.gg/blog/googles-lower-fees-announcement-june-2026-whats-really-going-on-and-what-us-developers-should-do
- Places de marché de recharge : https://dashfight.com/news/game-top-up-site-comparison-where-should-you-buy-in-2025-8260 et https://brightsideofnews.com/gaming-news/risks-controversies-around-lootbar/
- FastSpring, offre gaming : https://fastspring.com/solutions/gaming
