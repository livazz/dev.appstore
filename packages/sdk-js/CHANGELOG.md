# Changelog — @devappstore/sdk

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; versions [SemVer](https://semver.org/lang/fr/).

## [0.1.0] — première version publiée

### Ajouté

- `DevAppStore` : client pour le jeu (clé publique `das_pub_…` + jeton joueur) ou pour le serveur du studio
  (clé secrète `das_secret_…`).
  - Liaison : `requestLinkCode`, `getLinkRequest`, `waitForLink` (jeton joueur mémorisé dans `storage`), `unlink`.
  - Livraisons : `getPendingPurchases`, `onPurchase` (flux SSE lu via `fetch`, rattrapage au démarrage, à la
    reconnexion, au retour au premier plan et au retour du réseau ; reconnexion exponentielle ; dédoublonnage par
    `delivery_id` ; ack automatique après le handler), `ack`.
  - Événements `purchase.completed` et `purchase.refunded`.
  - Erreurs de l'API levées en `DevAppStoreError` (`status`, `code`, `message`).
- `@devappstore/sdk/server` : `verifyWebhookSignature`, `constructWebhookEvent`, `signWebhookPayload`
  (en-tête `DevAppStore-Signature: t=…,v1=…`, tolérance 5 min, plusieurs `v1` acceptés pour la rotation de secret).
- Paquet ESM + CommonJS avec déclarations TypeScript, sans dépendance, `sideEffects: false`.

Les versions internes antérieures (0.2.0 dans le monorepo) n'ont jamais été publiées ; les SDK Unity, Godot et Unreal
gardent leur propre numérotation.
