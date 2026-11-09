# RGPD — données traitées par Wolleen

> **Note de travail, pas un avis juridique.** État au **9 novembre 2026**. Base pour le **registre des
> traitements** (art. 30 RGPD) et la **politique de confidentialité**, à faire valider (DPO externe ou
> avocat). Les éléments `[…]` dépendent de choix d'infrastructure non encore arrêtés.

## 1. Rôles

| Acteur | Rôle | Commentaire |
|---|---|---|
| **Wolleen** | Responsable de traitement | Comptes joueurs et studios, commandes, liaison, livraison, sécurité, support |
| **Studios** | Responsables de traitement **indépendants** | Reçoivent `player_id`, nom de joueur, commande pour créditer l'Objet ; gèrent le compte de jeu |
| **Stripe** | Sous-traitant pour le traitement des paiements **et** responsable indépendant pour certaines finalités (lutte contre la fraude/Radar, obligations LCB-FT, KYC des comptes Connect) | Voir l'accord de traitement de Stripe (DPA) et sa politique de confidentialité |
| **Hébergeur** [à choisir] | Sous-traitant | Application et base Postgres |
| Phase 2 : fournisseur e-mail, Sentry | Sous-traitants | Contrat art. 28 + vérification transferts |

> Le choix de responsables **indépendants** pour Wolleen et les studios suppose que chacun définit ses
> propres finalités. Si Wolleen et un studio déterminent ensemble finalités et moyens (ex. lookup de joueur
> conçu conjointement), une **responsabilité conjointe** (art. 26) devrait être organisée : à trancher avec
> le conseil, et à refléter dans les conditions studio (art. 11).

## 2. Traitements, données, bases légales

