# Règles Apple App Store et Google Play — achats web utilisés dans un jeu mobile

> **Note de recherche, pas un avis juridique.** État au **9 novembre 2026**. Ce domaine bouge tous les
> trimestres (procès, régulateurs, nouvelles grilles tarifaires) : revérifier chaque point auprès des textes
> officiels (App Review Guidelines, Payments policy Google Play, Developer Program License Agreement) avant
> toute décision. Les chiffres marqués *(à confirmer)* proviennent de sources secondaires discordantes.

## 1. Le cas d'usage Dev AppStore, en une phrase

Le joueur achète un objet **sur le site Dev AppStore (navigateur, hors de l'app)** ; le jeu mobile, distribué par
l'App Store ou Google Play, **crédite l'objet** (webhook signé ou SDK). **Aucun lien d'achat dans l'app** dans
le scénario de base.

Juridiquement, cela relève de deux régimes distincts :

1. **La consommation dans l'app d'un contenu acheté ailleurs** — c'est la règle « multiplatform services »
   d'Apple (3.1.3(b)) et la règle « consumption-only / contenu acheté hors de l'app » de Google.
2. **L'incitation (« steering ») depuis l'app vers l'achat externe** — boutons, liens, messages « moins cher
   sur le web ». C'est ce volet qui a été bouleversé par Epic v. Apple, Epic v. Google, le DMA, la loi
   japonaise, la loi coréenne, et qui varie selon le pays de la vitrine (storefront).

**Point clé** : le volet 1 est autorisé quasiment partout depuis longtemps et **ne donne lieu à aucune
commission** des stores lorsqu'il n'y a aucun lien ni incitation dans l'app. Le volet 2 est réglementé, et
souvent facturé, région par région.

## 2. Apple — App Store

### 2.1 Texte applicable (App Review Guidelines, consultées le 2026-11-09)

- **3.1.1** : tout déblocage de fonctionnalité ou de contenu *dans l'app* (dont « in-game currencies ») doit
  passer par l'In-App Purchase (IAP).
- **3.1.3(b) Multiplatform Services**, texte actuel :
  > « Apps that operate across multiple platforms may allow users to access content, subscriptions, or
  > features they have acquired in your app on other platforms or your web site, **including consumable
  > items in multi-platform games, provided those items are also available as in-app purchases within the
  > app.** »
- **3.1.3 (chapeau)** : les apps relevant de 3.1.3 « cannot, within the app, encourage users to use a
  purchasing method other than in-app purchase, **except for apps on the United States storefront** and as
  set forth in 3.1.1(a) and 3.1.3(a). **Developers can send communications outside of the app to their user
  base about purchasing methods other than in-app purchase.** »
- **3.1.1(a)** : liens vers d'autres moyens d'achat via les *StoreKit External Purchase Link Entitlements*
  dans certains pays ; **ces entitlements ne sont pas requis sur la vitrine des États-Unis** ; dans les autres
  vitrines (hors entitlement), « apps and their metadata may not include buttons, external links, or other
  calls to action that direct customers to purchasing mechanisms other than in-app purchase ».
- **3.1.1 (loot boxes)** : obligation d'afficher les probabilités avant achat (règle Apple, mais aussi
  attendue côté consommateur — à reproduire sur Dev AppStore pour tout objet aléatoire).

### 2.2 Ce que cela implique, monde entier

| Question | Réponse | Fondement |
|---|---|---|
| Un jeu iOS peut-il créditer un objet consommable acheté sur Dev AppStore ? | **Oui** | 3.1.3(b) |
| Condition ? | **L'objet doit aussi être disponible en IAP dans l'app iOS** | 3.1.3(b) |
| Apple prend-elle une commission sur l'achat web organique (sans lien depuis l'app) ? | **Non**, dans aucune région à notre connaissance *(voir zone grise UE §2.4)* | Pas de base contractuelle : la transaction n'a pas lieu dans l'app ni via un lien de l'app |
| Le studio peut-il écrire à ses joueurs (e-mail, réseaux, site, Discord) « achetez moins cher sur Dev AppStore » ? | **Oui**, hors de l'app | 3.1.3 dernière phrase (issue de l'accord Cameron 2021) |
| Le jeu peut-il afficher dans l'app un bouton/lien/texte vers Dev AppStore ? | **Dépend de la vitrine** (tableau §4) | 3.1.1(a), 3.1.3 |
| Le prix peut-il être plus bas sur Dev AppStore qu'en IAP ? | **Oui**, aucune clause de parité de prix | — |

### 2.3 États-Unis : Epic v. Apple

