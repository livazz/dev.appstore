# Déployer Dev AppStore

Ce guide décrit la mise en production de référence (**Vercel + Neon + Cloudflare R2, tout en UE**), l'alternative
Docker, les migrations, Stripe, les variables, les sauvegardes et la check-list de mise en production.

| Brique | Choix de référence | Région | Pourquoi |
|---|---|---|---|
| Application (`apps/web`) | Vercel (Next.js 15, fonctions Node) | `fra1` (Francfort) | Next.js natif, cron intégré, previews par PR |
| Base Postgres | Neon | AWS `eu-central-1` (Francfort) | Postgres serverless, branches de préproduction, PITR |
| Fichiers (uploads) | Cloudflare R2 | juridiction **EU** | S3-compatible, sans frais de sortie, CDN Cloudflare |
| Paiements | Stripe (Checkout + Connect) | — | voir `docs/legal/` (DPA Stripe, CCT incluses) |
| E-mails (phase 2) | Resend | région UE | `RESEND_API_KEY` |

L'application et la base sont dans la **même région** (Francfort) : chaque requête fait plusieurs allers-retours SQL.
Hébergement UE recommandé par `docs/legal/rgpd.md` (§ 4) ; Vercel et Neon étant des sociétés américaines, signer leur DPA
(DPF / CCT) et le mentionner au registre des traitements.

Fichiers fournis :

| Fichier | Rôle |
|---|---|
| `apps/web/src/env.ts` | Validation zod des variables serveur, échec au démarrage si la configuration est dangereuse |
| `apps/web/vercel.json` | Région `fra1`, cron des livraisons, en-têtes de sécurité de base |
| `Dockerfile`, `.dockerignore` | Image de production (standalone), image de migrations, image de dev |
| `docker-compose.yml` | Dev local complet : Postgres 16 + Dev AppStore + jeu de démo |
| `packages/db` : scripts `db:generate`, `db:migrate` | Migrations versionnées Drizzle |

---

## 1. Brancher `env.ts` (à faire après fusion)

`apps/web/src/env.ts` n'est volontairement importé nulle part encore. Pour l'activer :

1. **Échec au démarrage** — créer `apps/web/src/instrumentation.ts` :

   ```ts
   export async function register() {
     // Valide la configuration au boot du serveur Node (pas dans l'Edge runtime).
     if (process.env.NEXT_RUNTIME === 'nodejs') await import('./env');
   }
   ```

   Pendant `next build`, la validation stricte est sautée (`NEXT_PHASE=phase-production-build`) : la CI et l'image
   Docker compilent sans secrets. `SKIP_ENV_VALIDATION=1` permet aussi de la sauter pour un outil ponctuel.
2. **Lecture unique** (CHK-CFG-02) — remplacer les `process.env.X` du code serveur par `import { env } from '@/env'` :
   - `src/server/stripe.ts` : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `APP_URL`,
     `isProduction()` → `env.isProduction`, `isSimulationAllowed()` → `env.paymentsMode === 'simulation'` ;
   - `src/server/payments.ts` : `platformFeeBps()` → `env.PLATFORM_FEE_BPS` (déjà un entier validé 0–3000) ;
   - `src/server/delivery-http.ts` : `CRON_SECRET` ;
   - `src/server/storage.ts` : `DEVAPPSTORE_STORAGE`, `DEVAPPSTORE_DATA_DIR`, `S3_*` ;
   - configuration Better Auth (tâche auth) : `secret: env.AUTH_SECRET, baseURL: env.APP_URL` — Better Auth lit sinon
     `BETTER_AUTH_SECRET` par défaut, qui ne serait pas validé.
3. Compléter `.env.example` avec `DEVAPPSTORE_ALLOW_TEST_PAYMENTS`, `DEVAPPSTORE_STORAGE`, `S3_*`, `RESEND_API_KEY`,
   `ANTHROPIC_API_KEY` (CHK-CFG-03).

