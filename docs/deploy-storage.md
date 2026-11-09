# Stockage des fichiers : Cloudflare R2 (ou tout S3 compatible)

Complète `docs/deploy.md` § 5. En production (Vercel), le disque des fonctions est éphémère : les images
téléversées (icônes, bannières, visuels d'articles) doivent aller dans un stockage objet. Dev AppStore fournit
l'adaptateur `apps/web/src/server/storage-s3.ts`, activé par `DEVAPPSTORE_STORAGE=s3`.

## Fonctionnement

| Étape | Détail |
|---|---|
| Téléversement | Le navigateur envoie l'image à `POST /api/uploads` (jamais directement au bucket). Le serveur la redimensionne en WebP (`image-upload.ts`) puis l'écrit dans le bucket par un `PUT` signé **AWS SigV4** (adressage *path-style* `<S3_ENDPOINT>/<S3_BUCKET>/<clé>`). |
| En-têtes stockés | `Content-Type: image/webp` et `Cache-Control: public, max-age=31536000, immutable` : chaque clé contient un UUID, un fichier n'est jamais réécrit. |
| URL renvoyée | `<S3_PUBLIC_URL>/<clé>` (ex. `https://cdn.devappstore.eu/item/usr_x/1b2c….webp`), enregistrée en base et servie directement par le CDN Cloudflare. `/api/uploads/[...key]` n'est plus sollicité (il relit le bucket par un `GET` signé si une ancienne URL y pointe encore). |
| Suppression | `S3Storage.delete(clé)` (`DELETE` signé, idempotent). |

Le jeton R2 n'a donc besoin que des droits **lecture + écriture d'objets** sur ce seul bucket, et aucune règle CORS
n'est nécessaire pour l'upload.

## Variables

| Variable | Exemple R2 | Rôle |
|---|---|---|
| `DEVAPPSTORE_STORAGE` | `s3` | `local` (défaut, disque `.data/uploads`) ou `s3` |
| `S3_ENDPOINT` | `https://<account_id>.eu.r2.cloudflarestorage.com` | Point d'accès S3 (sans le nom du bucket). Juridiction EU → sous-domaine `.eu.` |
| `S3_REGION` | `auto` | Région de signature. `auto` pour R2 (défaut) ; région réelle pour AWS S3 (`eu-west-3`) |
| `S3_BUCKET` | `devappstore-uploads` | Nom du bucket |
| `S3_ACCESS_KEY_ID` | — | *Access Key ID* du jeton d'API R2 |
| `S3_SECRET_ACCESS_KEY` | — | *Secret Access Key* du jeton (secret : variable chiffrée Vercel) |
| `S3_PUBLIC_URL` | `https://cdn.devappstore.eu` | URL publique du bucket ou du CDN, sans `/` final |
| `NEXT_PUBLIC_S3_PUBLIC_URL` | `https://cdn.devappstore.eu` | **Même valeur** que `S3_PUBLIC_URL` (https). Les composants de boutique, rendus aussi dans le navigateur, n'affichent une image absolue que si elle est sous cette base et au format de clé des uploads (`<kind>/<uploadeur>/<id>.webp`, `safeImageUrl` dans `style-safety.ts`) ; toute autre URL (pistage) est ignorée. Injectée au build : reconstruire après un changement. Vérifiée au démarrage en production. |

## 1. Créer le bucket R2

1. Tableau de bord Cloudflare → **R2 Object Storage** → *Create bucket*.
2. Nom : `devappstore-uploads` ; **Location** : *Specify jurisdiction* → **European Union (EU)** (RGPD, cf.
   `docs/legal/rgpd.md` § 4). La juridiction ne peut pas être changée après coup.
3. Classe de stockage : *Standard*.
4. Pour la préproduction, créer un second bucket (`devappstore-uploads-staging`) avec son propre jeton.

En ligne de commande (équivalent) :

```bash
npx wrangler r2 bucket create devappstore-uploads --jurisdiction eu
```

## 2. Jeton d'API (clés S3)

1. R2 → **Manage R2 API Tokens** → *Create API token*.
2. Permissions : **Object Read & Write** ; *Specify bucket(s)* → `devappstore-uploads` uniquement.
3. TTL : illimité (ou rotation planifiée, voir plus bas) ; filtrage IP facultatif (Vercel n'a pas d'IP fixe).
4. Copier l'*Access Key ID* → `S3_ACCESS_KEY_ID`, le *Secret Access Key* → `S3_SECRET_ACCESS_KEY`, et l'endpoint
   *S3 API* affiché pour la juridiction EU (`https://<account_id>.eu.r2.cloudflarestorage.com`) → `S3_ENDPOINT`.

Ne jamais utiliser un jeton « Admin Read & Write » (il permet de créer/supprimer des buckets).

## 3. Domaine public

Les images doivent être lisibles sans authentification. Deux options :

- **Domaine personnalisé (recommandé)** : bucket → *Settings* → *Public access* → *Custom Domains* → *Connect
  Domain* → `cdn.<votre-domaine>` (la zone DNS doit être gérée par Cloudflare ; l'enregistrement est créé
  automatiquement). Bénéficie du cache Cloudflare, des règles WAF et de l'Image Resizing.
  → `S3_PUBLIC_URL=https://cdn.<votre-domaine>`.
- **Sous-domaine `r2.dev`** : *Public Development URL* → *Allow Access*. Limité en débit, sans cache : réservé aux
  tests. → `S3_PUBLIC_URL=https://pub-<hash>.r2.dev`.

Cache : les objets portent déjà `Cache-Control: … immutable`. Dans *Caching* → *Cache Rules* de la zone, une règle
« Eligible for cache » sur `cdn.<domaine>` suffit ; ne pas surcharger le TTL navigateur.

Sécurité conseillée sur le domaine CDN (règle *Transform* → en-têtes de réponse) :
`X-Content-Type-Options: nosniff`. Le bucket ne contient que du WebP produit par le serveur (aucun SVG/HTML).

## 4. CORS

Non requis pour le fonctionnement actuel (upload côté serveur, images affichées par `<img>`). À ajouter seulement
si un client lit les images par `fetch()` / canvas depuis une autre origine (ex. jeu WebGL) : bucket → *Settings* →
*CORS Policy* :

```json
[
  {
    "AllowedOrigins": ["https://devappstore.eu", "https://www.devappstore.eu"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

Ne jamais autoriser `PUT`/`POST`/`DELETE` en CORS : les écritures passent exclusivement par le serveur.

## 5. Configurer et vérifier

1. Renseigner les variables ci-dessus (Vercel → *Settings* → *Environment Variables*, portée *Production* ; secrets
   en *Sensitive*), puis redéployer.
2. Vérifier depuis un poste disposant des mêmes variables (fichier `.env` à la racine ou dans `apps/web`) :

   ```bash
   cd apps/web && npm run check:storage
   ```

   Le script écrit un PNG 1×1 sous `_healthcheck/`, le relit (signé puis via l'URL publique : contenu,
   `Content-Type`, `Cache-Control`), le supprime et vérifie qu'il a disparu. Code de sortie ≠ 0 au premier échec.
3. Dans l'application : Studio → modifier l'icône d'un jeu → l'URL de l'image doit commencer par `S3_PUBLIC_URL`.

## Autres fournisseurs S3

| Fournisseur | `S3_ENDPOINT` | `S3_REGION` | `S3_PUBLIC_URL` |
|---|---|---|---|
| AWS S3 | `https://s3.eu-west-3.amazonaws.com` | `eu-west-3` | CloudFront ou `https://<bucket>.s3.eu-west-3.amazonaws.com` |
| Scaleway | `https://s3.fr-par.scw.cloud` | `fr-par` | `https://<bucket>.s3.fr-par.scw.cloud` |
| MinIO (dev) | `http://localhost:9000` | `us-east-1` | `http://localhost:9000/<bucket>` (bucket en lecture anonyme) |

## Dépannage

| Symptôme (`check:storage`) | Cause probable |
|---|---|
| `variables manquantes : …` | Variable absente de l'environnement / du `.env` |
| `HTTP 403 (SignatureDoesNotMatch)` | Secret erroné, `S3_REGION` incorrecte (AWS), ou endpoint qui inclut déjà le bucket |
| `HTTP 403 (AccessDenied)` | Jeton limité à un autre bucket ou en lecture seule |
| `HTTP 404 (NoSuchBucket)` | `S3_BUCKET` faux, ou endpoint sans `.eu.` pour un bucket en juridiction EU |
| URL publique en 401/403/404 | Accès public non activé ou domaine personnalisé pas encore actif ; `S3_PUBLIC_URL` ne pointe pas sur ce bucket |
| Cache-Control absent sur l'URL publique | Règle de cache/Transform Cloudflare qui réécrit l'en-tête |

## Rotation des clés

Créer un nouveau jeton, mettre à jour `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`, redéployer, lancer
`check:storage`, puis révoquer l'ancien jeton. Les URL publiques ne changent pas.

## Migration des fichiers locaux existants

Les images déjà téléversées en mode `local` ont des URL `/api/uploads/<clé>`. Les copier à l'identique dans le bucket
(`rclone copy .data/uploads r2:devappstore-uploads`) : elles restent servies par `/api/uploads/[...key]`, qui relit alors
le bucket. Les nouvelles images utilisent directement l'URL CDN.