- **30 avril 2025** : la juge Gonzalez Rogers (N.D. Cal.) déclare Apple en *contempt* de l'injonction de 2021
  et lui interdit toute commission sur les achats effectués via un lien sortant, ainsi que toute restriction
  de forme sur les boutons/liens. Apple modifie les Guidelines (exception « United States storefront »
  ci-dessus).
- **Décembre 2025** : la Cour d'appel du 9ᵉ circuit **confirme le contempt** mais **annule l'interdiction
  totale de commission** : Apple peut facturer une commission « raisonnable » et non prohibitive (la
  commission de 27 % étant, elle, jugée prohibitive) ; renvoi au tribunal pour fixer ce niveau.
- **Avril–mai 2026** : levée de la suspension du renvoi ; la Cour suprême refuse de suspendre.
- **30 juin 2026** : la Cour suprême accepte d'examiner l'affaire (n° 25-1311) ; mémoire d'Apple au fond
  déposé le 14 septembre 2026 ; plaidoiries attendues pendant le terme ouvert en octobre 2026.
- **13 août 2026** : Apple dépose au tribunal sa proposition de commission « raisonnable » sur les achats
  liés (*remand proffer*).
- **À date (novembre 2026)** : selon les comptes rendus disponibles, **les liens sortants restent sans
  commission aux États-Unis tant que le tribunal n'a pas fixé le taux** ; ce régime est **explicitement
  temporaire**.

**Conséquence** : aux États-Unis, un jeu peut aujourd'hui afficher un bouton « Acheter sur Dev AppStore » sans
entitlement et sans commission Apple. Il faut s'attendre à une **commission future sur les achats liés**
(montant inconnu, inférieur à 27 %), qui ne toucherait pas les achats web organiques.

### 2.4 Union européenne : DMA

- Depuis 2024, Apple propose dans l'UE des conditions spécifiques (paiement alternatif, liens sortants,
  magasins alternatifs). Décision de la Commission d'avril 2025 (amende de 500 M€ sur l'anti-steering,
  art. 5(4) DMA), contestée par Apple ; refonte des conditions en juin 2025.
- **Août 2026** : nouvel accord de fait avec la Commission ; **à compter du 1ᵉʳ octobre 2026**, la *Core
  Technology Fee* par installation est remplacée par une **Core Technology Commission (CTC) de 5 %** sur les
  ventes de biens numériques. Grille rapportée *(à confirmer sur developer.apple.com)* : IAP 26 % (15 % petits
  développeurs/renouvellements), paiement alternatif dans l'app ~20 %, **liens sortants ~15 %** (10 % petits
  développeurs). La Commission « salue » les changements mais n'a pas rendu de décision formelle ; l'enquête
  art. 6(4) reste ouverte.
- **Zone grise** : la formulation exacte du périmètre de la CTC (« digital goods and services sold… ») doit
  être lue dans les conditions d'Apple. Sous les conditions de 2025, les commissions sur liens sortants ne
  visaient que les transactions **initiées depuis l'app** (fenêtre de 7 jours après le clic). Un achat Dev AppStore
  fait par un joueur venu par un autre canal (recherche, publicité, e-mail) **ne devrait pas** être concerné
  — à vérifier sur le texte en vigueur au 1ᵉʳ octobre 2026.

**Conséquence** : dans l'UE, un lien Dev AppStore dans l'app est **possible** avec l'entitlement UE, mais
**facturé** (~15 % + 5 %, à confirmer) : il perd l'essentiel de l'intérêt économique (studio à ~5 % via
Dev AppStore). Recommandation : **pas de lien dans l'app UE**, acquisition par les canaux hors app.

### 2.5 Japon : Mobile Software Competition Act (MSCA)

- En vigueur **depuis le 18 décembre 2025** ; Apple a publié ses conditions japonaises avec iOS 26.2.
- Paiement alternatif et lien vers un site web désormais possibles ; commissions rapportées *(à confirmer)* :
  **~21 %** pour un paiement tiers dans l'app, **~15 %** (10 % petits développeurs) sur les transactions via
  lien web ; IAP abaissée.