`packages/db` lit `DATABASE_URL` lui-même (il est partagé avec les scripts) ; `env.ts` refuse déjà de démarrer sans
`DATABASE_URL` en production, ce qui couvre CHK-CFG-01 dès que l'instrumentation est en place.

## 2. Variables d'environnement

Règles appliquées par `env.ts` (les messages d'erreur listent les variables fautives, jamais leurs valeurs) :

| Variable | Dev | Production | Règle |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` | posé par Next.js / Vercel |
| `DATABASE_URL` | vide → PGlite | **obligatoire** | `postgres://` ou `postgresql://` |
| `AUTH_SECRET` | libre | **obligatoire**, ≥ 32 caractères, ≠ `change-me` | `openssl rand -hex 32` |
| `APP_URL` | `http://localhost:3000` | **obligatoire**, `https://` | origine publique (retours Stripe, cookies) |
| `STRIPE_SECRET_KEY` | vide → mode simulation | **obligatoire** (simulation interdite), `sk_live_…` (ou `rk_live_…`) | `sk_test_` refusée sauf `DEVAPPSTORE_ALLOW_TEST_PAYMENTS=1` |
| `DEVAPPSTORE_ALLOW_TEST_PAYMENTS` | — | `1` **uniquement en préproduction** | autorise `sk_test_` avec `NODE_ENV=production` ; n'autorise jamais la simulation |
| `STRIPE_WEBHOOK_SECRET` | optionnel | **obligatoire** si clé Stripe | `whsec_…` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | optionnel | recommandé | `whsec_…` (endpoint « comptes connectés ») |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | optionnel | `pk_live_…` si clé live | figée **au build** (variable publique) |
| `PLATFORM_FEE_BPS` | 500 | 0–3000 | commission en points de base (500 = 5 %) |
| `CRON_SECRET` | vide = cron ouvert | **obligatoire**, ≥ 16 caractères | `openssl rand -hex 32` ; Vercel l'envoie en `Authorization: Bearer` |
| `DEVAPPSTORE_STORAGE` | `local` | `s3` (voir § 5) | `local` \| `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | — | obligatoires si `s3` | R2 : `https://<compte>.eu.r2.cloudflarestorage.com` |
| `NEXT_PUBLIC_S3_PUBLIC_URL` | — | obligatoire si `s3`, **= `S3_PUBLIC_URL`** | lue par le rendu client des boutiques (`safeImageUrl`) ; injectée au build |
| `RESEND_API_KEY` | optionnel | optionnel | `re_…` (e-mails, phase 2) |
| `ANTHROPIC_API_KEY` | optionnel | optionnel | `sk-ant-…` (assistant de style) |

> Écart assumé avec l'énoncé initial : `CRON_SECRET` est **obligatoire en production** (CHK-CFG-02, P0) — sans lui,
> n'importe qui peut déclencher les relances de webhooks.

Sur Vercel : *Settings → Environment Variables*. Renseigner **Production** et **Preview** séparément : les previews
utilisent une branche Neon et des clés Stripe de test avec `DEVAPPSTORE_ALLOW_TEST_PAYMENTS=1`. Ne jamais donner aux
previews la base ou la clé Stripe de production. Marquer les secrets comme *Sensitive*.

## 3. Vercel

1. *Add New Project* → importer le dépôt → **Root Directory : `apps/web`** (Vercel détecte les workspaces npm et
   installe depuis la racine grâce au `package-lock.json`). Framework : Next.js. Node 22.
2. `apps/web/vercel.json` fixe la région des fonctions à `fra1`, déclare le cron et ajoute des en-têtes de sécurité
   de base (HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`). La CSP (CHK-HDR-01) reste
   à définir dans l'application (`next.config.ts` ou `middleware.ts`), car elle dépend des nonces de scripts.
3. Domaine : ajouter le domaine, puis `APP_URL=https://<domaine>`.

### Tâches planifiées (cron)

Quatre routes `GET`, déclarées dans `apps/web/vercel.json` :

| Route | Planning | Rôle |
|---|---|---|
| `/api/cron/deliveries` | `* * * * *` (chaque minute) | relance les webhooks dus (`WEBHOOK_RETRY_SCHEDULE_MS`), achats et remboursements ; e-mails « livré » / « échec définitif » |
| `/api/checkout/expire` | `17 * * * *` (toutes les heures) | passe à `failed` les commandes `pending` de plus de 24 h |
| `/api/cron/loyalty` | `40 3 * * *` (chaque nuit) | Points Dev AppStore : inscrit les expirations de points et de bons, rattrape la livraison des objets bonus |
| `/api/cron/weekly-reports` | `0 6 * * 1` (lundi 6 h UTC) | rapport hebdomadaire de chaque studio (semaine complète précédente ; `?week=AAAA-MM-JJ` pour rejouer) |

Toutes sont idempotentes et protégées de la même façon (`cronGuard`, `src/server/delivery-http.ts`) :
`Authorization: Bearer $CRON_SECRET` comparé **à temps constant** ; `401` si le jeton est absent ou faux, `503`
(`cron_not_configured`) si `CRON_SECRET` est vide — accepté sans secret uniquement en développement local
(`NODE_ENV=development`). Vercel envoie lui-même l'en-tête quand la variable `CRON_SECRET` est définie sur le projet.

Le cron à la minute exige l'offre **Pro**. Sur l'offre Hobby (une exécution par jour et par cron), remplacer
`/api/cron/deliveries` par `"0 3 * * *"` et faire appeler les URL par un planificateur externe (Cloudflare Workers
Cron Triggers, cron-job.org, CronJob Kubernetes en Docker…) :

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/cron/deliveries        # chaque minute
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/checkout/expire         # chaque heure
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/cron/loyalty            # chaque nuit
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/cron/weekly-reports     # lundi matin
```

Les crons Vercel ne tournent que sur le déploiement de **production**. En développement, une boucle intégrée relance
déjà les livraisons ; les autres routes s'appellent à la main (sans en-tête si `CRON_SECRET` est vide).

### Limites serverless à connaître

- **SSE** (`/api/v1/deliveries/stream`) : une fonction Vercel est coupée à `maxDuration` ; le SDK se reconnecte et
  récupère l'arriéré, c'est prévu. Le bus d'événements (`src/server/events.ts`) est **en mémoire** : un achat confirmé
  sur une instance n'est poussé en temps réel qu'aux flux ouverts sur cette instance. Rien n'est perdu (rattrapage à la
  reconnexion + webhook serveur + cron), mais le « temps réel » n'est garanti qu'après passage à Postgres
  `LISTEN/NOTIFY` ou Redis (phase 2).
- **Disque** : le système de fichiers des fonctions est éphémère → `DEVAPPSTORE_STORAGE=local` ne convient pas en
  production (voir § 5).
- **Connexions Postgres** : utiliser l'URL **poolée** de Neon pour l'application (voir § 4).

## 4. Base de données : Neon (UE)

1. Créer un projet Neon en **AWS Europe Central 1 (Frankfurt)**, Postgres 16 ou 17.
2. Deux chaînes de connexion :
   - **poolée** (hôte `…-pooler…`) → `DATABASE_URL` de l'application (beaucoup de fonctions courtes) ;
   - **directe** → migrations et sauvegardes (`pg_dump`, `drizzle-kit migrate`).
   Toujours `?sslmode=require`.
3. `packages/db` ouvre `postgres(url, { max: 5 })`. Si l'erreur `prepared statement "…" does not exist` apparaît
   derrière le pooler, ajouter `prepare: false` à cet appel (changement dans `packages/db/src/index.ts`, à faire par
   son propriétaire).
4. Branches : une branche `preview` (ou une par PR via l'intégration Neon ↔ Vercel) pour les previews.

### Migrations : `drizzle-kit push` ou migrations versionnées ?

| | `npm run db:push` (existant) | `db:generate` + `db:migrate` (ajoutés) |
|---|---|---|
| Principe | compare le schéma TS à la base et applique le diff | génère des fichiers SQL versionnés, appliqués dans l'ordre |
| Revue | aucune (et `--force` accepte les pertes de données) | le SQL est relu en PR |
| Reproductible | non (dépend de l'état de la base) | oui, table `drizzle.__drizzle_migrations` |
| Usage | **dev local / PGlite / docker-compose** | **préproduction et production** |

**Recommandation : migrations versionnées en préproduction et production ; `push` réservé au dev.**

```bash
# Après une modification de packages/db/src/schema/* :
npm run db:generate -w @devappstore/db          # écrit packages/db/drizzle/NNNN_*.sql (+ meta/) — à committer
# Appliquer (CI ou poste d'admin), sur l'URL DIRECTE :
DATABASE_URL="postgresql://…directe…?sslmode=require" npm run db:migrate -w @devappstore/db
# ou via l'image Docker :
docker build --target migrator -t devappstore-migrate . && docker run --rm -e DATABASE_URL=… devappstore-migrate
```

- **Première migration** : après fusion de toutes les branches, générer `0000_*.sql` à partir du schéma final et le
  committer. Une base de production neuve ne doit **jamais** avoir reçu de `push`.
- **Où lancer `db:migrate`** : dans un job GitHub Actions déclenché sur `main` (secret `DATABASE_URL_DIRECT`), **avant**
  la promotion du déploiement Vercel. Ne pas l'ajouter au *Build Command* de Vercel : chaque preview migrerait la base
  qui lui est attribuée au moment du build, sans contrôle.
- **Sans interruption** : migrations « expand / contract » — ajouter une colonne nullable, déployer le code qui
  l'écrit, remplir, puis rendre `NOT NULL` / supprimer l'ancienne colonne dans une migration suivante.
- `npm run db:seed` ne doit **jamais** viser la production (clés `das_secret_demo_*` / `das_pub_demo_*`, CHK-CFG-04).

## 5. Fichiers : Cloudflare R2

État actuel : seul l'adaptateur `local` existe (`src/server/storage.ts`) ; `s3` est prévu (phase 2, compatible R2).
**Tant qu'il n'est pas livré, les uploads ne sont pas persistants sur Vercel.** Préparation :

1. Créer un bucket R2 avec la **juridiction EU** (`devappstore-uploads`).
2. Domaine public personnalisé (ex. `cdn.<domaine>`) branché sur le bucket → `S3_PUBLIC_URL`.
3. Jeton d'API R2 limité à ce bucket, droits *Object Read & Write* → `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.
4. `S3_ENDPOINT=https://<account_id>.eu.r2.cloudflarestorage.com`, `S3_BUCKET=devappstore-uploads`, `DEVAPPSTORE_STORAGE=s3`.
5. Servir les images avec les en-têtes de CHK-UPL-06 (`Content-Type` forcé, `nosniff`, `Cache-Control` immuable) —
   à poser lors du `PutObject`.

## 6. Stripe

1. Compte plateforme activé (KYC), **Connect** activé (comptes Express pour les studios).
2. *Developers → Webhooks* — deux endpoints vers la **même URL** `https://<domaine>/api/stripe/webhook` (la route
   essaie les deux secrets) :

   | Endpoint | Écoute | Événements | Secret |
   |---|---|---|---|
   | Plateforme | *Your account* | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` | `STRIPE_WEBHOOK_SECRET` |
   | Comptes connectés | *Connected accounts* | `account.updated` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

   Version d'API : celle de `STRIPE_API_VERSION` (`src/server/stripe.ts`).
3. Clés : `sk_live_…` (ou mieux une clé restreinte `rk_live_…` limitée à Checkout, Connect, Webhooks) et `pk_live_…`.
4. Préproduction : mêmes endpoints en mode test vers l'URL de preview, `sk_test_…` + `DEVAPPSTORE_ALLOW_TEST_PAYMENTS=1`.
5. Local : `stripe listen --forward-to localhost:3000/api/stripe/webhook` et copier le `whsec_…` affiché dans `.env`.
6. Rotation : en cas de fuite, *Roll key* dans Stripe, mettre à jour Vercel, redéployer.

## 7. Docker (alternative : Scaleway, Clever Cloud, OVHcloud, Fly.io…)

### Ligne à ajouter dans `apps/web/next.config.ts` (non modifié par cette tâche)

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo : trace les dépendances depuis la racine du dépôt (packages/*, node_modules hoistés).
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@devappstore/core', '@devappstore/db'],
  // … reste inchangé
};
```

(`fileURLToPath` est déjà importé dans ce fichier.) Sans effet négatif sur Vercel. Testé : la sortie se trouve dans
`apps/web/.next/standalone/apps/web/server.js`, ce que copie le `Dockerfile`. Sans ces lignes, le build Docker échoue
avec un message explicite.

### Construire et lancer

```bash
docker build -t devappstore-web --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_… .
docker build --target migrator -t devappstore-migrate .

docker run --rm --env-file prod.env devappstore-migrate            # migrations
docker run -d -p 3000:3000 --env-file prod.env devappstore-web     # application (utilisateur non root, HEALTHCHECK sur /)
```

Le cron doit être fourni par l'hébergeur (CronJob Kubernetes, tâche planifiée, `curl` ci-dessus chaque minute).
Placer un reverse proxy TLS devant (HSTS, en-têtes du § 3) et désactiver la mise en tampon pour
`/api/v1/deliveries/stream` (SSE ; ex. nginx `proxy_buffering off`).

### Développement local avec Docker

```bash
docker compose up --build      # Postgres 16 + schéma + seed, Dev AppStore :3000, jeu de démo :4100
docker compose down -v         # tout supprimer
```

Le jeu de démo partage la pile réseau du service `web` (`network_mode: service:web`) : les URL `http://localhost:4100`
du seed fonctionnent sans modification. Paiements en mode simulation, sauf si un `.env` fournit des clés de test.

## 8. Sauvegardes et restauration

| Donnée | Mécanisme | Rétention |
|---|---|---|
| Postgres (Neon) | **PITR** natif (historique WAL, restauration à la seconde) | fenêtre selon l'offre : viser ≥ 7 jours |
| Postgres (export logique) | `pg_dump -Fc` quotidien sur l'URL directe → bucket R2 **distinct** `devappstore-backups` (juridiction EU, règle de verrouillage / *bucket lock*) | 35 jours glissants + 1 mensuel 12 mois |
| Fichiers R2 | copie quotidienne `rclone sync` vers `devappstore-backups/uploads/` | 35 jours |
| Configuration | variables Vercel exportées dans un coffre (1Password, Bitwarden…), jamais dans Git | — |

Exemple de job (GitHub Actions planifié, secrets `DATABASE_URL_DIRECT`, accès R2) :

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL_DIRECT" > devappstore-$(date +%F).dump
aws s3 cp devappstore-$(date +%F).dump s3://devappstore-backups/pg/ --endpoint-url "$R2_BACKUP_ENDPOINT"
```

- **Tester la restauration chaque mois** : `pg_restore` dans une branche Neon jetable, puis `npm run test` de fumée.
  Une sauvegarde jamais restaurée n'est pas une sauvegarde.
- Objectifs : RPO ≤ 5 min (PITR), RTO ≤ 1 h.
- Durées légales (`docs/legal/rgpd.md` § 5) : commandes et pièces comptables **10 ans** — prévoir un export
  annuel des commandes vers un archivage froid plutôt que de garder 10 ans de dumps complets ; les sauvegardes
  ne doivent pas faire revivre des comptes supprimés (purge documentée lors d'une restauration).

## 9. Check-list de mise en production

S'appuie sur [`docs/security/review-checklist.md`](./security/review-checklist.md) : **tout point P0 en KO bloque la
mise en production**, un P1 en KO bloque l'ouverture publique. Cocher dans l'ordre.

### Code et revue

- [ ] Tableau de suivi de la checklist de sécurité rempli, **tous les P0 à OK** (CFG-02/05/06, AUTH-01/02, MT-01…05,
      API-01/02/06, LNK-01, PAY-01/02/06…11, DLV-01/03/07/08, UPL-02/04/05/06).
- [ ] `env.ts` branché via `instrumentation.ts` (§ 1) — couvre CHK-CFG-01, CHK-CFG-02, CHK-PAY-10.
- [ ] Stub de session de démo supprimé ou bloqué en production (CHK-CFG-06) ; Better Auth configuré avec `env.AUTH_SECRET`.
- [ ] `allowPrivateTargets()` faux en production : les URL webhook/lookup des studios en `localhost`/IP privées sont refusées.
- [ ] CI verte (`typecheck`, `test`, `build`) ; `npm audit --omit=dev` sans vulnérabilité haute exploitable (CHK-DEP-01) ;
      Next.js à une version corrigée (avis de sécurité du 11/12/2025 sur 15.5.7).
- [ ] `git log -p | rg "sk_live_|rk_live_|whsec_[A-Za-z0-9]{20,}|das_live_"` vide (CHK-CFG-05).
- [ ] Adaptateur de stockage `s3` (R2) livré, ou uploads désactivés au lancement (§ 5).
- [ ] CSP et en-têtes globaux (CHK-HDR-01) en place.

### Infrastructure

- [ ] Neon `eu-central-1`, URL poolée pour l'app, URL directe pour migrations/sauvegardes, `sslmode=require`.
- [ ] Migration initiale `0000_*.sql` committée, `db:migrate` exécuté sur la base de production (jamais `push`, jamais `seed`).
- [ ] Vercel : Root Directory `apps/web`, région `fra1`, offre Pro (cron à la minute) ou planificateur externe.
- [ ] Variables de production saisies (§ 2) ; le déploiement démarre (sinon le message `Configuration invalide` liste
      ce qui manque) ; previews isolées (base et Stripe de test).
- [ ] `curl -s -o /dev/null -w "%{http_code}" https://<domaine>/api/cron/deliveries` → `401` sans `CRON_SECRET`.
- [ ] Sauvegarde quotidienne active et **une restauration testée**.
- [ ] DPA signés (Vercel, Neon, Cloudflare, Stripe, Resend) et registre des traitements à jour (`docs/legal/rgpd.md`).

### Paiements

- [ ] `STRIPE_SECRET_KEY` live (`/^(sk|rk)_live_/`), `DEVAPPSTORE_ALLOW_TEST_PAYMENTS` **absent** en production.
- [ ] Deux endpoints webhook configurés (§ 6), signatures vérifiées : `curl -X POST https://<domaine>/api/stripe/webhook -d '{}'` → `400`.
- [ ] `/checkout/mock` inaccessible en production (CHK-PAY-11).
- [ ] Achat réel de bout en bout sur un jeu pilote (petit montant, remboursé ensuite) : commande `paid`, livraison
      `delivered` / `acknowledged`, commission conforme à `PLATFORM_FEE_BPS`, virement Connect visible.
- [ ] Mentions légales, CGU/CGV, information sur le droit de rétractation (`docs/legal/consumer.md`) en ligne.

### Après la mise en production

- [ ] Surveiller les échecs de webhooks Stripe (*Developers → Webhooks*) et le journal des livraisons pendant 48 h.
- [ ] Alertes : erreurs 5xx Vercel, échecs du cron, espace et connexions Neon.
- [ ] Procédure de retour arrière : *Instant Rollback* Vercel (le code) ; les migrations étant « expand / contract »,
      l'ancien code reste compatible avec le nouveau schéma.
