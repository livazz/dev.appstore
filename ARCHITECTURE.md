# Dev AppStore — architecture

> Nom commercial : **Dev AppStore** (logo : carré jaune « D »), anciennement « Wolleen ». Identifiants techniques :
> paquets `@devappstore/*`, cookies `devappstore.*`, en-têtes `DevAppStore-*`, variables `DEVAPPSTORE_*`, clés `das_*`.

Place de marché web où les joueurs **cherchent leur jeu, lient leur compte de jeu, achètent**, et où
**le jeu reçoit l'achat automatiquement**. Les studios configurent leur boutique (maquettes du PDF) et
gardent ~95 % du revenu au lieu de 70 %.

## Monorepo

| Dossier | Rôle |
|---|---|
| `apps/web` | Next.js 15 (App Router) — site joueur, espace studio, back-office `/admin`, docs `/docs`, pages légales `/legal`, API |
| `apps/demo-game` | Faux jeu + faux serveur de studio (port 4100) pour démontrer la livraison automatique |
| `packages/core` | Domaine pur TS : types, constantes, argent (centimes), signatures HMAC, codes de liaison, état des livraisons |
| `packages/db` | Drizzle ORM. Postgres via `DATABASE_URL`, sinon **PGlite** embarqué dans `.data/pglite` |
| `packages/emails` | E-mails transactionnels (HTML compatible clients mail + texte brut), transports console / Resend — voir son README |
| `packages/importers` | Import du catalogue in-app depuis App Store Connect et Google Play (`/studio/games/[id]/import`) |
| `packages/ai-style` | Génération du style d'une carte article depuis une capture du jeu (Claude, `ANTHROPIC_API_KEY`) |
| `packages/sdk-js` | SDK JavaScript/TypeScript du jeu (clé publique + jeton joueur, livraisons temps réel, ack, codes de liaison) ; `/server` : vérification des webhooks |
| `sdks/unity`, `sdks/godot`, `sdks/unreal` | SDK moteurs (clé publique + jeton joueur, interrogation, ack, codes de liaison) |
| `e2e` | Parcours Playwright (joueur, studio, sécurité) ; lit les clés de démo dans `packages/db/src/seed.ts` |
| `docs/` | Déploiement (`deploy.md`, `deploy-storage.md`), sécurité (`security/`), juridique (`legal/`, sources des pages `/legal`), produit (`product/loyalty.md`) |
| `prototype/` | Prototype front initial (référence visuelle de l'éditeur, NE PAS modifier ni importer) |

Commandes : `npm install`, `npm run db:push`, `npm run db:seed`, `npm run dev` (http://localhost:3000),
`npm test`, `npm run typecheck`, `npm run build -w @devappstore/web`, `npm run demo` (jeu de démo), `npm run test:e2e`.

## Règles pour toutes les tâches

- TypeScript strict, montants **toujours en centimes** (`priceCents`), devises `Currency`.
- UI en **français**, Tailwind v4 + jetons de `apps/web/src/app/globals.css` (`bg-surface`, `text-ink-2`, `bg-brand`, `bg-primary`, `bg-cancel`…).
- Ne modifiez **que les fichiers de votre périmètre**. Besoin d'un changement dans un fichier partagé
  (`packages/db/src/schema/*`, `src/server/*.ts` marqués CONTRAT) : ajoutez-le *en fin de fichier* sans changer les signatures existantes,
  et signalez-le dans votre rapport.
- Pas de nouvelle dépendance sans nécessité ; déjà installées : better-auth, stripe, zod (3), sharp, drizzle-orm, vitest.
- Code serveur : `import 'server-only'`, accès DB via `import { db, … } from '@devappstore/db'`.
- Variables d'environnement : côté serveur **toujours** via `import { env } from '@/env'` ; jamais `@/env` dans un
  composant client (seules les `NEXT_PUBLIC_*` y existent, injectées au build). Toute nouvelle variable : schéma et
  règles de production dans `src/env.ts`, `.env.example`, `docs/deploy.md` § Variables.
- Tests : vitest à côté du code (`*.test.ts`), base en mémoire via `import { createTestDb } from '@devappstore/db/testing'`.
- Avant de rendre : `npm run typecheck` et `npm test` passent, `npm run build -w @devappstore/web` compile.

## Routes et propriétaires

### Joueur
| Route | Tâche |
|---|---|
| `src/app/(player)/layout.tsx` (en-tête : logo, recherche + catégories, compte) | catalog |
| `/` catalogue (à la une, catégories), `/search?q=&cat=` | catalog |
| `/games/[slug]` boutique publique du jeu (`StorePanel` en lecture) | catalog (page) + payments (achat) |
| `/games/[slug]/link` liaison du compte de jeu | linking |
| `/account` (mes jeux liés, « vérifié / non vérifié »), `/account/purchases` (historique, statut de livraison, bouton « Me rétracter ») | linking / analytics / security |
| `/account/points` (Points Dev AppStore : solde, historique, récompenses) | loyalty |
| `/login`, `/signup`, `/studio/signup` | auth |
| `/checkout/success`, `/checkout/mock` | payments |
| `/pour-les-studios` (page marketing) | marketing |

### Pages légales et documentation (publiques)
| Route | Contenu |
|---|---|
| `/legal` (index), `/legal/cgv`, `/legal/cgu-studios`, `/legal/confidentialite`, `/legal/mentions-legales`, `/legal/cookies`, `/legal/retractation` (information + formulaire type) | Rendu par `components/legal/LegalDocument.tsx`. Versions datées dans `src/lib/legal-versions.ts` (`CGV_VERSION`… : version enregistrée sur la commande au checkout et rappelée dans le reçu) ; bandeau « Projet » tant que `LEGAL_STATUS = 'draft'`. Sources de travail : `docs/legal/*.md` |
| `/docs`, `/docs/demarrage-rapide`, `/docs/concepts`, `/docs/api`, `/docs/webhooks`, `/docs/sdk`, `/docs/player-lookup`, `/docs/bonnes-pratiques` | Documentation développeur (groupe `(docs)`) : navigation `src/lib/docs/nav.ts`, exemples `src/lib/docs/examples.ts` (testés), chiffres `src/lib/docs/facts.ts` repris des constantes du code |

### Studio (inspiré d'App Store Connect)
| Route | Tâche |
|---|---|
| `src/app/studio/layout.tsx`, `/studio` (mes jeux), `/studio/games/new` | studio-editor |
| `/studio/games/[id]` éditeur de boutique (bannière, dégradé, icône, articles, 6 mises en page, curseurs, style IA depuis une capture) | studio-editor / ai-style |
| `/studio/games/[id]/sales` ventes et tendances (+ `sales/export` CSV) | analytics |
| `/studio/games/[id]/import` import App Store Connect / Google Play | import |
| `/studio/games/[id]/integration` clés, webhook, journal, liaison, jetons joueur | delivery (+ composant `LinkSettings` fourni par linking) |
| `/studio/payouts` onboarding Stripe Connect (modification : owner ; lecture : finance) | payments |

Un jeu suspendu par le back-office affiche le motif dans l'espace studio (`moderation-notices.ts`, `SuspensionNotice`).

### Back-office (`/admin`, équipe Dev AppStore)
| Route | Rôle |
|---|---|
| `/admin` (tableau de bord), `/admin/games[/id]` (modération : approuver, suspendre avec motif, réactiver), `/admin/studios[/id]`, `/admin/users[/id]` (désactiver / réactiver un compte), `/admin/orders[/id]`, `/admin/audit` (journal) | `server/admin.ts` + `server/admin-logic.ts` (règles pures) |

- Accès : table `platform_admins` (rôles `superadmin`, `support`, `finance`), `requirePlatformAdmin(roles?)`. Sans
  droit → **404** (l'existence du back-office n'est pas révélée). Chaque Server Action revérifie l'accès et écrit
  `admin_audit_log` dans la même transaction que la modification. Aucune lecture ne renvoie de secret.
- Modération d'un jeu : e-mail au studio (`admin-emails.ts`) et motif visible dans l'espace studio (exigence P2B).
  Jeu `suspended` : boutique masquée, achats impossibles, API v1 → 401 ; les achats payés restent livrés.
- Compte désactivé (`user_suspensions`, `user-suspension.ts`) : plus de session (`readSession` → null même avec un
  cookie valide) et connexion refusée (`databaseHooks.session.create.before` dans `auth.ts`).
- `npm run db:seed` fait de `dev@devappstore.test` un superadmin ; autre compte ou rôle :
  `npx tsx packages/db/src/seed-admin.ts <email> <rôle>`.

### API
| Route | Tâche |
|---|---|
| `/api/auth/[...all]` | auth |
| `POST /api/uploads` (multipart → URL), `GET /api/uploads/[...key]` | uploads |
| `POST /api/checkout` `{ itemId }` → `{ url }` | payments |
| `POST /api/stripe/webhook` | payments |
| `POST /api/v1/link-codes` `{ player_id, player_name? }` → `{ code, expires_at, link_request_id }` | linking (+ delivery-keys) |
| `GET /api/v1/link-requests/{id}` → `{ status: pending\|linked\|expired\|claimed, player_id, player_token? }` | delivery |
| `GET /api/v1/deliveries[?player_id=…]` → `{ data: PurchaseEvent[] }` (pending + delivered non ack., achats et remboursements) | delivery |
| `GET /api/v1/deliveries/stream[?player_id=…]` (SSE, événement `purchase`) | delivery |
| `POST /api/v1/deliveries/{id}/ack` → `{ ok: true }` | delivery |
| `DELETE /api/v1/player-tokens[?player_id=…]` → `{ ok: true, revoked }` | delivery |
| `GET /api/cron/deliveries`, `GET /api/checkout/expire`, `GET /api/cron/loyalty`, `GET /api/cron/weekly-reports[?week=AAAA-MM-JJ]` | tâches planifiées (ci-dessous) |

#### Tâches planifiées (`apps/web/vercel.json`)

| Route | Planning (UTC) | Rôle |
|---|---|---|
| `/api/cron/deliveries` | chaque minute | relances webhook dues (réservation atomique, budget 45 s) ; en dev, boucle locale `ensureDevRetryLoop` |
| `/api/checkout/expire` | `17 * * * *` | commandes `pending` de plus de 24 h → `failed` |
| `/api/cron/loyalty` | `40 3 * * *` | expirations des Points Dev AppStore et des bons, rattrapage des objets bonus non livrés |
| `/api/cron/weekly-reports` | `0 6 * * 1` | rapport hebdomadaire de chaque studio (idempotent par studio et semaine) |

Toutes exigent `Authorization: Bearer $CRON_SECRET` (`cronGuard`, comparaison à temps constant). `CRON_SECRET` est
obligatoire en production (démarrage refusé sinon) ; vide hors développement → 503.

#### Authentification de l'API v1 (`api-key.ts` → `authenticateApi(req)`)

Deux clés par jeu, affichées dans l'onglet Intégration (D-05 du modèle de menaces) :

| Clé | Où | Stockage | Accès |
|---|---|---|---|
| **secrète** `das_secret_…` (anciennes `das_live_…` / `das_test_…` acceptées) | serveur du studio uniquement | empreinte SHA-256 (`games.apiKeyHash`) | tout le jeu : `link-codes`, `link-requests` (statut), `deliveries`/`stream` avec `player_id` obligatoire, `ack` de toute livraison du jeu, `DELETE player-tokens?player_id=` |
| **publique** `das_pub_…` (non secrète) | embarquée dans le jeu (SDK sans serveur) | en clair (`games.publishableKey`) | `link-codes` ; `link-requests/{id}` pour échanger, **une fois**, la demande de liaison contre un **jeton joueur** ; avec ce jeton seulement : `deliveries`, `stream`, `ack`, `DELETE player-tokens` (son jeton) |

- En-têtes : `Authorization: Bearer <clé>` et, avec la clé publique, `DevAppStore-Player-Token: das_pt_…`. Jamais de clé ni de
  jeton dans l'URL. Jeu `suspended` → 401.
- **Jeton joueur** (`player_tokens`) : délivré par `GET /api/v1/link-requests/{link_request_id}` au premier appel après la
  saisie du code sur `/games/[slug]/link`, haché en base, lié au jeu, au `player_id` **et au compte qui a saisi le
  code**, révocable (SDK, serveur du studio, onglet Intégration). Avec la clé publique, les livraisons visibles / acquittables
  sont celles de ce `player_id` achetées par ce compte (un `player_id` différent en paramètre → 403) : fabriquer un code
  pour le `player_id` d'un autre joueur ne donne accès à aucun de ses achats.
- **Liaison par clé publique = non vérifiée** : un code demandé avec la clé publique peut être fabriqué par n'importe
  qui pour n'importe quel `player_id` ; le lien créé est déclaratif (`game_links.verified = 0`, affiché « non vérifié »
  dans `/account`). Seul un code demandé par le serveur du studio (clé secrète) donne `verified = 1`.
- CORS : `Access-Control-Allow-Origin: *` sur toutes les routes v1 (préflight compris), jamais
  `Access-Control-Allow-Credentials` (aucun cookie n'authentifie l'API).
- Erreurs : `{ error: { code, message } }` — `unauthorized`, `player_token_required`, `player_mismatch`, `invalid_player_id`,
  `delivery_not_found`, `link_request_not_found`, `rate_limited`…
- `authenticateGame(req)` (historique) : clé secrète seulement, renvoie la ligne `games` ; préférer `authenticateApi`.

#### Limitation de débit (`api-rate-limit.ts`, `rate-limit.ts`)

- Toutes les routes v1 passent par une garde commune : limite **par IP** avant authentification (les clés invalides
  comptent), puis **par clé** après (`API_RATE_LIMITS` : 600/min par IP, 3 000/min par clé secrète, 6 000/min par clé
  publique ; limites plus basses pour `link-codes`, `link-requests` et `stream`). Dépassement → **429**
  `{ error: { code: 'rate_limited' } }` avec `Retry-After` (secondes) et les en-têtes CORS.
- **Plafond SSE** (`STREAM_LIMITS`) : 3 flux simultanés par joueur, 500 par clé secrète, 10 000 par clé publique ; durée
  maximale 30 min (le serveur ferme, le SDK se reconnecte et rattrape l'arriéré). Dépassement → 429.
- Fenêtre glissante en mémoire, valable pour **une** instance ; l'interface asynchrone `RateLimitStore` est remplaçable
  par Redis (`setRateLimitStore`). IP lue dans `X-Forwarded-For` / `X-Real-IP` (déployer derrière un proxy qui les réécrit).
- Formulaires d'authentification : `auth-rate-limit.ts` (Server Actions) et `rateLimit` de Better Auth (`/api/auth/*`) ;
  même réponse que le compte existe ou non.

## Contrats serveur partagés (`apps/web/src/server/`)

- `env.ts` (`src/env.ts`) — `env` : vue typée de `process.env`. `validateEnv()` est appelé au démarrage
  (`instrumentation.ts`) : en production, le serveur refuse de démarrer si la configuration est invalide (Stripe live et
  secret de webhook, secret de session, `CRON_SECRET`, `APP_URL` en https, stockage S3 complet…). Messages sans valeur secrète.
- `session.ts` — `getCurrentUser()`, `requireUser(next)`, `requireGameAccess(gameId, roles?)` (Better Auth ; compte désactivé = déconnecté).
- `api-key.ts` — `authenticateApi(req)` (clé secrète ou publique + jeton joueur, projection sans secret), `authenticateGame(req)`
  (clé secrète seule, historique), `apiError(status, code, msg)`.
- `links.ts` — `getGameLink(userId, gameId)` (linking).
- `delivery.ts` — `enqueueDelivery(orderId)` appelé par payments quand une commande est payée (refuse une commande non `paid`,
  création atomique, une livraison par commande) ; `enqueueRefund(orderId)` appelé quand une commande passe à
  `refunded` (événement `purchase.refunded`, même canal) ; `dispatchDelivery(id)` (delivery). Tout appel vers `webhookUrl`
  passe par `safeHttpRequest` (`linking.ts`) : https obligatoire et IP internes refusées en production, pas de redirection.
  `retryDelivery` (bouton « Relancer » du studio) ne relance ni un achat remboursé ni une livraison arrêtée pour
  rétractation (`WITHDRAWAL_STOP_REASON`).
- `withdrawal.ts` — rétractation en ligne (Flux § 5).
- `notifications.ts` — e-mails transactionnels (§ Notifications).
- `loyalty.ts` — Points Dev AppStore (§ Fidélité).
- `storage.ts`, `storage-s3.ts`, `image-upload.ts` — téléversements (§ Stockage).

Composants partagés : `src/components/store/ItemCard.tsx`, `StorePanel.tsx` (boutique des maquettes), `style-safety.ts`
(couleurs, images et contraste sûrs au rendu, importable côté client).

## Flux

1. **Liaison** (une fois par jeu) — méthodes activées par le studio (`games.linkMethods`) :
   - `code` : le jeu appelle `POST /api/v1/link-codes` et affiche le code ; le joueur le saisit sur `/games/[slug]/link`.
     Vérifié si le code vient de la clé secrète, déclaratif s'il vient de la clé publique.
   - `id_confirm` : le joueur saisit son ID ; la plateforme appelle `games.playerLookupUrl` (`{player_id}` remplacé, signé HMAC) → `PlayerLookupResponse`,
     affiche « Est-ce bien vous : <nom> ? ». Déclaratif (verified=0).
   - `oauth` : phase 2.
2. **Achat** — `/games/[slug]` → bouton acheter → (si non lié → liaison) → case « livraison immédiate et renonciation »
   (horodatage et version des CGV enregistrés sur la commande) → `POST /api/checkout` → Stripe Checkout (Connect,
   `application_fee_amount`) ou **mode simulation** si `STRIPE_SECRET_KEY` est vide (`/checkout/mock`, jamais en
   production) → commande `paid` → `enqueueDelivery` + reçu par e-mail + Points Dev AppStore.
3. **Livraison automatique** —
   - webhook (jeu avec serveur, clé secrète) : `POST games.webhookUrl` avec `DevAppStore-Signature: t=…,v1=…` (`signPayload` de core),
     2xx = `delivered`, sinon relances (`WEBHOOK_RETRY_SCHEDULE_MS`, réservation atomique par le cron), `failed` quand
     elles sont épuisées (e-mail au joueur, alerte au studio) ; le serveur du jeu peut aussi ack. Les livraisons créées
     avant l'enregistrement de l'URL sont reprises à l'enregistrement.
   - SDK (jeu sans serveur, clé publique) : liaison par code → jeton joueur ; le jeu écoute le flux SSE (et interroge au
     lancement / retour au premier plan), crédite, puis `ack` → `acknowledged`.
   - Jamais de double crédit : `delivery_id` sert de clé d'idempotence côté jeu (identique sur tous les canaux).
4. **Remboursement** — la commande passe à `refunded` (webhook Stripe `charge.refunded` ou rétractation)
   puis `enqueueRefund(orderId)` : événement `purchase.refunded` (même `order_id`, `product_id`, `quantity` que l'achat,
   `delivery_id` propre) par le même canal. Un achat pas encore confirmé est arrêté (plus jamais livré). Côté jeu :
   révoquer l'achat `order_id` s'il avait été crédité, sinon ignorer ; acquitter dans tous les cas.
5. **Rétractation** (`withdrawal.ts`, directive (UE) 2023/2673, `docs/legal/consumer.md` § 2.4–2.5) — bouton
   « Me rétracter » dans `/account/purchases` (confirmation en deux étapes) tant que la commande est payée, de moins de
   14 jours et **pas livrée** : livraison `pending` (en attente, en relance) ou `failed` (relances épuisées, rien n'a
   été crédité). `withdrawOrder` : commande verrouillée et arrêt atomique, conditionnel, de la livraison (`pending` /
   `failed` → `failed` avec le motif `WITHDRAWAL_STOP_REASON` ; une livraison confirmée entre-temps fait échouer la
   rétractation) ; remboursement intégral (Stripe avec clé d'idempotence par commande, transfert et commission annulés ;
   simulation en dev) ; commande `refunded` + `enqueueRefund` ; puis **accusé de réception par e-mail** sur support
   durable (`sendWithdrawalAcknowledgement`, en arrière-plan : un échec d'envoi n'annule pas la rétractation). Si le
   remboursement Stripe échoue, la livraison reste arrêtée et le joueur peut relancer (même clé d'idempotence).

## Notifications (`notifications.ts`, `packages/emails`)

| Fonction | Déclencheur | Destinataire |
|---|---|---|
| `sendPurchaseReceipt` | commande `paid` | joueur — reçu + confirmation de la renonciation (support durable) |
| `sendPurchaseDelivered` | livraison `delivered` / `acknowledged` | joueur |
| `sendDeliveryFailed` | relances épuisées | joueur + alerte studio regroupée (une par jeu et par heure) |
| `sendWithdrawalAcknowledgement` | rétractation réussie (`withdrawOrder`) | joueur — accusé de réception (marque Dev AppStore) |
| `sendPlayerWelcome`, `sendStudioWelcome` | inscription joueur / création du studio | joueur / owner |
| `sendWeeklyStudioReport` | cron `/api/cron/weekly-reports` | owner, admin, finance |
| Better Auth (`verifyEmailEmail`, `passwordResetEmail`) | vérification d'adresse, mot de passe oublié | utilisateur |
| `admin-emails.ts` | modération d'un jeu | responsables du studio |

- Idempotence : table `notifications_sent`, clé unique (kind, ref_id) ; un envoi en échec peut être retenté.
- Jamais bloquant : les fonctions ne lèvent pas ; depuis une requête, `runInBackground` (`after()` de Next.js).
- Transport : console + `.data/mails` en dev, Resend si `RESEND_API_KEY` ; aucun e-mail réel sous vitest.
  Aperçu de tous les modèles : `npm run preview -w @devappstore/emails`.

## Stockage des téléversements (`storage.ts`, `docs/deploy-storage.md`)

- `POST /api/uploads` : image décodée par sharp (format déterminé par les octets), convertie en WebP, clé
  `<icon|banner|item>/<uploadeur>/<uuid>.webp` ; rôles owner / admin / developer, anti-CSRF.
- `DEVAPPSTORE_STORAGE=local` (défaut) : disque `.data/uploads`, servi par `GET /api/uploads/[...key]` (CSP sandbox, nosniff).
- `DEVAPPSTORE_STORAGE=s3` (Cloudflare R2 / S3, `storage-s3.ts`, PUT signé SigV4) : URL `<S3_PUBLIC_URL>/<clé>` servie par le CDN.
- Rendu : `safeImageUrl` (`components/store/style-safety.ts`, exécuté aussi côté client) n'affiche que les chemins
  relatifs, les `data:image/` du seed et les URL **https** sous `NEXT_PUBLIC_S3_PUBLIC_URL` (même valeur que
  `S3_PUBLIC_URL`, exigée en production avec `s3`) au format de clé ci-dessus ; toute autre URL (pistage) est ignorée.
  À l'écriture, `uploaderOfUrl` refuse une image que l'utilisateur n'a pas téléversée.

## Fidélité — Points Dev AppStore (`loyalty.ts`, `docs/product/loyalty.md`)

Points gagnés sur les commandes payées (retirés au remboursement), échangés contre des récompenses (objets bonus livrés
par le canal normal, bons de réduction au checkout). Ni achetables, ni convertibles en argent, ni transférables ; ils
expirent (`LOYALTY_POINTS_TTL_DAYS`). Écritures sous verrou consultatif par utilisateur (pas de double dépense). Actif
par défaut hors production (`LOYALTY_ENABLED=1` pour l'ouvrir en production). Page joueur `/account/points`, cron quotidien.

## Données de démo (`npm run db:seed`)

Studio « Nova Games » (`std_nova`), jeux `gam_crystal` (serveur : webhook + lookup sur http://localhost:4100, clé secrète) et
`gam_farm` (SDK client seulement : clé publique + jeton joueur), utilisateurs `usr_demo_dev` (dev@devappstore.test,
propriétaire du studio **et superadmin du back-office**) et `usr_demo_player` (joueur@devappstore.test), mot de passe
`demo1234` ; ~90 jours de ventes de démo et des Points Dev AppStore.
Clés de dev : `DEMO_KEYS` dans `packages/db/src/seed.ts` — secrètes `das_secret_demo_crystal_clash` /
`das_secret_demo_pixel_farm`, publiques `das_pub_demo_crystal_clash` / `das_pub_demo_pixel_farm` (reprises par
`apps/demo-game/src/config.ts`, cohérence vérifiée par test, et lues par `e2e/`). Une base créée avec les anciennes clés
`das_test_demo_*` est migrée par le seed. Jamais en production.

## Phases suivantes (plan C)

Déjà livrés depuis le plan initial : SDK Unreal / Godot, remboursements et rétractation, import App Store Connect /
Google Play, e-mails, fidélité (Points Dev AppStore), génération IA du style des cartes, back-office, pages légales, docs.

Restent — phase 2 : OAuth studio, TVA (Stripe Tax, `STRIPE_AUTOMATIC_TAX`), prix par pays, abonnements, promos, domaines
perso, i18n, Sentry, limiteur de débit partagé (Redis, multi-instance). Phase 3 : fidélité multi-jeux, recommandations,
MoR mondial, multi-PSP, LiveOps, app mobile, conformité SOC 2 / PCI.
