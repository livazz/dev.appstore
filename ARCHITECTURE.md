# Wolleen — architecture (phase 1 du plan C)

Place de marché web où les joueurs **cherchent leur jeu, lient leur compte de jeu, achètent**, et où
**le jeu reçoit l'achat automatiquement**. Les studios configurent leur boutique (maquettes du PDF) et
gardent ~95 % du revenu au lieu de 70 %.

## Monorepo

| Dossier | Rôle |
|---|---|
| `apps/web` | Next.js 15 (App Router) — site joueur, espace studio, API |
| `apps/demo-game` | Faux jeu + faux serveur de studio (port 4100) pour démontrer la livraison automatique |
| `packages/core` | Domaine pur TS : types, constantes, argent (centimes), signatures HMAC, codes de liaison, état des livraisons |
| `packages/db` | Drizzle ORM. Postgres via `DATABASE_URL`, sinon **PGlite** embarqué dans `.data/pglite` |
| `packages/sdk-js` | SDK JavaScript/TypeScript du jeu (clé publique + jeton joueur, livraisons temps réel, ack, codes de liaison) ; `/server` : vérification des webhooks |
| `sdks/unity`, `sdks/godot`, `sdks/unreal` | SDK moteurs (clé publique + jeton joueur, interrogation, ack, codes de liaison) |
| `prototype/` | Prototype front initial (référence visuelle de l'éditeur, NE PAS modifier ni importer) |

Commandes : `npm install`, `npm run db:push`, `npm run db:seed`, `npm run dev` (http://localhost:3000),
`npm test`, `npm run typecheck`.

## Règles pour toutes les tâches

- TypeScript strict, montants **toujours en centimes** (`priceCents`), devises `Currency`.
- UI en **français**, Tailwind v4 + jetons de `apps/web/src/app/globals.css` (`bg-surface`, `text-ink-2`, `bg-brand`, `bg-primary`, `bg-cancel`…).
- Ne modifiez **que les fichiers de votre périmètre** (tableau ci-dessous). Besoin d'un changement dans un fichier partagé
  (`packages/db/src/schema/*`, `src/server/*.ts` marqués CONTRAT) : ajoutez-le *en fin de fichier* sans changer les signatures existantes,
  et signalez-le dans votre rapport.
- Pas de nouvelle dépendance sans nécessité ; déjà installées : better-auth, stripe, zod (3), sharp, drizzle-orm, vitest.
- Code serveur : `import 'server-only'`, accès DB via `import { db, … } from '@wolleen/db'`.
- Tests : vitest à côté du code (`*.test.ts`), base en mémoire via `import { createTestDb } from '@wolleen/db/testing'`.
- Avant de rendre : `npm run typecheck` et `npm test` passent, `npm run build -w @wolleen/web` compile.

## Routes et propriétaires

### Joueur
| Route | Tâche |
|---|---|
| `src/app/(player)/layout.tsx` (en-tête : logo W, recherche + catégories, compte) | catalog |
| `/` catalogue (à la une, catégories), `/search?q=&cat=` | catalog |
| `/games/[slug]` boutique publique du jeu (`StorePanel` en lecture) | catalog (page) + payments (achat) |
| `/games/[slug]/link` liaison du compte de jeu | linking |
| `/account` (mes jeux liés), `/account/purchases` (historique + statut de livraison) | linking / analytics |
| `/login`, `/signup`, `/studio/signup` | auth |
| `/checkout/success`, `/checkout/mock` | payments |

### Studio (inspiré d'App Store Connect)
| Route | Tâche |
|---|---|
| `src/app/studio/layout.tsx`, `/studio` (mes jeux), `/studio/games/new` | studio-editor |
| `/studio/games/[id]` éditeur de boutique (bannière, dégradé, icône, articles, 6 mises en page, curseurs) | studio-editor |
| `/studio/games/[id]/sales` ventes et tendances | analytics |
| `/studio/games/[id]/integration` clés, webhook, journal, liaison | delivery (+ composant `LinkSettings` fourni par linking) |
| `/studio/payouts` onboarding Stripe Connect | payments |

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
| `GET /api/cron/deliveries` (relances dues, `Authorization: Bearer $CRON_SECRET`, obligatoire en production) | delivery |

#### Authentification de l'API v1 (`api-key.ts` → `authenticateApi(req)`)

Deux clés par jeu, affichées dans l'onglet Intégration (D-05 du modèle de menaces) :

| Clé | Où | Stockage | Accès |
|---|---|---|---|
| **secrète** `wk_secret_…` (anciennes `wk_live_…` / `wk_test_…` acceptées) | serveur du studio uniquement | empreinte SHA-256 (`games.apiKeyHash`) | tout le jeu : `link-codes`, `link-requests` (statut), `deliveries`/`stream` avec `player_id` obligatoire, `ack` de toute livraison du jeu, `DELETE player-tokens?player_id=` |
| **publique** `wk_pub_…` (non secrète) | embarquée dans le jeu (SDK sans serveur) | en clair (`games.publishableKey`) | `link-codes` ; `link-requests/{id}` pour échanger, **une fois**, la demande de liaison contre un **jeton joueur** ; avec ce jeton seulement : `deliveries`, `stream`, `ack`, `DELETE player-tokens` (son jeton) |

- En-têtes : `Authorization: Bearer <clé>` et, avec la clé publique, `Wolleen-Player-Token: wk_pt_…`. Jamais de clé ni de
  jeton dans l'URL. Jeu `suspended` → 401.
- **Jeton joueur** (`player_tokens`) : délivré par `GET /api/v1/link-requests/{link_request_id}` au premier appel après la
  saisie du code sur `/games/[slug]/link`, haché en base, lié au jeu, au `player_id` **et au compte Wolleen qui a saisi le
  code**, révocable (SDK, serveur du studio, onglet Intégration). Avec la clé publique, les livraisons visibles / acquittables
  sont celles de ce `player_id` achetées par ce compte (un `player_id` différent en paramètre → 403) : fabriquer un code
  pour le `player_id` d'un autre joueur ne donne accès à aucun de ses achats.
- CORS : `Access-Control-Allow-Origin: *` sur toutes les routes v1 (préflight compris), jamais
  `Access-Control-Allow-Credentials` (aucun cookie n'authentifie l'API).
- Erreurs : `{ error: { code, message } }` — `unauthorized`, `player_token_required`, `player_mismatch`, `invalid_player_id`,
  `delivery_not_found`, `link_request_not_found`, `rate_limited`…
- `authenticateGame(req)` (historique) : clé secrète seulement, renvoie la ligne `games` ; préférer `authenticateApi`.

## Contrats serveur partagés (`apps/web/src/server/`)

- `session.ts` — `getCurrentUser()`, `requireUser(next)`, `requireGameAccess(gameId, roles?)`. Stub cookie en vague 0 → Better Auth (auth).
- `api-key.ts` — `authenticateApi(req)` (clé secrète ou publique + jeton joueur, projection sans secret), `authenticateGame(req)`
  (clé secrète seule, historique), `apiError(status, code, msg)`.
- `links.ts` — `getGameLink(userId, gameId)` (linking).
- `delivery.ts` — `enqueueDelivery(orderId)` appelé par payments quand une commande est payée (refuse une commande non `paid`,
  création atomique, une livraison par commande) ; `enqueueRefund(orderId)` appelé par payments quand une commande passe à
  `refunded` (événement `purchase.refunded`, même canal) ; `dispatchDelivery(id)` (delivery). Tout appel vers `webhookUrl`
  passe par `safeHttpRequest` (`linking.ts`) : https obligatoire et IP internes refusées en production, pas de redirection.

Composants partagés : `src/components/store/ItemCard.tsx`, `StorePanel.tsx` (boutique des maquettes).

## Flux

1. **Liaison** (une fois par jeu) — méthodes activées par le studio (`games.linkMethods`) :
   - `code` : le jeu appelle `POST /api/v1/link-codes` et affiche le code ; le joueur le saisit sur `/games/[slug]/link`. Vérifié.
   - `id_confirm` : le joueur saisit son ID ; Wolleen appelle `games.playerLookupUrl` (`{player_id}` remplacé, signé HMAC) → `PlayerLookupResponse`,
     affiche « Est-ce bien vous : <nom> ? ». Déclaratif (verified=0).
   - `oauth` : phase 2.
2. **Achat** — `/games/[slug]` → bouton acheter → (si non lié → liaison) → `POST /api/checkout` → Stripe Checkout (Connect, `application_fee_amount`)
   ou **mode simulation** si `STRIPE_SECRET_KEY` est vide (`/checkout/mock`) → commande `paid` → `enqueueDelivery`.
3. **Livraison automatique** —
   - webhook (jeu avec serveur, clé secrète) : `POST games.webhookUrl` avec `Wolleen-Signature: t=…,v1=…` (`signPayload` de core),
     2xx = `delivered`, sinon relances (`WEBHOOK_RETRY_SCHEDULE_MS`, réservation atomique par le cron) ; le serveur du jeu peut
     aussi ack. Les livraisons créées avant l'enregistrement de l'URL sont reprises à l'enregistrement.
   - SDK (jeu sans serveur, clé publique) : liaison par code → jeton joueur ; le jeu écoute le flux SSE (et interroge au
     lancement / retour au premier plan), crédite, puis `ack` → `acknowledged`.
   - Jamais de double crédit : `delivery_id` sert de clé d'idempotence côté jeu (identique sur tous les canaux).
4. **Remboursement** — payments passe la commande à `refunded` puis appelle `enqueueRefund(orderId)` : événement
   `purchase.refunded` (même `order_id`, `product_id`, `quantity` que l'achat, `delivery_id` propre) par le même canal. Un achat
   pas encore confirmé est arrêté (plus jamais livré). Côté jeu : révoquer l'achat `order_id` s'il avait été crédité, sinon
   ignorer ; acquitter dans tous les cas.

## Données de démo (`npm run db:seed`)

Studio « Nova Games » (`std_nova`), jeux `gam_crystal` (serveur : webhook + lookup sur http://localhost:4100, clé secrète) et
`gam_farm` (SDK client seulement : clé publique + jeton joueur),
utilisateurs `usr_demo_dev` (dev@wolleen.test, membre du studio) et `usr_demo_player` (joueur@wolleen.test).
Clés de dev (secrètes et publiques) : voir `DEMO_KEYS` dans `packages/db/src/seed.ts`.

## Phases suivantes (plan C)

Phase 2 : OAuth studio, SDK Unreal/Godot, TVA (Stripe Tax), prix par pays, abonnements, remboursements, promos, import App Store Connect /
Google Play, domaines perso, i18n, e-mails, Sentry. Phase 3 : fidélité multi-jeux, recommandations, MoR mondial, multi-PSP, LiveOps,
IA de génération des cartes depuis une capture du jeu, app mobile, conformité SOC 2 / PCI.