- **Restriction mineurs** : pas de lien vers un site d'achat pour les utilisateurs **de moins de 13 ans**.
- Les associations japonaises et la Coalition for App Fairness contestent ces conditions auprès de la JFTC
  (lettre d'août 2026) : évolution possible.

### 2.6 Corée du Sud

- Loi sur les télécommunications amendée en 2021 (interdiction d'imposer un paiement unique). Apple propose un
  entitlement coréen (paiement alternatif dans l'app, commission réduite de 26 %).
- **28 octobre 2026** : la KMCC inflige à Google et Apple **63,7 Md KRW** d'amendes au total (première
  sanction sous la loi de 2021) ; Apple conteste. Les conditions peuvent encore changer.
- Les liens sortants (hors entitlement) restent soumis à 3.1.1(a) — zone grise à surveiller.

### 2.7 Royaume-Uni

- Apple et Google désignés « Strategic Market Status » (oct. 2025). **1ᵉʳ avril 2026** : la CMA accepte des
  engagements (transparence, revue des apps, non-représailles), non directement exécutoires.
- **Steering** : consultation sur des *conduct requirements* publiée le 30 juin 2026, réponses publiées le
  14 août 2026 ; **pas encore de règle contraignante** connue à date. Aujourd'hui, au Royaume-Uni, la règle
  générale 3.1.1(a)/3.1.3 s'applique (pas de lien sans entitlement).

## 3. Google — Google Play

### 3.1 Règle de base (Payments policy, consultée via les pages d'aide Play Console)

- Tout achat de bien numérique **effectué dans une app** distribuée par Play doit passer par Google Play
  Billing, sauf programmes (facturation alternative, liens externes) ou exceptions régionales.
- **Consommation de contenu acheté ailleurs : autorisée.** Google admet qu'une app soit « consumption-only » :
  l'utilisateur accède dans l'app à un contenu payé ailleurs, **à condition que rien ne soit acheté depuis
  l'app** par ce biais.
- **Communication hors de l'app : libre** (e-mail, site, etc.).
- Contrairement à Apple 3.1.3(b), la politique Google **n'impose pas expressément** que l'objet existe aussi
  en Play Billing ; mais si l'app vend des objets in-app, ceux-ci doivent passer par Play Billing ou un
  programme agréé. *Zone grise* : une app qui vendrait un objet uniquement sur le web et ne le proposerait pas
  du tout dans l'app reste admissible selon la règle « consumption-only », mais rien ne doit l'y promouvoir.

### 3.2 Nouvelle grille 2026 (US, Royaume-Uni, EEE)

- **Depuis le 30 juin 2026** (US, UK, EEE ; Australie au 30 septembre 2026 ; reste du monde d'ici le
  30 septembre 2027) : facturation alternative et liens externes ouverts ; frais de service rapportés de
  **10 % sur le premier million de dollars annuel** puis 20 % (10 % abonnements), plus **5 % de frais de
  facturation** uniquement si l'on utilise Google Play Billing *(à confirmer sur la page d'aide Play
  Console « Service fees », answer/112622)*. Le taux dépend aussi du statut « nouvelle installation » vs
  « installation existante ».

### 3.3 États-Unis : Epic v. Google

- Injonction du juge Donato (octobre 2024), exécutoire depuis octobre 2025 après le refus de suspension par
  la Cour suprême : Google ne peut interdire aux développeurs de mettre des liens vers des moyens de paiement
  externes ni de communiquer leurs prix, pour 3 ans.
- Accord transactionnel Epic–Google de novembre 2025 (plafonds de 9 % / 20 %) : **son sort est incertain**
  — une source indique un retrait conjoint le 15 juillet 2026, une autre une audience d'homologation à l'été
  2026. **Statut à vérifier sur le dossier N.D. Cal.**
- Programmes US *External Content Links* et facturation alternative : **déclaration des transactions et
  paiement des frais exigés à partir du 1ᵉʳ octobre 2026** (notice officielle Play Console) — ce sont des
  frais **sur les transactions issues d'un lien dans l'app**, pas sur les achats web organiques.

### 3.4 Autres régions

- **EEE (DMA)** : Google autorise depuis 2024–2025 les offres externes dans l'EEE, facturées (programme
  *External offers*), désormais intégrées à la grille 2026.
- **Japon (MSCA)** : paiement alternatif/lien autorisés ; frais rapportés jusqu'à ~20 % *(à confirmer)*.
- **Corée** : facturation alternative imposée par la loi (commission réduite) ; amende de 42,9 Md KRW
  (oct. 2026).
- **Inde, Indonésie, etc.** : programmes de « User Choice Billing » — hors périmètre initial de Dev AppStore.

## 4. Synthèse par région (novembre 2026)

