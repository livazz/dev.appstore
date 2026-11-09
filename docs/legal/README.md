# Dossier juridique Wolleen (notes de recherche)

> Notes de recherche datées du **9 novembre 2026**, rédigées pour cadrer le produit. **Ce ne sont pas des
> avis juridiques ou fiscaux** ; les projets de conditions doivent être validés par un avocat avant toute
> publication.

| Fichier | Contenu |
|---|---|
| [stores.md](stores.md) | Règles Apple / Google pour les achats web utilisés dans un jeu mobile, par région (US, UE, UK, Japon, Corée) |
| [tax.md](tax.md) | TVA / OSS, Royaume-Uni, sales tax US ; « studio vendeur » vs « Wolleen marchand de référence » ; Stripe Tax |
| [consumer.md](consumer.md) | Rétractation et contenu numérique, bouton de rétractation 2026, mineurs, remboursements, rétrofacturations |
| [cgv-draft.md](cgv-draft.md) | **Projet** de conditions joueurs (CGV/CGU) |
| [cgu-draft.md](cgu-draft.md) | **Projet** de conditions studio (contrat de distribution, règlement P2B) |
| [rgpd.md](rgpd.md) | Registre des traitements : données, bases légales, sous-traitants, durées |

## Décisions à prendre en priorité

1. **Qui est redevable de la TVA dès la phase 1 ?** Présomption de « fournisseur réputé » (règl. 282/2011
   art. 9 bis, CJUE *Fenix* C-695/20) : voir `tax.md` §2.3. Cela compte aussi pour le choix entre
   *destination charges* et *direct charges* dans Stripe Connect.
2. **Pays de vente ouverts en phase 1** (UE seule ? UK ? US ?) : conditionne fiscalité et règles stores.
3. **Interface dans le jeu** (écran de code de liaison, notifications) : libellés neutres hors US
   (`stores.md` §5).
4. **Politique mineurs** (âge minimal, plafonds, 3-D Secure) et **médiateur de la consommation**.

## Méthode et limites des sources

Recherches web du 9 novembre 2026. Une partie des sources secondaires (presse spécialisée, blogs de
prestataires de paiement) a été consultée via des extraits de moteur de recherche, sans lecture intégrale
(certains sites n'étaient pas accessibles depuis l'environnement) ; les montants de commission marqués
*(à confirmer)* divergent d'une source à l'autre. Le texte des App Review Guidelines d'Apple a été lu
directement. Les textes de loi cités doivent être relus dans leur version en vigueur sur Légifrance /
EUR-Lex.