| # | Finalité | Personnes | Données | Base légale (art. 6) |
|---|---|---|---|---|
| T1 | Création et gestion du compte joueur, authentification (Better Auth) | Joueurs | E-mail, nom/pseudo, mot de passe haché, date de naissance ou tranche d'âge, cookie de session | **Contrat** (6.1.b) |
| T2 | Liaison du compte de jeu | Joueurs | `player_id`, nom de joueur renvoyé par le studio, méthode (code/ID), statut vérifié/déclaratif, date | **Contrat** |
| T3 | Commande et paiement | Joueurs | Objet, prix, devise, statut, identifiants Stripe (`pi_…`, `cs_…`), 4 derniers chiffres/marque/pays de carte fournis par Stripe ; **jamais le numéro complet** | **Contrat** |
| T4 | Livraison automatique | Joueurs | `player_id`, `order_id`, `delivery_id`, journal des tentatives et accusés de réception | **Contrat** |
| T5 | Facturation, comptabilité, TVA (preuves de localisation) | Joueurs, studios | Pays, adresse de facturation, IP au moment de la commande, montants, taxes | **Obligation légale** (6.1.c) — CGI, Code de commerce, règl. 282/2011 |
| T6 | Lutte contre la fraude et les rétrofacturations | Joueurs | IP, appareil/navigateur, historique d'achats, résultats 3-D Secure, signaux Radar | **Intérêt légitime** (6.1.f) — prévenir la fraude (considérant 47) |
| T7 | Support et réclamations, rétractation | Joueurs, studios | Échanges, pièces jointes, historique de commande | **Contrat** / **obligation légale** |
| T8 | Sécurité, journaux techniques | Tous | Logs de connexion, IP, horodatages, erreurs | **Intérêt légitime** ; **obligation légale** (conservation des données d'identification et de connexion, LCEN art. 6 et décret 2021-1362) |
| T9 | Comptes studio, membres, onboarding Connect | Membres de studio | Nom, e-mail pro, rôle ; KYC réalisé et conservé **par Stripe** | **Contrat** ; KYC : obligation légale de Stripe |
| T10 | Statistiques de ventes pour les studios | Joueurs (agrégé) | Ventes agrégées par Objet/pays/jour, sans identification | **Intérêt légitime** ; agrégation/pseudonymisation |
| T11 | Mesure d'audience, cookies non essentiels | Visiteurs | Identifiants de traceurs | **Consentement** (art. 82 loi IL, lignes directrices CNIL) — ou outil exempté |
| T12 | E-mails marketing (phase 2) | Joueurs | E-mail, préférences | **Consentement** (L34-5 CPCE) ou exception « produits analogues » d'un client existant |
| T13 | Plafonds et contrôle parental | Joueurs mineurs, représentants légaux | Âge déclaré, plafonds, e-mail du représentant | **Contrat** / **obligation légale** (protection des mineurs) |

**Données sensibles** : aucune (art. 9). Pas de profilage produisant des effets juridiques (art. 22) : les
blocages anti-fraude doivent pouvoir faire l'objet d'une **revue humaine** sur demande.

## 3. Mineurs

- En France, un mineur peut consentir seul à un traitement fondé sur le consentement **à partir de 15 ans**
  (loi Informatique et Libertés, art. 45) ; en dessous, consentement conjoint du titulaire de l'autorité
  parentale. Les traitements fondés sur le **contrat** ne relèvent pas de cette règle, mais la capacité de
  contracter du mineur est limitée (voir `consumer.md` §5).
- Pas de traceurs publicitaires ni de profilage marketing pour les comptes de mineurs ; informations
  rédigées dans un langage adapté (art. 12).

## 4. Destinataires et sous-traitants

| Destinataire | Données | Localisation / transfert | Garanties |
|---|---|---|---|
| Stripe (Stripe Payments Europe Ltd, Irlande, et entités du groupe) | T3, T6, T9 | UE + **États-Unis** | DPA Stripe ; certification **EU-US Data Privacy Framework** et clauses contractuelles types |
| Hébergeur [ex. hébergeur UE : Scaleway / OVHcloud / Clever Cloud, ou Vercel + Neon] | Toutes | [UE recommandé] | Contrat art. 28 ; si prestataire américain : DPF ou CCT + analyse d'impact des transferts |
| Studios (responsables indépendants) | T2, T4 (`player_id`, nom de joueur, commande) | Variable, possiblement **hors UE** | Information des joueurs ; si studio hors UE sans adéquation : CCT module 1 (responsable à responsable) dans les conditions studio |
| Autorités (fiscales, judiciaires) | Sur réquisition | — | Obligation légale |
| Phase 2 : e-mail transactionnel, Sentry | E-mail, données techniques | À choisir | Contrat art. 28 ; minimisation (pas de données de paiement dans Sentry) |

**Transferts vers les États-Unis** : le cadre **EU-US Data Privacy Framework** (décision d'adéquation du
10 juillet 2023) a été validé par le Tribunal de l'UE le **3 septembre 2025** (*Latombe*, T-553/23) ; un
**pourvoi est pendant devant la CJUE (C-703/25 P)** — aucune décision confirmée à date de nos recherches.
Prévoir un **plan B** (CCT 2021/914 déjà incluses dans le DPA de Stripe) et privilégier un hébergement UE.

## 5. Durées de conservation

| Données | Durée active | Archivage intermédiaire | Fondement / référence |
|---|---|---|---|
| Compte joueur | Durée de vie du compte | Suppression ou anonymisation **3 ans après la dernière activité** (après e-mail d'avertissement) | Recommandation CNIL (comptes inactifs) |
| Liaisons de compte de jeu | Tant que la liaison est active | Supprimées à la déliaison / suppression du compte, sauf référence nécessaire à une commande | Minimisation |
| Commandes et factures / pièces comptables | 3 ans (support client, garantie) | **10 ans** | Code de commerce art. L123-22 ; CGI / LPF art. L102 B (6 ans) |
| Preuves de localisation TVA (OSS) | — | **10 ans** | Règl. 282/2011 art. 63 *quater* |
| Preuves de rétractation / renonciation, acceptation des CGV | Durée de la relation | 5 ans (prescription civile, C. civ. art. 2224) | Preuve de conformité |
| Journal de livraison (webhooks, ack) | 13 mois (litiges bancaires) | Agrégé/anonymisé ensuite, ou conservé avec la commande | Délai des rétrofacturations (jusqu'à ~13 mois selon les réseaux) |
| Données anti-fraude | 13 mois max. pour les données de transaction ; liste d'alerte : durée justifiée et proportionnée | — | CNIL (fraude au paiement à distance) |
| Données de carte | **Non conservées par Wolleen** (Stripe) | — | PCI DSS ; délibération CNIL 2018-303 |
| Journaux de connexion / sécurité | **1 an** | — | LCEN art. 6, décret 2021-1362 *(périmètre à vérifier pour Wolleen)* ; recommandation CNIL journalisation (6 mois à 1 an) |
| Comptes studio, membres | Durée du contrat | 5 ans après la fin (prescription) | C. civ. art. 2224 |
| Support | 3 ans après la clôture du ticket | — | Intérêt légitime |
| Cookies de mesure | 13 mois max. (traceur), 25 mois (données) | — | Lignes directrices CNIL |

## 6. Droits des personnes

Accès, rectification, effacement (sous réserve des conservations légales ci-dessus), limitation, opposition
(T6, T8, T10), portabilité (T1–T4), retrait du consentement (T11, T12), directives post-mortem (loi IL
art. 85). Délai de réponse : 1 mois. Point de contact : [privacy@…]. Réclamation possible auprès de la
**CNIL**.

Implémentation recommandée : export JSON depuis « Mon compte » ; suppression de compte en libre-service (avec
conservation des pièces comptables en base d'archive séparée) ; transmission au studio d'une demande
d'effacement relative au compte de jeu lié.

## 7. Sécurité (art. 32) — points déjà présents ou à prévoir

- Mots de passe hachés (Better Auth), cookies `HttpOnly`/`Secure`/`SameSite`.
- Clés API studio stockées **hachées** ; webhooks signés **HMAC** avec horodatage (anti-rejeu).
- Aucune donnée de carte chez Wolleen (Stripe Checkout hébergé : périmètre PCI DSS SAQ A).
- Chiffrement TLS ; chiffrement au repos chez l'hébergeur ; sauvegardes chiffrées.
- Principe du moindre privilège pour les membres de studio (`requireGameAccess(gameId, roles)`).
- Payloads de webhook **minimisés** (pas d'e-mail du joueur).
- Procédure de **violation de données** : notification CNIL sous **72 h** (art. 33), information des
  personnes si risque élevé (art. 34), information des studios concernés.

## 8. Formalités

- **Registre des traitements** (art. 30) : obligatoire (traitements non occasionnels) — ce document en est la
  base.
- **DPO** : non obligatoire a priori (pas de suivi régulier et systématique à grande échelle comme activité
  de base) ; à réévaluer avec la croissance et en phase 3 (recommandations, fidélité multi-jeux).
- **AIPD** (art. 35) : à envisager pour l'anti-fraude automatisée et, en phase 3, pour les recommandations
  personnalisées (liste CNIL des traitements requérant une AIPD : profilage, données de mineurs à grande
  échelle).
- **Bannière cookies** : inutile si seuls des cookies strictement nécessaires (session, panier, sécurité,
  préférence de thème) et une mesure d'audience exemptée sont utilisés.
- **Politique de confidentialité** : à rédiger à partir des sections 1 à 6.

## Sources (consultées le 9 novembre 2026)

- Règlement (UE) 2016/679 (RGPD), art. 6, 8, 12–22, 26, 28, 30, 32–35, 44–49
- Loi n° 78-17 Informatique et Libertés, art. 45 (âge de 15 ans), art. 82 (traceurs), art. 85
- CNIL, lignes directrices et recommandation « cookies et autres traceurs » (2020) — https://www.cnil.fr/fr/cookies-et-autres-traceurs
- CNIL, délibération n° 2018-303 (cartes de paiement) — https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000037594451
- CNIL, recommandation sur la journalisation (2021) — https://www.cnil.fr/fr/la-cnil-publie-une-recommandation-relative-aux-mesures-de-journalisation
- Décret n° 2021-1362 du 20 octobre 2021 (conservation des données d'identification et de connexion)
- Code de commerce art. L123-22 ; LPF art. L102 B ; règlement d'exécution 282/2011 art. 63 *quater*
- Décision d'adéquation (UE) 2023/1795 (DPF) ; Tribunal de l'UE, 3 sept. 2025, *Latombe c. Commission*, T-553/23 ; pourvoi C-703/25 P (WilmerHale, 1ᵉʳ déc. 2025) — https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework
- Stripe, Data Processing Agreement et Privacy Policy — https://stripe.com/legal/dpa ; https://stripe.com/privacy