| Région | Achat web organique, crédité en jeu | Mention / lien Dev AppStore **dans** l'app | Commission store sur achat web |
|---|---|---|---|
| **États-Unis** | Autorisé (Apple : objet aussi en IAP) | **Autorisé** sans entitlement (Apple) ; autorisé (Google, injonction) | Organique : 0. Lien : Apple 0 % **provisoire** (taux « raisonnable » à fixer) ; Google : frais programme depuis 01/10/2026 |
| **UE / EEE** | Autorisé (idem) | Autorisé **avec entitlement / programme**, information encadrée | Organique : 0 *(vérifier périmètre CTC)*. Lien : Apple ~15 % + CTC 5 %, Google ~10–20 % *(à confirmer)* |
| **Royaume-Uni** | Autorisé | Apple : **interdit** hors entitlement (aucun entitlement UK connu) ; Google : programme depuis 30/06/2026 | Organique : 0 |
| **Japon** | Autorisé | Autorisé (entitlement MSCA), **interdit < 13 ans** | Lien : Apple ~15 %, Google ~20 % *(à confirmer)* |
| **Corée du Sud** | Autorisé | Paiement alternatif in-app possible ; liens : zone grise | Paiement alternatif : ~26 % |
| **Reste du monde** | Autorisé | **Interdit** (pas de bouton, lien, ni « call to action ») | Organique : 0 |

## 5. Zones grises propres à Dev AppStore

1. **Écran de liaison par code dans le jeu** (`POST /api/v1/link-codes`, code affiché au joueur). Afficher
   « Votre code : ABCD-1234 » avec le nom ou l'URL de Dev AppStore peut être lu, hors US, comme un « call to
   action » vers un mécanisme d'achat externe si le texte évoque des achats ou des prix.
   *Recommandation* : libellé neutre (« Lier un compte web », « Code de liaison »), **pas d'URL cliquable,
   pas de mention de prix ou de boutique**, et laisser le studio activer cet écran par vitrine. Privilégier
   ailleurs la méthode `id_confirm`, qui ne demande **aucune interface dans le jeu**.
2. **Notification de livraison** (« Merci pour votre achat sur Dev AppStore ! ») : hors US, préférer un message
   neutre (« Objet reçu : Pack de 500 gemmes »). Une notification qui vante la boutique externe peut être vue
   comme une incitation.
3. **Métadonnées de la fiche store** (description, captures) : la règle d'Apple vise aussi les
   « metadata ». Aucune mention de Dev AppStore hors US.
4. **Exigence « also available as IAP »** (Apple) : un objet **exclusif à Dev AppStore** (non vendu en IAP) viole
   3.1.3(b). Les studios doivent maintenir un équivalent IAP (même contenu, prix libre) pour chaque article
   Dev AppStore consommable sur iOS. Les **bonus Dev AppStore** (ex. +10 % de gemmes) sont une zone grise : défendables
   si l'objet de base existe en IAP, mais l'App Review apprécie au cas par cas.
5. **Comptes mineurs** : au Japon, interdiction des liens pour les moins de 13 ans ; les règles de protection
   des mineurs (voir `consumer.md`) s'appliquent dans tous les cas.
6. **Appréciation discrétionnaire de l'App Review** : même conforme sur le papier, une app peut être rejetée
   ou retirée. Le risque est porté par le **studio** (titulaire du compte développeur), pas par Dev AppStore
   — à rappeler dans les conditions studio.

## 6. Conséquences concrètes

### Pour les studios (à mettre dans la documentation d'intégration et les conditions studio)

- Garder chaque article Dev AppStore **également disponible en IAP sur iOS** (Apple 3.1.3(b)).
- **Hors US : aucun bouton, lien, prix comparatif ni mention de Dev AppStore dans l'app ou sa fiche store**, sauf
  entitlement régional assumé (et ses frais).
- **US** : un bouton « Acheter sur le web » est aujourd'hui autorisé et gratuit côté Apple, mais susceptible
  de devenir payant (taux à fixer) ; côté Google, frais de programme depuis le 1ᵉʳ octobre 2026.
- Promotion de Dev AppStore **hors app** : libre partout (e-mails, réseaux, site, communauté, publicités).
- Le studio reste seul responsable de la conformité de son app aux règles des stores.

### Pour Dev AppStore

- Le modèle « achat web organique + livraison automatique » est **le plus robuste** juridiquement : il ne
  dépend d'aucune des décisions en cours.
- L'acquisition des joueurs doit venir **hors des apps** (SEO, catalogue, communication des studios,
  partenariats créateurs). C'est le cœur de la proposition de valeur et non un détail.
- Prévoir dans l'espace studio un **réglage par vitrine** (ex. « autoriser l'écran de liaison dans le jeu :
  US uniquement / partout ») et des **libellés neutres** fournis par le SDK.
