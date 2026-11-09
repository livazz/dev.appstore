# Démo Nova Games (`@devappstore/demo-game`)

Faux jeu + faux serveur du studio « Nova Games » pour **prouver que le jeu reçoit les achats Dev AppStore tout seul**.
Serveur Node `http` sans framework, port **4100**.

```bash
npm run db:push && npm run db:seed   # jeux gam_crystal / gam_farm et clés de démo
npm run dev                          # Dev AppStore sur http://localhost:3000
npm run demo                         # ce jeu sur http://localhost:4100
```

Variables : `PORT` (4100), `DEVAPPSTORE_URL` (http://localhost:3000), et en option `CRYSTAL_API_KEY`, `CRYSTAL_PUBLISHABLE_KEY`,
`CRYSTAL_WEBHOOK_SECRET`, `FARM_API_KEY`, `FARM_PUBLISHABLE_KEY`, `FARM_WEBHOOK_SECRET` (par défaut : `DEMO_KEYS` de
`packages/db/src/seed.ts`). Les clés **secrètes** (`*_API_KEY`) ne quittent jamais ce serveur ; seule la clé **publique**
de Pixel Farm est transmise au navigateur.

## Deux modes d'intégration

| Jeu | Mode | Clé | Chemin d'un achat |
|---|---|---|---|
| **Crystal Clash** (`gam_crystal`) | Jeu avec serveur (webhook) | secrète, sur le serveur du jeu | Dev AppStore → `POST /devappstore/webhook` (signé) → inventaire en mémoire (idempotent par `delivery_id`) → poussé à la page du jeu (SSE `/api/events`) → ack API (clé secrète) en tâche de fond |
| **Pixel Farm** (`gam_farm`) | Jeu sans serveur (SDK client) | publique `das_pub_…` + jeton joueur | La page du jeu importe `@devappstore/sdk` (`/sdk/index.js`, transpilé à la volée) et appelle Dev AppStore directement (CORS) → liaison par code → `waitForLink` reçoit le jeton joueur (localStorage) → `onPurchase` (flux SSE + rattrapage, achats de CE joueur uniquement) → crédit local → ack automatique |

Remboursements (`purchase.refunded`) : les deux jeux retirent exactement ce que la commande (`order_id`) avait crédité,
et ignorent le remboursement d'une commande jamais créditée.

## Parcours de démonstration

1. Ouvrez http://localhost:4100, choisissez le jeu et le joueur (ex. **Ali · #2PP8QL9 · niv. 42**).
2. Dans le téléphone : **Paramètres → Lier mon compte web** affiche un code (via le serveur du jeu pour Crystal, via le SDK
   et la clé publique pour Farm).
3. Connecté sur Dev AppStore (joueur@devappstore.test), saisissez le code sur `/games/<slug>/link`
   (Crystal accepte aussi la liaison par ID : saisissez `#2PP8QL9`, Dev AppStore appelle `GET /devappstore/players/%232PP8QL9`).
   Pixel Farm reçoit alors son jeton joueur (« Cet appareil est lié ») : sans lui, il ne peut lire aucun achat.
4. Achetez un article sur la boutique Dev AppStore : les compteurs gemmes / or / graines s'animent dans le jeu, sans recharger.
   « Délier cet appareil » (Pixel Farm) révoque le jeton.

Hors ligne, le bouton **Simuler un achat** (Crystal) envoie au serveur du jeu un webhook signé comme le ferait Dev AppStore.

## Points d'entrée

| Route | Rôle |
|---|---|
| `GET /` | page du jeu (HTML/JS, `public/`) |
| `GET /devappstore/players/{id}` | player lookup → `PlayerLookupResponse` ; si `DevAppStore-Signature` est présente, elle doit signer l'ID brut |
| `POST /devappstore/webhook` | webhook Dev AppStore : 401 si signature invalide, 400 si événement d'un autre jeu, 200 `{ ok, duplicate }` |
| `GET /api/config`, `/api/state`, `/api/events` | configuration, inventaire et flux du client du jeu |
| `POST /api/link-code` | code de liaison demandé par le serveur du jeu avec sa clé secrète (Crystal) |
| `POST /api/dev/simulate` | achat fictif signé (démo hors ligne) |
| `GET`/`POST`/`DELETE /proxy/api/v1/*` | relais facultatif vers Dev AppStore (même origine), jeton joueur compris |
| `GET /sdk/*.js` | `@devappstore/sdk` en modules ES pour le navigateur |

Tests : `npm test -w @devappstore/demo-game` (signature, idempotence, lookup, flux, proxy SDK de bout en bout).
