# Dev AppStore — passation (session cloud → local, 9 novembre 2026)

À lire en premier par le prochain Claude (ou développeur), puis `ARCHITECTURE.md` (architecture, routes, API, flux).

## Le produit

Place de marché web d'achats in-app : le joueur va sur le site, **cherche son jeu, lie son compte de jeu, achète** ;
le jeu reçoit l'achat **tout seul** (webhook signé `DevAppStore-Signature` vers le serveur du studio, ou SDK
sans serveur par polling/SSE). Les studios économisent la commission des stores (30 %) : commission plateforme 5 %.
UI inspirée d'App Store Connect et des maquettes PDF du fondateur. Tout est en **français** (UI, commits, commentaires).
Ancien nom technique : « Wolleen » (entièrement renommé).

## Démarrer en local

Prérequis : Node ≥ 20. Aucune base à installer : PGlite (Postgres embarqué) dans `.data/pglite`.

```bash
npm install
cp .env.example .env.local   # facultatif en dev : tout fonctionne vide (paiement simulé /checkout/mock)
npm run db:push && npm run db:seed
npm run dev                  # http://localhost:3000
npm run demo                 # jeu de démo http://localhost:4100 (reçoit les achats de Crystal Clash)
```

Comptes de démo (mot de passe `demo1234`) :
- `joueur@devappstore.test` — joueur (déjà lié à Crystal Clash, ID `#2PP8QL9`)
- `dev@devappstore.test` — studio Nova Games **et** superadmin (back-office `/admin`)

Clés de démo : secrète `das_secret_demo_crystal_clash`, publique `das_pub_demo_crystal_clash`,
secret webhook `whsec_demo_crystal_clash` (voir `packages/db/src/seed.ts`).

Vérifications (toutes vertes au moment de la passation) :

```bash
npm run typecheck
npm test                       # 784 tests vitest
npm run build                  # build Next.js
cd e2e && npx playwright test --trace off   # 24 tests e2e (lance web + jeu de démo)
```

En cas de base corrompue (« RuntimeError: Aborted() » PGlite, processus coupé) : `rm -rf .data && npm run db:push && npm run db:seed`.

## Ce qui est fait (vagues 1 à 5)

- Catalogue joueur, recherche, page jeu (6 mises en page de boutique), liaison de compte (code affiché dans le jeu,
  identifiant + confirmation par le serveur du studio), paiement Stripe Checkout + Connect (simulation sans clés),
  livraison automatique (webhook signé + relances, SSE, polling, accusés de réception), remboursements.
- Espace studio : jeux, éditeur d'articles + IA de style, import App Store Connect / Google Play, ventes et analytics,
  intégration (clés, journal des livraisons, événement de test), paiements Stripe Connect.
