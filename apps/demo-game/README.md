# Démo Nova Games (`@wolleen/demo-game`)

Faux jeu + faux serveur du studio « Nova Games » pour **prouver que le jeu reçoit les achats Wolleen tout seul**.
Serveur Node `http` sans framework, port **4100**.

```bash
npm run db:push && npm run db:seed   # jeux gam_crystal / gam_farm et clés de démo
npm run dev                          # Wolleen sur http://localhost:3000
npm run demo                         # ce jeu sur http://localhost:4100
```

Variables : `PORT` (4100), `WOLLEEN_URL` (http://localhost:3000), et en option `CRYSTAL_API_KEY`, `CRYSTAL_WEBHOOK_SECRET`,
`FARM_API_KEY`, `FARM_WEBHOOK_SECRET` (par défaut : `DEMO_KEYS` de `packages/db/src/seed.ts`).

## Deux modes d'intégration

| Jeu | Mode | Chemin d'un achat |
|---|---|---|
| **Crystal Clash** (`gam_crystal`) | Webhook serveur | Wolleen → `POST /wolleen/webhook` (signé) → inventaire en mémoire (idempotent par `delivery_id`) → poussé à la page du jeu (SSE `/api/events`) → ack API en tâche de fond |
| **Pixel Farm** (`gam_farm`) | SDK client | La page du jeu importe `@wolleen/sdk` (`/sdk/index.js`, transpilé à la volée) → `onPurchase` (flux SSE via le proxy `/proxy/api/v1/*` + rattrapage) → crédit local (localStorage) → ack automatique |

## Parcours de démonstration

1. Ouvrez http://localhost:4100, choisissez le jeu et le joueur (ex. **Ali · #2PP8QL9 · niv. 42**).
2. Dans le téléphone : **Paramètres → Lier mon compte web** affiche un code (via le serveur du jeu pour Crystal, via le SDK pour Farm).
3. Connecté sur Wolleen (joueur@wolleen.test), saisissez le code sur `/games/<slug>/link`
   (Crystal accepte aussi la liaison par ID : saisissez `#2PP8QL9`, Wolleen appelle `GET /wolleen/players/%232PP8QL9`).
4. Achetez un article sur la boutique Wolleen : les compteurs gemmes / or / graines s'animent dans le jeu, sans recharger.

Hors ligne, le bouton **Simuler un achat** (Crystal) envoie au serveur du jeu un webhook signé comme le ferait Wolleen.

## Points d'entrée

| Route | Rôle |
|---|---|
| `GET /` | page du jeu (HTML/JS, `public/`) |
| `GET /wolleen/players/{id}` | player lookup → `PlayerLookupResponse` ; si `Wolleen-Signature` est présente, elle doit signer l'ID brut |
| `POST /wolleen/webhook` | webhook Wolleen : 401 si signature invalide, 400 si événement d'un autre jeu, 200 `{ ok, duplicate }` |
| `GET /api/config`, `/api/state`, `/api/events` | configuration, inventaire et flux du client du jeu |
| `POST /api/link-code` | code de liaison demandé par le serveur du jeu (Crystal) |
| `POST /api/dev/simulate` | achat fictif signé (démo hors ligne) |
| `GET`/`POST /proxy/api/v1/*` | relais vers Wolleen pour le SDK navigateur (même origine) |
| `GET /sdk/*.js` | `@wolleen/sdk` en modules ES pour le navigateur |

Tests : `npm test -w @wolleen/demo-game` (signature, idempotence, lookup, flux, proxy SDK de bout en bout).