- **Communication commerciale** : la constante `STORE_FEE_BPS = 3000` (30 %) ne reflète plus la réalité
  dans toutes les régions (UE 26 %/15 %, Google 10–20 % + 5 %, petits développeurs 15 %). Les comparaisons
  d'économies affichées doivent être exactes et sourcées, sous peine de **pratique commerciale trompeuse**
  (art. L121-2 C. conso) vis-à-vis des joueurs et de mauvaise information des studios.
- **Veille** : arrêt de la Cour suprême US (2027 ?), taux fixé sur renvoi Epic v. Apple, statut de l'accord
  Epic–Google, conduct requirements CMA (UK), évolution JFTC, contentieux DMA.

## Sources (consultées le 9 novembre 2026)

- Apple, *App Review Guidelines* (3.1.1, 3.1.1(a), 3.1.3, 3.1.3(b)) — https://developer.apple.com/app-store/review/guidelines/
- 9ᵉ circuit, *Epic Games v. Apple*, opinion de décembre 2025 — https://www.courthousenews.com/wp-content/uploads/2025/12/epic-games-vs-apple-ninth-circuit-opinion.pdf
- Fenwick, « Ninth Circuit Largely Upholds Ruling in Epic v. Apple » — https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple
- Cour suprême US, dossier 25-1311, requête (26 mai 2026) et mémoire au fond (14 sept. 2026) — https://www.supremecourt.gov/DocketPDF/25/25-1311/424150/20260914154510009_2026-09-14%20No.%2025-1311%20Apple-Epic%20Merits%20Opening%20Brief.pdf
- MacRumors, 29 avril 2026, levée de la suspension — https://www.macrumors.com/2026/04/29/epic-games-wins-reversal-app-store-fee-battle/
- 9to5Mac, 6 mai 2026, refus de suspension par la Cour suprême — https://9to5mac.com/2026/05/06/supreme-court-rejects-apples-stay-request-epic-games-case-to-head-back-to-district-court/
- Courthouse News, poursuite du renvoi (proffer d'Apple, août 2026) — https://www.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-district-court/
- TechCrunch, 18 août 2026, refonte des frais UE d'Apple — https://techcrunch.com/2026/08/18/apple-overhauls-its-eu-app-store-fees-loosens-rules-for-alternative-app-stores/
- heise, « Apple and EU Commission agree: New App Store rules from October 1 » (août 2026) — https://www.heise.de/en/news/Apple-and-EU-Commission-agree-New-App-Store-rules-from-October-1-11418571.html
- Daring Fireball, août 2026 — https://daringfireball.net/2026/08/apple_eu_business_terms_conceding_little
- Apple 10-K FY2026 (contentieux DMA) — https://www.sec.gov/Archives/edgar/data/0000320193/000032019326000026/aapl-20260926.htm
- Apple, communiqué Japon (18 déc. 2025) — https://www.nasdaq.com/press-release/apple-announces-changes-ios-japan-2025-12-18
- MacRumors, 17 déc. 2025, Japon — https://macrumors.com/2025/12/17/japan-app-store-feature-updates
- 9to5Mac, 10 fév. 2026, critiques japonaises — https://9to5mac.com/2026/02/10/japan-tech-groups-say-apples-new-payment-rules-are-not-a-viable-option-for-developers/
- Coalition for App Fairness, lettre à la JFTC (août 2026) — https://appfairness.org/wp-content/uploads/2026/08/CAF-Letter-to-JFTC-Aug-2026.docx.pdf
- Korea Times, 28 oct. 2026, amendes KMCC — https://www.koreatimes.co.kr/business/companies/20261028/korea-fines-google-apple-combined-476-mil-over-in-app-payment-practices
- CMA, « Programme of work across mobile platforms » — https://www.gov.uk/guidance/the-cmas-programme-of-work-across-mobile-platforms ; dossier Apple — https://www.gov.uk/cma-cases/apples-mobile-platform
- Google Play, Payments policy — https://play.google.com/about/monetization-ads/payments ; FAQ consommation de contenu (answer/10281818) — https://support.google.com/googleplay/android-developer/answer/10281818
- Google Play Console, politique US post-injonction (answer/15582165) — https://support.google.com/googleplay/android-developer/answer/15582165?hl=en
- Google Play Console, frais de service (answer/112622) — https://support.google.com/googleplay/android-developer/answer/112622?hl=en
- 9to5Google, 24 juin 2026, facturation externe au 30 juin — https://9to5google.com/2026/06/24/google-play-store-external-billing-june-30/
- Wikipedia, *Epic Games v. Google* (chronologie, à recouper) — https://en.wikipedia.org/wiki/Epic_Games_v._Google
