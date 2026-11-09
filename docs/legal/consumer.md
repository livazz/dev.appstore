# Droit de la consommation — objets numériques vendus aux joueurs

> **Note de recherche, pas un avis juridique.** État au **9 novembre 2026**, droit français et européen.
> À faire valider par un avocat avant l'ouverture des ventes.

## 1. Qui est le « professionnel » face au joueur ?

- **Phase 1** : le vendeur est le **studio** ; Wolleen est **opérateur de plateforme en ligne** (art.
  L111-7 C. conso) et **place de marché en ligne** (directive 2011/83 modifiée par la directive « Omnibus »
  2019/2161, art. 6 *bis* ; art. L221-5 C. conso). Wolleen doit notamment indiquer avant l'achat :
  - **l'identité et la qualité du vendeur** (professionnel ou non — ici toujours un professionnel) et le
    fait que le contrat est conclu avec lui ;
  - **la répartition des obligations** entre Wolleen et le studio (qui livre, qui rembourse, qui répond au
    support) ;
  - les **principaux paramètres de classement** des offres (catalogue, « à la une ») et l'existence
    d'éventuels placements payants (art. L111-7 II).
- **Phase 3 (MoR)** : Wolleen devient le vendeur et porte seul toutes les obligations ci-dessous.
- **Règlement sur les services numériques (DSA, règl. 2022/2065)** : en tant que place de marché, Wolleen
  aurait les obligations des art. 30 à 32 (traçabilité des professionnels / KYB des studios, conformité dès
  la conception de l'interface, information des acheteurs en cas de produit illicite), **sauf exemption
  micro/petite entreprise** (art. 19 et 29) tant que Wolleen reste sous les seuils. À anticiper quand même :
  Stripe Connect fournit déjà l'essentiel du KYB.

## 2. Droit de rétractation et contenu numérique

### 2.1 Principe

Contrat à distance → **14 jours** de rétractation (art. L221-18), sans motif ; remboursement sous 14 jours
(art. L221-24), par le même moyen de paiement.

### 2.2 L'exception « contenu numérique » (art. L221-28 13° ; directive 2011/83 art. 16 m)

Le droit de rétractation **ne peut pas être exercé** pour la fourniture d'un **contenu numérique non fourni
sur un support matériel** dont l'exécution a commencé, si **toutes** les conditions suivantes sont réunies
(rédaction issue de l'ordonnance n° 2021-1734 transposant la directive Omnibus) :

1. **accord préalable exprès** du consommateur pour que l'exécution commence avant la fin du délai ;
2. **reconnaissance expresse** qu'il **perd** ainsi son droit de rétractation ;
3. **confirmation** de cet accord et de cette renonciation, fournie par le professionnel **sur un support
   durable** (e-mail / reçu PDF), conformément à l'art. L221-13.

Si une condition manque : le consommateur **conserve** son droit de rétractation **et ne doit rien** pour le
contenu déjà fourni (art. L221-25 al. 3 / directive art. 14 §4 b) — il peut donc consommer les gemmes puis se
faire rembourser intégralement.

### 2.3 Mise en œuvre recommandée sur Wolleen

Avant le bouton de paiement (et non dans les CGV seulement), une case **non pré-cochée** et **obligatoire** :

> [ ] « Je demande la livraison immédiate de mon achat dans le jeu et je reconnais **perdre mon droit de
> rétractation** dès que la livraison a commencé. »

- Le bouton de commande porte une mention explicite : **« Commande avec obligation de paiement »** ou
  équivalent non ambigu (« Payer 4,99 € ») (art. L221-14).
- **E-mail de confirmation** (support durable) reprenant : article, prix TTC, vendeur, date, **mention de
  l'accord et de la renonciation**, lien vers les CGV en vigueur (PDF), modalités de support.
- Stocker la preuve : horodatage, version des CGV, état de la case, IP, identifiant de commande (charge de la
  preuve sur le professionnel, art. L221-7).

### 2.4 Le « bouton de rétractation » (directive 2023/2673, applicable depuis le 19 juin 2026)

La directive (UE) 2023/2673 impose, pour les contrats conclus via une interface en ligne, une **fonction de
rétractation** gratuite, facilement accessible et disponible pendant tout le délai (« Se rétracter du contrat
ici »), avec accusé de réception sur support durable. Transposée en France par l'**ordonnance n° 2026-2 et le
décret n° 2026-3 du 5 janvier 2026** (modification de l'art. L221-21) *(textes à relire sur Légifrance)*.

Pour Wolleen : la renonciation valable (§2.3) fait disparaître le droit pour les achats livrés. Mais la
fonction doit exister pour les cas où le droit subsiste : **livraison pas encore commencée** (jeu hors ligne,
webhook en échec, relances en cours), case non cochée, ou futurs produits (abonnements, phase 2). Prévoir
dans `/account/purchases` un bouton « Me rétracter » affiché tant que la commande est rétractable.

### 2.5 Quand l'exécution « commence »-t-elle ?

Zone grise propre à Wolleen : l'objet est « livré » lorsque le jeu le crédite (webhook 2xx ou `ack` SDK). Une
commande `paid` mais **non livrée** (statut `pending`, relances) n'a pas commencé à être exécutée →
rétractation possible jusqu'à la livraison. Recommandation : traiter la livraison effective (`delivered` /
`acknowledged`) comme point de bascule et le montrer au joueur.

## 3. Conformité du contenu numérique (art. L224-25-1 et s. ; directive 2019/770)

Indépendamment de la rétractation, le joueur bénéficie d'une **garantie légale de conformité** :

- obligation de **fournir** le contenu sans retard injustifié (L224-25-10) : si l'objet n'est **jamais
  crédité**, le joueur peut mettre le professionnel en demeure puis **résoudre le contrat** et être remboursé ;
- contenu conforme à la description (quantité de gemmes, caractéristiques du skin) ;
- pour une fourniture unique, les défauts apparus dans les 12 mois sont présumés exister lors de la
  fourniture (à vérifier précisément L224-25-13/14) ; durée de la garantie de 2 ans pour la fourniture
  ponctuelle (L224-25-12).
- **Fermeture du jeu / bannissement** : la jurisprudence et les autorités considèrent qu'un contenu acheté
  puis retiré peut caractériser un défaut de conformité ou une clause abusive (suppression sans
  contrepartie). Les conditions studio doivent prévoir un **préavis de fermeture** et une politique de
  remboursement des monnaies non utilisées achetées récemment.

## 4. Monnaies virtuelles : lignes directrices CPC (21 mars 2025) et Digital Fairness Act

Le réseau européen des autorités de protection des consommateurs (CPC) a publié des **principes clés non
contraignants** sur les monnaies virtuelles en jeu :

- afficher le **prix en euros** de la monnaie **et** des objets achetés avec elle ;
- informations précontractuelles claires dès l'offre ;
- pas de conversions multiples ni d'empilement de monnaies destinés à masquer le coût ;
- pas de conception exploitant les vulnérabilités, **notamment des enfants** (urgence artificielle, offres à
  durée limitée trompeuses) ;
- conditions rédigées simplement.

Une enquête CPC viserait plusieurs grands éditeurs. La **proposition de *Digital Fairness Act*** de la
Commission (inscrite à l'ordre du jour indicatif du 11 novembre 2026) pourrait rendre obligatoire
l'affichage du prix réel, encadrer les loot boxes et la conception addictive : **à suivre**.

Pour Wolleen : la boutique web affiche déjà des prix en euros — c'est un **avantage de conformité** par
rapport aux boutiques in-app. Afficher aussi l'**équivalence « prix pour 100 gemmes »** et les
**probabilités** de tout objet aléatoire. Ne jamais afficher de compte à rebours ou de « prix barré » non
justifié (art. L112-1-1 sur les annonces de réduction : prix de référence = prix le plus bas des 30 derniers
jours).

**Phase 3 (fidélité multi-jeux)** : une monnaie Wolleen utilisable dans plusieurs jeux de studios différents
pourrait sortir du « réseau limité » et relever de la **monnaie électronique** / des services de paiement
(exclusion de réseau limité de la DSP2, art. 3 k, avec notification à l'ACPR au-delà de 1 M€). À analyser
avant tout lancement.

## 5. Mineurs

- **Capacité** : un mineur peut accomplir seul les « actes courants autorisés par la loi ou l'usage »
  (C. civ. art. 1148), mais l'acte est **annulable pour simple lésion** (art. 1149). Un achat de quelques
  euros par un adolescent est probablement un acte courant ; des achats répétés ou élevés ne le sont pas, et
  les parents peuvent en demander l'annulation.
- **Pratiques interdites** : inciter directement les enfants à acheter ou à persuader leurs parents est une
  **pratique commerciale agressive réputée déloyale en toutes circonstances** (directive 2005/29, annexe I
  point 28 ; art. L121-7). Les formulations « Achète maintenant ! » ciblant des enfants sont à proscrire.
- **Données** : consentement au traitement fondé sur le consentement possible seul à partir de **15 ans**
  en France (loi Informatique et Libertés, art. 45) — voir `rgpd.md`.
- **États-Unis** : COPPA (moins de 13 ans), règle amendée en 2025 (mise en conformité exigée en avril 2026) ;
  l'affaire **FTC v. Epic Games** (2022, 245 M$ de remboursements pour achats non autorisés et *dark patterns*)
  est la référence de ce qu'il ne faut pas faire.
- **Recommandations** :
  - compte Wolleen réservé aux **majeurs** ou aux mineurs **avec autorisation parentale** (déclaration dans
    les CGV + case à l'inscription) ; âge minimal de 13 ans ;
  - **plafonds de dépenses** par défaut (par jour / mois) pour les comptes déclarés mineurs ;
  - **3-D Secure systématique** (SCA, DSP2) : limite les achats sur la carte d'un parent à son insu et
    transfère la responsabilité en cas de fraude ;
  - procédure de **remboursement « achat non autorisé par un mineur »** documentée (au cas par cas, révocation
    de l'objet dans le jeu).

## 6. Remboursements

- **Cas obligatoires** : rétractation valable (renonciation non conforme ou livraison non commencée) ;
  défaut de conformité (objet non crédité, différent) ; annulation pour minorité ; erreur de liaison imputable
  au système.
- **Liaison déclarative (`id_confirm`, verified = 0)** : si le joueur saisit l'ID d'un autre joueur et
  confirme « Est-ce bien vous : <nom> ? », la livraison est conforme à sa demande. Les CGV doivent mettre la
  vérification à sa charge, tout en prévoyant un geste (remboursement ou transfert) quand le studio peut
  annuler le crédit sur le mauvais compte.
- **Commercial** : politique de remboursement plus généreuse possible (ex. objet non utilisé sous 48 h) —
  à arbitrer avec les studios, qui supportent le coût en phase 1.
- **Technique** : tout remboursement doit pouvoir **révoquer l'objet dans le jeu** — prévoir un événement
  `purchase.refunded` / `purchase.revoked` dans l'API de livraison (suite recommandée).

## 7. Rétrofacturations (chargebacks) sur biens virtuels

- Risque élevé : « friendly fraud » (le titulaire conteste un achat effectivement reçu), cartes volées,
  enfants utilisant la carte parentale.
- Le **marchand côté carte** supporte le litige (montant + **frais de litige Stripe**, de l'ordre de 15–20 €
  en Europe, *à vérifier*). En *destination charges*, c'est la plateforme (Wolleen) qui est débitée en
  premier ; en *direct charges*, le studio. Les conditions studio doivent organiser la **refacturation** au
  studio.
- **Programmes des réseaux** : Visa (VAMP, programme unifié depuis 2025) et Mastercard (ECM/EFM) placent sous
  surveillance les marchands au-delà d'un ratio de litiges/fraude de l'ordre de 1–2 % *(seuils exacts à
  vérifier)* — un studio ou Wolleen en dépassement risque amendes et coupure.
- **Preuves gagnantes** pour un bien numérique :
  - journal de livraison horodaté (création de la commande, webhook 2xx, `ack` SDK, `player_id`) — l'existant
    (`delivery_id`, statuts `delivered`/`acknowledged`) est précieux : le conserver ;
  - preuve d'acceptation des CGV et de la renonciation ;
  - historique d'achats non contestés antérieurs sur la même carte / même compte ; IP et appareil (Visa
    *Compelling Evidence 3.0* pour les litiges « fraude » 10.4) ;
  - authentification 3-D Secure réussie (transfert de responsabilité en cas de fraude).
- **Mesures** : Stripe Radar ; 3-D Secure ; descripteur bancaire clair (« WOLLEEN* NOM DU JEU ») pour éviter
  les contestations par non-reconnaissance ; e-mail de reçu immédiat ; possibilité de **suspendre** le compte
  Wolleen et de **révoquer** l'objet après un chargeback perdu (prévu au contrat, proportionné).

## 8. Autres obligations transverses

- **Médiation de la consommation** obligatoire et gratuite pour le consommateur (art. L612-1) : adhérer à un
  médiateur référencé (CECMC) et le mentionner dans les CGV et sur le site.
- **Plateforme européenne ODR** : supprimée depuis le **20 juillet 2025** (règlement (UE) 2024/3228) — retirer
  tout lien vers elle.
- **Mentions légales** (LCEN art. 6 III / 1-1) et **informations précontractuelles** (art. L111-1, L221-5).
- **Accessibilité** : l'acte européen sur l'accessibilité s'applique aux services de commerce électronique
  depuis le 28 juin 2025 (exemption des microentreprises) — à prévoir dans le design.
- **Abonnements (phase 2)** : « résiliation en trois clics » (art. L215-1-1), information annuelle de
  reconduction.

## Sources (consultées le 9 novembre 2026)

- Code de la consommation, art. L111-7, L221-5, L221-13, L221-14, L221-18, L221-21, L221-24, L221-25, L221-28, L224-25-1 et s., L612-1 — https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006069565
- Directive 2011/83/UE consolidée (art. 6 *bis*, 14, 16) — https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:02011L0083-20220528
- Directive (UE) 2019/770 (contenus numériques) ; directive (UE) 2019/2161 (Omnibus)
- Directive (UE) 2023/2673 (fonction de rétractation) ; HLC, transposition française — https://hlc.com/fr/publications/transposition-under-french-law-of-the-eu-mandatory-withdrawal-button-for-online-sales ; iubenda — https://www.iubenda.com/fr/blog/la-nouvelle-fonction-de-retractation-en-ligne-ce-que-signifie-la-directive-ue-2023-2673-pour-votre-entreprise/
- Réseau CPC, *Key principles on in-game virtual currencies* (21 mars 2025), analyses Reed Smith — https://www.reedsmith.com/en/perspectives/2025/03/qas-on-the-eu-consumer-protection-authorities-joint-guidance-paper ; Baker McKenzie — https://connectontech.bakermckenzie.com/european-consumer-protection-network-issues-new-key-principles-on-in-game-virtual-currencies-impact-for-gaming-and-gambling-entities-in-belgium-the-eu-and-beyond/
- Digital Fairness Act : Freshfields — https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/the-eus-proposed-digital-fairness-act-a-game-developers-guide-to-potential-imp-102ltio ; EPRS 2026 — https://eprs.europarl.europa.eu/EPRS_BRI(2026)791529 ; Tech Times, 9 nov. 2026 — https://www.techtimes.com/articles/330286/20261109/eu-dark-patterns-law-listed-wednesday-digital-fairness-act-targets-firms-platform-rules-miss.htm
- Code civil, art. 1146 à 1149 — Légifrance
- Règlement (UE) 2024/3228 (abrogation de la plateforme RLL/ODR)
- FTC, *In re Epic Games* (déc. 2022) — https://www.ftc.gov/legal-library/browse/cases-proceedings/epic-games-inc
- Règlement (UE) 2022/2065 (DSA), art. 19, 29 à 32