- Back-office `/admin` (jeux, studios, commandes, utilisateurs, journal d'audit, suspension motivée P2B).
- Fidélité « Points Dev AppStore », e-mails (reçu, livraison, échec, bienvenue, rapport hebdo, accusé de rétractation).
- Conformité : case de renonciation (L221-28 13°) avec preuve stockée, bouton « Me rétracter », pages `/legal/*`
  (brouillons, bandeau « Projet », non indexées), documentation développeur `/docs`.
- Sécurité : isolement des studios, clés secrète/publique + jetons joueur, garde SSRF, limiteurs de débit (API + auth),
  plafond SSE, en-têtes de sécurité, configuration validée au démarrage (`apps/web/src/env.ts`).
- SDK : JS (`packages/sdk-js`), Unity, Godot, Unreal (`sdks/`, non compilés faute de moteur), jeu de démo.
- Migration Drizzle initiale : `packages/db/drizzle/0000_initial.sql`. Dépendances à jour (audit sans haute/critique).

## Ce qui reste à faire

1. **Vague 6 : faite et fusionnée (10 novembre 2026)** — temps réel multi-instance (LISTEN/NOTIFY, `RATE_LIMIT_STORE=postgres`,
   migration 0002), base (index, migration 0001, `db:push` idempotent via `uniqueIndex`, base ouverte paresseusement :
   plus d'`Aborted()` au build, `npm run db:migrate`, `packages/db/README.md`), CSP à nonce + SEO (sitemap, robots, OG,
   icônes, manifest), spec OpenAPI 3.1 sur `/api/openapi.json` + test de contrat, SDK JS 0.1.0 publiable (dist ESM/CJS),
   revue visuelle (pied du panneau d'article refait). 858 tests vitest, 24 e2e.
   Restes signalés : contraste du pied de page joueur (`text-ink-3`, 3,26:1) et des couleurs choisies par les studios
   (imposer un contraste minimal dans `style-safety.ts` ?), modale « Nouvel article » trop haute à 800 px,
   `/docs/api` cite encore `das_live_` et ignore la clé publique, ARCHITECTURE.md à compléter (`/api/openapi.json`,
   multi-instance), plafond SSE et limiteur des formulaires de connexion encore par instance, concurrence du limiteur
   Postgres testée seulement sous PGlite.
2. **Revue de sécurité complète : faite et corrigée (10 novembre 2026)** — 4 rapports dans `docs/security/revue-2026-11/`
   (auth/autorisation, API/liaison/livraison, paiement, contenu/en-têtes) : 49 constats, aucun critique, 5 hauts, tous
   corrigés avec tests, ainsi que les moyens et la plupart des bas (statut constat par constat dans chaque rapport).
   Migration 0003. 963 tests vitest, 24 e2e.
   Restes : A-03 et A-04 (décisions ci-dessous), quotas d'upload par studio et purge des fichiers orphelins
   (table `uploads` à créer), plafonds SSE et limiteurs mémoire par instance, pas d'e-mail aux propriétaires lors des
   changements d'intégration, `createGame` écrit le secret webhook en clair jusqu'au premier envoi, rétractation
   pendant une récupération par SDK (`delivery.ts`, filet : `purchase.refunded`), `npm audit` : 4 modérées (drizzle-kit,
   dev seulement).
3. Dépôt GitHub privé : https://github.com/livazz/dev.appstore (Node et gh installés dans `~/.local/bin`).

## Décisions en attente (fondateur)

- **Revue avant publication (A-03)** : aujourd'hui un studio publie directement ; le statut `review` et l'approbation
  admin existent mais ne sont pas utilisés. Imposer une validation admin ?
- **Comptes (A-04)** : ni vérification d'e-mail, ni réinitialisation de mot de passe, ni 2FA. À ajouter maintenant ?
- **Avant la production (revue de sécurité)** : `RESEND_API_KEY` obligatoire (sinon refus de démarrer) ; changer
  `AUTH_SECRET` rend illisibles les secrets webhook chiffrés (chaque studio doit régénérer le sien) ; nouveau format de
  signature du « player lookup » (`devappstore-lookup-v1:<player_id>`) à annoncer aux studios ; `TRUSTED_PROXY_HOPS`
  selon l'hébergement (1 par défaut, Vercel) ; `NEXT_PUBLIC_S3_PUBLIC_URL` au build sinon la CSP bloque les images S3.

- **Modèle de TVA** : Dev AppStore collecte la TVA via Stripe Tax (risque « fournisseur réputé », voir `docs/legal/`)
  **ou** charges directes sur le compte Stripe du studio. Le code gère les deux (`CHARGE_MODEL=destination|direct`,
  `STRIPE_AUTOMATIC_TAX`). Ne pas changer sans décision.
- **Clés Stripe de test** à fournir (jamais dans un chat ni dans git : `.env.local`).
- **Commission de comparaison** du tableau des ventes : 15 % par défaut (`DEFAULT_SALES_STORE_FEE_BPS` dans
  `apps/web/src/server/analytics.ts`), 30 % disponible — à confirmer.
- **Domaine** : `devappstore.com` utilisé comme exemple partout — à remplacer par le vrai.
- **Textes légaux** : à faire valider par un avocat, compléter les `[à compléter : …]`, puis `LEGAL_STATUS = 'published'`
  dans `apps/web/src/lib/legal-versions.ts`.
- Vague 6 : toutes les pages sont rendues à la demande (nonce CSP) ; `style-src` garde `'unsafe-inline'` ;
  repli en mémoire du limiteur si Postgres est injoignable ; SDK : choisir une licence et vérifier le scope npm
  `@devappstore` ; le bouton « Annuler » violet de la modale studio est conservé (maquette).
- Rétractation d'une livraison en échec : autorisée (consumer.md § 2.4) — à confirmer juridiquement.

## Points connus / pièges

- Machine de la session cloud : 4 CPU, disque limité. Les worktrees d'agents (~1 Go chacun) ont saturé le disque :
  supprimer les worktrees fusionnés (`git worktree remove`).
- Tests e2e : lancer depuis `e2e/` avec `npx playwright test --trace off` (`npm run test:e2e -- …` perd les options).
  `E2E_WEB_PORT=…` si le port 3000 est pris, `E2E_DEMO_GAME=0` pour se passer du jeu de démo.
- Nouvelles clés uniques multi-colonnes : utiliser `uniqueIndex` (sinon `db:push` redemande une confirmation).
- `@devappstore/core` a une entrée navigateur (`@devappstore/core/client`) : les composants client doivent l'utiliser
  (`crypto.ts` est serveur uniquement).
- Montants toujours en centimes.
