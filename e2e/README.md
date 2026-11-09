# Tests de bout en bout (`@devappstore/e2e`)

Harnais Playwright de la vague 2 : il démarre Dev AppStore (et le jeu de démo s'il existe) sur une **base PGlite isolée**,
puis rejoue les parcours clés dans Chromium.

## Lancer

```bash
npm install --prefer-offline --no-audit --no-fund
npm run test:e2e                          # depuis la racine (ou : npm run test:e2e -w @devappstore/e2e)
npm run test:e2e -- tests/securite.spec.ts   # un seul fichier
npm run test:e2e -- --trace on            # avec traces (désactivées par défaut) → npx playwright show-trace …
npm run test:e2e -- --headed              # navigateur visible
npm test -w @devappstore/e2e                  # tests unitaires du harnais (vitest, sans navigateur)
```

N'exécutez pas `playwright install` : `@playwright/test` est épinglé sur la version du Playwright préinstallé
(1.63.0, navigateurs dans `/opt/pw-browsers`). Si la révision de Chromium ne correspond pas, pointez le binaire :
`E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`.

## Ce que fait un lancement

1. **webServer** : `npm run dev` (Dev AppStore, port 3000) avec `DEVAPPSTORE_DATA_DIR=e2e/.data`, `STRIPE_SECRET_KEY` vide
   (paiement simulé `/checkout/mock`) et des secrets de test ; `npm run demo` (jeu de démo, port 4100) **si**
   `apps/demo-game` ou le script racine `demo` existe.
2. **globalSetup** (`global-setup.ts`) : supprime `e2e/.data`, puis `npm run db:push` et `npm run db:seed` sur cette base.
   Votre `.data/` de développement n'est jamais touché.
3. Specs (`tests/`), **en série** (1 worker) car elles partagent la base et les comptes de démo.

| Spec | Parcours |
|---|---|
| `sante.spec.ts` | Le serveur répond et la base de test est seedée (toujours active). |
| `parcours-joueur.spec.ts` | joueur@devappstore.test → recherche « Crystal » → Crystal Clash → Acheter « Sac de gemmes » → liaison par code (code via `POST /api/v1/link-codes`, clé `DEMO_KEYS.crystal`) → paiement simulé → le jeu reçoit l'achat sans rechargement → `/account/purchases` affiche « Livré ». |
| `liaison-id.spec.ts` | Méthode `id_confirm` avec le joueur `#2PP8QL9` → écran « Est-ce bien vous : Ali ? » → confirmation (non vérifié). Compte dev@devappstore.test, pour laisser joueur@ non lié à Crystal. |
| `studio.spec.ts` | dev@devappstore.test → Mes jeux → éditeur Crystal Clash → ajout d'un article → visible sur `/games/crystal-clash`. |
| `securite.spec.ts` | Studio refusé à un joueur et à un cookie forgé ; API v1 → 401 sans clé / clé inconnue / non-Bearer / clé en query string ; code de liaison réutilisé → refusé (sur Pixel Farm). |

Livraison dans `parcours-joueur` : avec le jeu de démo, la page du jeu (ouverte avant l'achat, jamais rechargée)
doit afficher « Webhook reçu : Sac de gemmes » et son inventaire (`GET :4100/api/state`) gagner 1 200 gemmes. Sans
jeu de démo, le test joue le rôle du SDK : `GET /api/v1/deliveries` puis `POST /api/v1/deliveries/{id}/ack`.

## Modules pas encore fusionnés → `test.fixme`

Chaque spec déclare les routes dont elle dépend :

```ts
exigeRoutes('/login', '/games/[slug]/link', 'POST /api/v1/link-codes');
exigeJeuDemo();
```

`support/routes.ts` inspecte `apps/web/src/app` (groupes `(player)` ignorés, méthodes exportées par les `route.ts`) :
tant qu'une route manque, la spec est marquée **fixme** (« skipped ») avec la liste des routes absentes. Dès la fusion
du module, elle s'active sans modification.

## Page objects (`pages/`)

Sélecteurs par **rôles et libellés accessibles** (`getByRole`, `getByLabel`), jamais par classes CSS. Si un module
change un libellé, corrigez-le à un seul endroit :

| Page object | Route | Repères accessibles attendus |
|---|---|---|
| `Connexion` | `/login` | champs « Adresse e-mail », « Mot de passe », bouton « Se connecter » |
| `Catalogue` | `/`, `/search` | formulaire `role="search"`, champ « Rechercher… », liens vers les jeux |
| `PageJeu` | `/games/[slug]` | carte d'article = bouton nommé par le titre ; détail `role="dialog"` nommé par le titre ; bouton « Acheter » |
| `Liaison` | `/games/[slug]/link` | régions « Avec le code affiché dans le jeu » (champ « Code de liaison », « Lier mon compte ») et « Avec votre identifiant joueur » (« Identifiant joueur », « Rechercher », « Est-ce bien vous », « Oui, c'est moi ») ; région « Compte lié » ; erreurs `role="alert"` |
| `PaiementSimule` | `/checkout/mock`, `/checkout/success` | note « Mode démo », bouton « Payer x,xx € », case de renonciation (cochée si présente), titre « Livré… » |
| `Compte` | `/account`, `/account/purchases` | ligne d'achat (`row`, `listitem` ou `article`) contenant le titre et le statut « Livré » |
| `StudioEditeur` | `/studio`, `/studio/games/[id]` | tuile-lien du jeu, bouton « Ajouter un article », modale « Nouvel article » (« Titre de l'article », « Prix (palier) », « Suivant », « Ajouter ») |
| `Integration` | `/studio/games/[id]/integration` | titre « Intégration », sections « Clé API », « Webhook », « Liaison des comptes », « Journal des livraisons » |
| `JeuDemo` | `http://localhost:4100` | sélecteur « Joueur courant », journal « Webhook reçu : … » |

`support/fixtures.ts` fournit un `test` étendu (`connexion`, `catalogue`, `pageJeu`, `liaison`, `paiement`, `compte`,
`studio`, `integration`), `support/api.ts` les appels API « côté jeu », `support/demo-data.ts` les comptes, jeux et
clés de démo (lus dans `packages/db/src/seed.ts`, sans l'importer : il lance le seed).

## Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `E2E_WEB_PORT` | `3000` | Port de Dev AppStore (utile si 3000 est déjà pris : `E2E_WEB_PORT=3317 npm run test:e2e`). |
| `E2E_DEMO_PORT` | `4100` | Port du jeu de démo. Le seed pointe `playerLookupUrl` / `webhookUrl` sur 4100 : ne changez qu'en connaissance de cause. |
| `E2E_REUSE_SERVER` | — | `1` : réutilise des serveurs déjà lancés et **ne touche pas** à la base (lancez-les vous-même avec `DEVAPPSTORE_DATA_DIR=e2e/.data`, base migrée et seedée). |
| `E2E_REUSE_DEMO` | — | `1` : réutilise un jeu de démo déjà lancé sur 4100 (Dev AppStore reste démarré par le harnais). |
| `E2E_FORCER` | — | `1` : exécute aussi les specs marquées fixme (routes absentes), pour voir jusqu'où va un parcours. |
| `E2E_DATA_DIR` | `e2e/.data` | Base PGlite de test (relative à la racine). |
| `E2E_KEEP_DATA` | — | `1` : ne pas vider la base avant `db:push`/`db:seed`. |
| `E2E_DEMO_GAME` | — | `0` : ne pas démarrer le jeu de démo même s'il existe. |
| `E2E_SERVER_LOGS` | — | `1` : affiche la sortie standard des serveurs. |
| `E2E_CHROMIUM_PATH` | — | Binaire Chromium à utiliser (ex. `/opt/pw-browsers/chromium`). |

Les rapports (`test-results/`, `playwright-report/`) et la base `e2e/.data` sont ignorés par git.
