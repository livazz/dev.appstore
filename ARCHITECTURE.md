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
| `packages/sdk-js` | SDK JavaScript/TypeScript du jeu (livraisons temps réel, ack, codes de liaison) |
| `sdks/unity` | SDK Unity (C#), même API que sdk-js |
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
| `POST /api/v1/link-codes` `{ player_id, player_name? }` → `{ code, expires_at }` | linking |
| `GET /api/v1/deliveries?player_id=…` → `{ data: PurchaseEvent[] }` (pending + delivered non ack.) | delivery |
| `GET /api/v1/deliveries/stream?player_id=…` (SSE, événement `purchase`) | delivery |
| `POST /api/v1/deliveries/{id}/ack` → `{ ok: true }` | delivery |
| `GET /api/cron/deliveries` (relances dues, protégé par `CRON_SECRET`) | delivery |

L'API `/api/v1` s'authentifie par `Authorization: Bearer <clé API du jeu>` → `authenticateGame(req)`.

## Contrats serveur partagés (`apps/web/src/server/`)

- `session.ts` — `getCurrentUser()`, `requireUser(next)`, `requireGameAccess(gameId, roles?)`. Stub cookie en vague 0 → Better Auth (auth).
- `api-key.ts` — `authenticateGame(req)`, `apiError(status, code, msg)`.
- `links.ts` — `getGameLink(userId, gameId)` (linking).
- `delivery.ts` — `enqueueDelivery(orderId)` appelé par payments quand une commande est payée ; `dispatchDelivery(id)` (delivery).

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
   - webhook : `POST games.webhookUrl` avec `Wolleen-Signature: t=…,v1=…` (`signPayload` de core), 2xx = `delivered`, sinon relances
     (`WEBHOOK_RETRY_SCHEDULE_MS`) ; le serveur du jeu peut aussi ack.
   - SDK : le jeu écoute le flux SSE (et interroge au lancement / retour au premier plan), crédite, puis `ack` → `acknowledged`.
   - Jamais de double crédit : `delivery_id` / `order_id` servent de clé d'idempotence côté jeu.

## Données de démo (`npm run db:seed`)

Studio « Nova Games » (`std_nova`), jeux `gam_crystal` (webhook + lookup sur http://localhost:4100) et `gam_farm` (SDK seulement),
utilisateurs `usr_demo_dev` (dev@wolleen.test, membre du studio) et `usr_demo_player` (joueur@wolleen.test).
Clés de dev : voir `DEMO_KEYS` dans `packages/db/src/seed.ts`.

## Phases suivantes (plan C)

Phase 2 : OAuth studio, SDK Unreal/Godot, TVA (Stripe Tax), prix par pays, abonnements, remboursements, promos, import App Store Connect /
Google Play, domaines perso, i18n, e-mails, Sentry. Phase 3 : fidélité multi-jeux, recommandations, MoR mondial, multi-PSP, LiveOps,
IA de génération des cartes depuis une capture du jeu, app mobile, conformité SOC 2 / PCI.
