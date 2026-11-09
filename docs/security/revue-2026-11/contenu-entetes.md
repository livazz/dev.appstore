# Revue de sécurité 2026-11 — uploads, contenu studio, en-têtes HTTP, journaux, dépendances

- **Périmètre** : sections 9, 10 et 11 de `docs/security/review-checklist.md` ; menaces 6.5 (T-UPL-*) et 6.7 (T-PLT-*) de `docs/security/threat-model.md`.
- **Code lu** : `/api/uploads` (POST, GET), `server/image-upload.ts`, `server/storage.ts`, `server/storage-s3.ts`, `components/store/style-safety.ts` et ses consommateurs (ItemCard, StorePanel, GameStore, GameCard, recherche, pages joueur), `server/studio-logic.ts` (schémas zod), `server/ai-style-*.ts` + `packages/ai-style`, `server/import-*.ts` + `packages/importers`, `packages/emails` (gabarits, échappement, transports), `middleware.ts`, `lib/security-headers.ts`, `next.config.ts`, `robots.ts`, `sitemap.ts`, `lib/seo.ts`, appels `console.*`, `npm audit`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml`.
- **Base** : `main` au commit `9f336f1` (vagues 1 à 6 fusionnées).
- **Méthode** : lecture du code ; un test d'exploitation jetable pour le constat C-01 (supprimé après exécution, extrait ci-dessous). Les constats marqués « plausible » n'ont pas été reproduits.
- Le code de l'application n'a pas été modifié.

## Synthèse

| ID | Gravité | Titre | Statut |
|---|---|---|---|
| C-01 | **Haute** | SSRF avec lecture partielle de la réponse via `token_uri` du compte de service Google Play | Vérifié (PoC) |
| C-02 | Moyenne | Transport e-mail « console » en production : liens de réinitialisation et de vérification écrits dans les journaux et sur disque | Vérifié (lecture) |
| C-03 | Moyenne | `POST /api/uploads` sans limitation de débit ni quota : saturation mémoire/CPU (décodage jusqu'à 40 Mpx) et remplissage du stockage | Vérifié (lecture) |
| C-04 | Moyenne | Les `data:image/…` (dont SVG) de 500 Ko sont acceptés en production pour `iconUrl`/`bannerUrl`/`models[].imageUrl` : contenu non ré-encodé ni modéré, pages publiques alourdies | Vérifié (lecture + test existant) |
| C-05 | Basse | `avatar_url` renvoyée par le serveur du studio affichée telle quelle (`img-src https:`) : pistage de l'IP du joueur | Vérifié (lecture) |
| C-06 | Basse | `safeImageUrl` accepte n'importe quel chemin relatif du site ; plusieurs pages rendent `iconUrl` sans `safeImageUrl` | Vérifié (lecture) |
| C-07 | Basse | Format HEIF accepté par l'upload (hors liste blanche de la checklist) | Vérifié (lecture) |
| C-08 | Basse | Pas de CSP sur les pages dont le chemin se termine par une extension (`.png`, `.txt`, `.xml`…) | Vérifié (lecture) |
| C-09 | Basse | `bodySizeLimit: '9mb'` appliqué à **toutes** les Server Actions | Vérifié (lecture) |
| C-10 | Basse | CI : pas de bloc `permissions:` (jeton `GITHUB_TOKEN` aux droits par défaut), actions non épinglées par SHA | Vérifié (lecture) |
| C-11 | Basse | docker-compose de dev : Postgres publié sur toutes les interfaces avec un mot de passe trivial | Vérifié (lecture) |
| C-12 | Info | `npm audit --omit=dev` : 4 vulnérabilités modérées (esbuild via drizzle-kit), non exploitables en production | Vérifié |

Aucun XSS stocké trouvé : SVG refusé à l'upload, ré-encodage WebP systématique, couleurs filtrées à l'écriture (zod) **et** au rendu (`safeColor`), aucun `dangerouslySetInnerHTML`, `href` dynamiques tous internes, e-mails échappés par gabarit. Aucune traversée de chemin : clé générée côté serveur et regex stricte en lecture et en écriture.

---

## Constats détaillés

### C-01 — Haute — SSRF via `token_uri` du compte de service Google Play

**Où**
- `packages/importers/src/google/auth.ts:42` (`aud: sa.token_uri ?? GOOGLE_TOKEN_URI`) et `:66` (`requestJson('google_oauth', sa.token_uri ?? GOOGLE_TOKEN_URI, { method: 'POST', … })`).
- `apps/web/src/server/import-logic.ts:81-92` : le schéma `googlePlayCredentialsSchema` ne valide que `client_email` et `private_key` ; `:131-139` : `token_uri` est **conservé** tel quel dans les identifiants chiffrés.
- `packages/importers/src/http.ts:47` : `fetch` sans `redirect: 'manual'`, sans délai, sans plafond de taille ; `:11` : le message d'erreur inclut `body.slice(0, 300)`.
- `packages/importers/src/index.ts:59` puis `apps/web/src/server/import-logic.ts:391` : ce message est renvoyé tel quel au navigateur du studio (`StudioError`) et stocké dans `import_runs.error`.

**Scénario**
1. L'attaquant crée un compte studio (inscription libre `/studio/signup`), puis un jeu (rôle owner).
2. Page « Importer depuis les stores » → Google Play : il colle un JSON de compte de service contenant une clé RSA qu'il a générée lui-même (seule sa lisibilité est vérifiée), un `client_email` quelconque et `"token_uri": "https://attaquant.tld/r"`.
3. « Récupérer le catalogue » : le serveur Dev AppStore envoie un POST vers `https://attaquant.tld/r`, qui répond `302 Location: http://169.254.169.254/latest/meta-data/iam/security-credentials/` (ou toute adresse interne : `http://127.0.0.1:…`, `http://db:5432`, service interne du VPC).
4. `fetch` suit la redirection (POST → GET sur 302/303) et lit la réponse interne :
   - réponse non-2xx : les **300 premiers caractères** du corps reviennent au studio dans le message d'erreur ;
   - réponse 2xx non JSON : le `SyntaxError` de `res.json()` renvoie les ~10 premiers caractères (`Unexpected token 'S', "SECRET_INT"... is not valid JSON`).
   L'attaquant peut aussi viser directement une URL `http://` interne (aucune restriction de schéma ni d'hôte).
5. Effets annexes : un serveur qui ne répond jamais bloque la Server Action (pas de délai) ; une réponse de plusieurs Go est lue entièrement en mémoire (`res.text()` / `res.json()`), soit un déni de service.

**Preuve (test jetable exécuté puis supprimé)** — deux serveurs locaux : « attaquant » qui redirige, « interne » qui renvoie un secret. Résultat : la requête GET atteint le service interne et son corps apparaît dans `warnings[0].message`.

```ts
// packages/importers/src/zz-ssrf-poc.test.ts (supprimé)
const internal = createServer((req, res) => { res.writeHead(403); res.end(`SECRET_INTERNE method=${req.method} path=${req.url}`); });
const evil = createServer((_req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${ip}/latest/meta-data/iam/` }); res.end(); });
const sa = JSON.stringify({ client_email: 'x@y.iam.gserviceaccount.com', private_key: rsaPem, token_uri: `http://127.0.0.1:${ep}/token` });
const r = await importCatalog({ googlePlay: { serviceAccount: sa, packageName: 'com.a.b' } });
expect(JSON.stringify(r.warnings)).toContain('SECRET_INTERNE'); // ✅ passe (corps interne renvoyé)
// Avec une réponse interne 200 text/plain : message = `Unexpected token 'S', "SECRET_INT"... is not valid JSON`
```

**Correctif proposé**
1. Ignorer `token_uri` : toujours utiliser `GOOGLE_TOKEN_URI` (dans `fetchGoogleAccessToken` et dans `aud`), ou refuser à l'enregistrement toute valeur différente de `https://oauth2.googleapis.com/token` (zod `z.literal(GOOGLE_TOKEN_URI).optional()` dans `googlePlayCredentialsSchema`) et ne plus la stocker.
2. Durcir `requestJson` (défense en profondeur, s'applique aussi à `links.next` d'Apple) : `redirect: 'error'`, `AbortSignal.timeout(15_000)`, plafond de taille du corps (lecture en flux, ex. 5 Mo), et hôte autorisé par service (`api.appstoreconnect.apple.com`, `oauth2.googleapis.com`, `androidpublisher.googleapis.com`) vérifié avant chaque requête, y compris pour `links.next`.
3. Ne plus renvoyer le corps de réponse distant au navigateur : message générique (« Google Play a refusé l'authentification (HTTP 401) ») ; garder le détail tronqué côté serveur uniquement.

**Tests de non-régression**
- `import-logic.test.ts` : `saveStoreCredentials` avec `token_uri: 'http://127.0.0.1/x'` → `StudioError` (ou valeur ignorée et non stockée).
- `importers/google/importer.test.ts` : `fetchGoogleAccessToken` avec un `token_uri` arbitraire → la requête part vers `oauth2.googleapis.com` (vérifier l'URL appelée par le `fetch` simulé).
- `importers/http.test.ts` : réponse 302 → erreur sans suivre ; réponse lente → délai dépassé ; corps > plafond → erreur ; le message de `StoreApiError` exposé à l'utilisateur ne contient pas le corps.

---

### C-02 — Moyenne — Transport e-mail « console » en production

**Où** : `packages/emails/src/mailer/index.ts:19,28-32` (repli sur `console` si `RESEND_API_KEY` est absente, simple `console.warn` en production) ; `packages/emails/src/mailer/console.ts:24,33-50` (écrit le texte complet dans `console.info` et une copie HTML/texte dans `.data/mails`) ; `packages/emails/src/templates/auth.ts:31,48` (les e-mails de vérification et de réinitialisation contiennent l'URL avec le jeton). `apps/web/src/env.ts:93` : `RESEND_API_KEY` facultative, aucune règle de production (contrairement à `DATABASE_URL`, `CRON_SECRET`…).

**Scénario** : déploiement sans `RESEND_API_KEY` (oubli, rotation, faute de frappe). Tous les liens de réinitialisation de mot de passe sont écrits dans les journaux de la plateforme (Vercel, Datadog…, souvent accessibles à plus de personnes que la base) et dans `.data/mails/*.txt`. Quiconque lit les journaux déclenche « mot de passe oublié » pour un compte (studio owner, admin) et récupère le lien : prise de contrôle du compte. Les reçus (e-mail, achats) y sont aussi : données personnelles.

**Correctif proposé** : dans `validateEnv` (production), exiger `RESEND_API_KEY` sauf si `MAIL_TRANSPORT=console` est posé explicitement ; dans `createConsoleMailer`, en production, ne journaliser que destinataire masqué + objet (jamais `message.text`) et désactiver l'écriture sur disque par défaut.

**Tests** : `env.test.ts` — production sans `RESEND_API_KEY` ni `MAIL_TRANSPORT` → échec de validation ; `mailer.test.ts` — `createMailerFromEnv({ NODE_ENV: 'production', MAIL_TRANSPORT: 'console' })` puis envoi d'un e-mail de réinitialisation → la sortie `log` ne contient pas l'URL / le jeton.

---

### C-03 — Moyenne — Upload sans limitation de débit ni quota

**Où** : `apps/web/src/app/api/uploads/route.ts:23-51` (aucun appel au limiteur de `server/rate-limit.ts`) ; `apps/web/src/server/image-upload.ts:10,43-51` (jusqu'à 40 Mpx décodés et redimensionnés par requête, ≈ 160 Mo de pixels RGBA) ; `:71` (fichier écrit à chaque appel, jamais rattaché à une ligne en base ni supprimé).

**Scénario** : un compte studio (inscription libre) envoie en parallèle des PNG de 5 Mo annonçant 6 300 × 6 300 px (sous la limite de 40 Mpx). Chaque requête décode ~160 Mo : quelques dizaines de requêtes simultanées saturent la mémoire de l'instance (OOM, redémarrages) et le CPU (sharp). En boucle, des WebP valides de quelques Ko remplissent le disque local (`.data/uploads`) ou font gonfler la facture S3/R2 ; ces fichiers orphelins ne sont jamais purgés. T-UPL-04 demande explicitement une limitation de débit.

**Correctif proposé** : limiteur partagé (`getRateLimitStore()`), par utilisateur et par IP, ex. 30 uploads / 10 min et 200 / jour par studio, réponse 429 + `Retry-After` ; abaisser `MAX_INPUT_PIXELS` (une icône de 300 px ou une bannière de 1 600 px n'a pas besoin de 40 Mpx : 16 Mpx suffisent) ; `sharp.concurrency(…)` / sémaphore de 2 décodages simultanés par instance ; table `uploads` (clé, studio, auteur, date) pour quotas et purge des fichiers non référencés.

**Tests** : `route.test.ts` — N+1 uploads du même utilisateur dans la fenêtre → 429 avec `Retry-After` ; image de 20 Mpx → 413 si la limite est abaissée.

---

### C-04 — Moyenne — `data:image/…` (dont SVG, 500 Ko) acceptés en production

**Où** : `apps/web/src/server/studio-logic.ts:39` (`DATA_IMAGE_RE` accepte `png|jpeg|webp|gif|avif|svg+xml`) et `:49-52` (`max(500_000)`) ; `apps/web/src/components/store/style-safety.ts:67,107` (rendu accepté) ; test existant `studio-tenancy.test.ts:233` qui enregistre `bannerUrl: 'data:image/svg+xml;…'` avec succès.

**Scénario** : le modèle de menaces (T-UPL-05) et CHK-UPL-07 limitent les `data:` aux **visuels du seed en développement**. En production, un studio contourne le pipeline d'upload : l'image n'est ni ré-encodée ni rattachée à son auteur (pas de contrôle multi-tenant `assertUploadsBelongToGameStudio`), n'est pas visible comme fichier pour une modération, et un SVG arbitraire est stocké en base. Rendu dans `<img>`, un SVG n'exécute pas de script ni ne charge de ressource externe : **pas de XSS** (vérifié par lecture : seuls des `<img src>` consomment ces valeurs). En revanche, 500 Ko par champ (icône + bannière + 3 visuels par article) sont injectés dans le HTML **et** dans la charge RSC de chaque page publique (accueil, recherche, boutique) : pages de plusieurs Mo, coût de bande passante, dégradation pour les joueurs sur mobile.

**Correctif proposé** : n'accepter les `data:` qu'en dehors de la production (`env.isProduction`) ou les refuser totalement à l'écriture et convertir les visuels du seed en fichiers servis par `/api/uploads` ou `public/` ; si conservés, exclure `svg+xml` et plafonner à ~50 Ko. Côté rendu, `safeImageUrl` peut refuser les `data:` en production.

**Tests** : `studio-logic.test.ts` — en production, `iconUrl: 'data:image/svg+xml,…'` et `data:image/png;base64,…` → refus ; `style-safety.test.ts` — `safeImageUrl('data:image/svg+xml,…')` → `null` (si le refus au rendu est retenu).

---

### C-05 — Basse — `avatar_url` du lookup affichée sans proxy

**Où** : `apps/web/src/server/linking.ts:474` (toute URL `http(s)` de 2 048 caractères acceptée) ; `apps/web/src/app/(player)/games/[slug]/link/IdConfirmForm.tsx:23` (`<img src={player.avatar_url} referrerPolicy="no-referrer">`) ; `apps/web/src/lib/security-headers.ts:54` (`img-src … https:`, assumé dans le commentaire l. 14-16).

**Scénario** : le serveur de lookup d'un studio renvoie `avatar_url: "https://pistage.tld/p?id=…"` ; le navigateur du joueur charge l'image depuis ce tiers (IP, User-Agent, heure). Le `Referer` est bien supprimé. Impact limité (le studio voit déjà l'IP du joueur dans son jeu), mais T-UPL-05 demande « `avatar_url` proxifiée ou ignorée », et `img-src https:` ouvre toutes les origines à toutes les pages.

**Correctif proposé** : proxifier (`/api/avatar?u=…` qui télécharge via `safeHttpGet`, ré-encode avec sharp et sert avec les en-têtes d'upload) ou ignorer l'avatar ; puis restreindre `img-src` à `'self' data: blob:` + l'origine `NEXT_PUBLIC_S3_PUBLIC_URL`.

**Tests** : `security-headers.test.ts` — `img-src` ne contient plus `https:` ; test du composant / de l'action — une `avatar_url` tierce n'est pas rendue telle quelle.

---

### C-06 — Basse — Défense en profondeur incomplète sur les URL d'images au rendu

**Où** : `apps/web/src/components/store/style-safety.ts:106` (tout chemin `/…` accepté, ex. `/api/auth/sign-out`, `/studio/...`) ; rendus sans `safeImageUrl` : `app/(player)/account/page.tsx:58`, `account/purchases/page.tsx:105`, `account/points/page.tsx:147`, `games/[slug]/link/page.tsx:50`, `components/checkout/OrderSummary.tsx:14`, `app/studio/page.tsx:44`, `app/admin/games/page.tsx:60`.

**Scénario** (plausible, nécessite une valeur écrite hors zod : migration, import, édition SQL) : `iconUrl = "https://pistage.tld/x"` rendu tel quel sur ces pages, y compris dans l'admin ; ou un chemin relatif d'action GET déclenché par `<img>`. L'écriture étant validée par `imageUrlSchema`, pas d'exploitation directe trouvée.

**Correctif proposé** : `safeImageUrl` n'accepte que `^/api/uploads/<clé valide>$` pour les chemins relatifs (même regex que `S3_UPLOAD_KEY_RE`) ; l'utiliser partout où une image studio est rendue (composant `<StudioImage>` unique).

**Tests** : `style-safety.test.ts` — `safeImageUrl('/api/auth/sign-out')` et `safeImageUrl('/studio')` → `null` ; `safeImageUrl('/api/uploads/icon/usr_x/abc.webp')` → conservée.

---

### C-07 — Basse — HEIF accepté à l'upload

**Où** : `apps/web/src/server/image-upload.ts:12` (`SHARP_FORMATS` contient `heif`). CHK-UPL-02 fixe la liste blanche PNG/JPEG/WebP(/GIF). HEIF/AVIF ajoute la surface d'attaque de libheif (historique de CVE de décodage) sans besoin fonctionnel identifié.

**Correctif** : retirer `heif` (ou le justifier et suivre les mises à jour de sharp). **Test** : `uploads.test.ts` — un AVIF/HEIC → 415.

---

### C-08 — Basse — Pages sans CSP si le chemin se termine par une extension

**Où** : `apps/web/src/middleware.ts:31` : l'exclusion `.*\.(?:png|jpe?g|gif|svg|webp|avif|ico|txt|xml|webmanifest|woff2?)$` porte sur **tout** chemin, pas seulement sur `public/`. Ex. `/games/crystal-clash.png`, `/docs/x.txt` : la page (ici la 404) est rendue par l'App Router sans CSP et sans nonce. Aucun contenu contrôlé par l'attaquant n'a été trouvé dans ces réponses : défense en profondeur uniquement.

**Correctif** : limiter l'exclusion aux fichiers réellement présents (lister les noms de `public/`, ou préfixer les fichiers statiques par un dossier dédié), ou poser une CSP stricte par défaut dans `next.config.ts` pour les chemins exclus. **Test** : `middleware.test.ts` — `/games/x.png` reçoit une CSP.

---

### C-09 — Basse — Limite de 9 Mo sur toutes les Server Actions

**Où** : `apps/web/next.config.ts:20` (`experimental.serverActions.bodySizeLimit: '9mb'`), motivée par la seule IA de style. Toute Server Action (y compris celles accessibles à un joueur connecté) accepte 9 Mo, ce qui amplifie les abus (parsing, mémoire) au-delà du besoin.

**Correctif** : revenir à 1 Mo et faire passer la capture de l'IA de style par une route handler dédiée avec `readBodyCapped` (comme `/api/uploads`), ou s'assurer que le navigateur réduit toujours la capture sous 1 Mo. **Test** : envoi d'un corps de 2 Mo à une action quelconque → 413.

---

### C-10 — Basse — CI sans `permissions:`

**Où** : `.github/workflows/ci.yml` (aucun bloc `permissions`, `actions/checkout@v4` / `actions/setup-node@v4` épinglées par étiquette). Pas de `pull_request_target` (OK).

**Correctif** : `permissions: { contents: read }` au niveau du workflow ; épingler les actions par SHA ; Dependabot (npm + actions). **Test** : contrôle statique (ex. test vitest qui lit `ci.yml` et vérifie la présence de `permissions:`), ou revue.

---

### C-11 — Basse — docker-compose de développement

**Où** : `docker-compose.yml:35-36` (`"5432:5432"` publié sur toutes les interfaces, mot de passe `devappstore`) ; `:24` `AUTH_SECRET` de démo. Le fichier est clairement marqué « NE PAS utiliser en production » et `.dockerignore` exclut bien `.env`, `.data`, `.git`.

**Correctif** : `"127.0.0.1:5432:5432"` (et `127.0.0.1:3000`/`4100`). Pas de test nécessaire.

Le `Dockerfile` est sain : multi-étapes, image d'exécution réduite à la sortie standalone, utilisateur `node`, aucun secret en `ARG`/`ENV` (seule la clé publiable Stripe). Améliorations mineures : épingler l'image de base par digest ; `packages/emails/package.json` n'est pas copié dans l'étape `deps` (sans impact sécurité, à vérifier côté build).

---

### C-12 — Info — `npm audit`

`npm audit --omit=dev` (2026-11-10) : 0 critique, 0 haute, **4 modérées**, toutes issues de `esbuild ≤ 0.24.2` (GHSA-67mh-4wv8-2f99, serveur de dev d'esbuild) tiré par `drizzle-kit` via `@esbuild-kit/*`. `drizzle-kit` est une dépendance de production de `packages/db` (étape `migrator`), mais n'ouvre jamais le serveur de dev d'esbuild : **non exploitable**. Arbre complet : 10 modérées, aucune haute. Versions clés : `next@15.5.29`, `better-auth@1.7.18`, `sharp@0.35.5`. Suivre la sortie de drizzle-kit 1.x stable.

---

## Points vérifiés sans constat

- **Uploads** : authentification + rôle owner/admin/developer (`route.ts:25-30`), anti-CSRF `Origin`/`Sec-Fetch-Site` (`image-upload.ts:115-126`), corps plafonné en flux (`readBodyCapped`), type par octets via sharp, SVG/HTML/texte refusés, contrôle des dimensions sur l'en-tête avant décodage, `limitInputPixels` au décodage, ré-encodage WebP (EXIF/ICC supprimés, première image d'un GIF animé), clé `kind/uploadeur/uuid.webp` générée côté serveur.
- **Lecture** : `isSafeKey` (regex stricte, 256 caractères max) + `path.resolve` + préfixe racine (`storage.ts:79-84`), octets WebP revérifiés avant service, en-têtes `Content-Type: image/webp`, `nosniff`, `CSP default-src 'none'; sandbox`, `CORP same-site`, `Content-Disposition: inline`. Les paramètres Next sont décodés avant la regex : `%2e%2e`, `%2f`, `\`, `%00` sont refusés (tests `route.test.ts:147`).
- **S3/R2** : même validation de clé en `put`/`get`/`delete`, signature SigV4 locale, aucune clé ni signature journalisée (`S3StorageError` = opération + clé + code HTTP). À prévoir côté bucket/CDN : `X-Content-Type-Options: nosniff` et domaine distinct sans cookies (le contenu reste du WebP ré-encodé).
- **Multi-tenant des images** : `assertUploadsBelongToGameStudio` (`studio-logic.ts:216-244`) empêche de rattacher l'upload d'un autre studio.
- **Styles** : couleurs `#RRGGBB`/`transparent`, nombres bornés, `layout ∈ 1..6`, `bgType` énuméré à l'écriture (`studio-logic.ts:36-80`) ; au rendu, `safeItemStyle`/`safeGradient`/`cardBackground` refiltrent tout (aucun `url(` possible).
- **Textes studio** : aucun `dangerouslySetInnerHTML`, aucun JSON-LD, `href` dynamiques tous construits côté serveur à partir de chemins internes ou de `slug` slugifiés.
- **IA de style** : réservée aux éditeurs du jeu, quota par studio réservé avant l'appel, capture ré-encodée par sharp (`limitInputPixels`), sortie du modèle traitée comme non fiable (`normalizeCardStyle` : hex, bornes, layout, textes nettoyés et tronqués), puis revalidée par `itemInputSchema` à l'enregistrement. Une injection de prompt via la capture ne peut produire qu'un style/texte valide pour le propre jeu de l'attaquant. Les erreurs de l'API ne renvoient au client que des messages génériques ; `console.error('[ai-style]', e)` journalise l'erreur du SDK (en-têtes de **réponse** seulement ; absence de la clé API « plausible », non vérifiée dans le code du SDK).
- **Importeurs** : identifiants chiffrés (AES-GCM avec AAD `gameId:source`), jamais renvoyés au navigateur (indice non secret) ; `appId`/`packageName` validés par regex et encodés dans l'URL ; pas d'archive ni de fichier binaire importé (JSON collé ≤ 20 000 caractères) : **aucun risque de ZIP bomb** ; titres importés repassent par `createItemFor` (zod). Seul défaut : C-01.
- **E-mails** : gabarit `html\`\`` échappant chaque interpolation (`& < > " ' \``), `safeUrl` (http/https uniquement), objet passé par `oneLine` puis refusé s'il contient `\r`/`\n` (`validateMessage`), adresses validées, `from` sans saut de ligne : pas d'injection HTML ni d'en-tête.
- **CSP des pages** : nonce par requête (16 octets), `'strict-dynamic'`, pas de `'unsafe-inline'` ni `'unsafe-eval'` pour les scripts en production, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'` + Stripe, `upgrade-insecure-requests`. API : `default-src 'none'`. En-têtes globaux : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `COOP same-origin`, HSTS 2 ans (prod), `poweredByHeader: false`. `style-src 'unsafe-inline'` est assumé (attributs `style` des boutiques).
- **robots/sitemap** : `robots.txt` interdit `/studio`, `/admin`, `/account`, `/api`, `/checkout` (et `/legal` tant que brouillon) ; le sitemap ne liste que les jeux `status = 'live'` et des pages publiques statiques — aucune page privée, aucun brouillon.
- **Journaux** : revue de tous les `console.*` d'`apps/web/src` et `packages/*/src` : aucun en-tête `Authorization`, cookie, clé API, secret de webhook ni corps de webhook Stripe journalisé ; les erreurs Stripe/paiement ne journalisent que `e.message` et des identifiants. Seul défaut : C-02 (e-mails). Next.js masque les messages d'erreur serveur en production ; les actions ne renvoient que des messages d'erreur métier (`StudioError`, `UploadError`, `AiStyleActionError`) — sauf le corps distant de C-01.

---

## Statut de la checklist

### Section 9 — Uploads et contenu studio

| ID | Résultat | Fichier:ligne | Commentaire |
|---|---|---|---|
| CHK-UPL-01 | **OK** (partiel) | `api/uploads/route.ts:25-30` | Auth + rôle studio + anti-CSRF. Fichier rattaché à l'**auteur** (segment de clé), pas au studio en base ; pas de limitation de débit → C-03. |
| CHK-UPL-02 | **OK** | `server/image-upload.ts:37-42` | Type par octets, SVG/HTML/polyglotte refusés (tests `route.test.ts:98`, `uploads.test.ts:32`). HEIF en plus de la liste → C-07. |
| CHK-UPL-03 | **OK** | `server/image-upload.ts:33,43-51` ; `route.ts:34` | Taille plafonnée en flux, dimensions vérifiées sur l'en-tête, `limitInputPixels`, ré-encodage. Limite de 40 Mpx élevée (C-03). |
| CHK-UPL-04 | **OK** | `server/image-upload.ts:71` | `randomUUID()` + `.webp` ; nom client jamais utilisé. |
| CHK-UPL-05 | **OK** | `server/storage.ts:30-35,79-84` ; `[...key]/route.ts:11` | Regex stricte + préfixe racine ; test `route.test.ts:147`. |
| CHK-UPL-06 | **OK** | `server/storage.ts:48-56` | Type forcé, nosniff, CSP sandbox, CORP, cache immuable ; test `route.test.ts:168`. Mode S3 : en-têtes à poser côté bucket/CDN. |
| CHK-UPL-07 | **KO** (partiel) | `server/studio-logic.ts:39,49-52` | URL tierces et `javascript:` refusées ; mais `data:` (dont SVG) accepté en production → C-04. `avatar_url` non proxifiée → C-05. |
| CHK-UPL-08 | **OK** | `server/studio-logic.ts:36-80` ; `style-safety.ts:22-65` | Double filtrage écriture + rendu ; test `style-safety.test.ts` (`url(https…)`). |
| CHK-UPL-09 | **OK** | — | Aucun `dangerouslySetInnerHTML` dans `apps/web/src` ; `href` dynamiques tous internes. |

### Section 10 — En-têtes, journaux, dépendances

| ID | Résultat | Fichier:ligne | Commentaire |
|---|---|---|---|
| CHK-HDR-01 | **OK** | `middleware.ts` ; `lib/security-headers.ts:44-94` | CSP à nonce + `strict-dynamic`, HSTS (prod), nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors 'none'`. Réserves : `img-src https:` (C-05), chemins à extension sans CSP (C-08). |
| CHK-LOG-01 | **KO** | `packages/emails/src/mailer/console.ts:33-50` ; `mailer/index.ts:28-32` | Aucun secret applicatif journalisé, sauf les liens à jeton des e-mails quand le transport console tourne en production → C-02. |
| CHK-LOG-02 | Non vérifiable ici | — | Hors périmètre de cette session (table d'audit admin : voir revue « auth »/« api »). |
| CHK-DEP-01 | **OK** | — | `npm audit --omit=dev` : 0 haute/critique ; 4 modérées non exploitables (C-12). |
| CHK-DEP-02 | **KO** | `.github/workflows/ci.yml` | Pas de `permissions: contents: read` → C-10. Pas de `pull_request_target` (OK). |

### Section 11 — Tests de sécurité exigés dans le dépôt

| Test exigé | Présent ? | Où |
|---|---|---|
| Accès croisé studio A / studio B (CHK-MT-03) | Présent | `server/studio-tenancy.test.ts`, `server/studio.test.ts`, `server/ai-style-action.test.ts` |
| Mass assignment (CHK-MT-05) | Présent | `server/studio-tenancy.test.ts`, `server/auth-security.test.ts` |
| API v1 sans clé / clé d'un autre jeu → 401/404 | Présent | `app/api/v1/v1-keys.test.ts`, `openapi-contract.test.ts` |
| Webhook Stripe non signé → 400 ; rejoué → une livraison | Présent | `app/api/stripe/webhook/route.test.ts` |
| Montant/devise incohérents → non payée | Présent | `app/api/stripe/webhook/route.test.ts` |
| Simulation refusée en production | Présent | `env.test.ts`, `app/api/checkout/route.test.ts`, `server/payments.test.ts` |
| `enqueueDelivery` sur `pending` ; concurrence | Présent (non relu en détail) | `app/api/checkout/route.test.ts`, `server/delivery*.test.ts` |
| Signature du webhook sortant (`verifySignature`) | Présent | `server/delivery-security.test.ts`, `server/delivery.test.ts` |
| Code de liaison concurrent | Présent (non relu en détail) | `server/linking.test.ts` |
| Validateur SSRF (IP interdites, redirection) | Présent pour livraison/lookup | `server/delivery-security.test.ts`, `server/linking.test.ts` — **manquant pour les importeurs** (C-01) |
| Upload SVG/HTML refusé ; clé traversante refusée | Présent | `app/api/uploads/route.test.ts:98,147`, `server/uploads.test.ts` |
| Nettoyage du paramètre `next` | Présent | `lib/auth/next-url.test.ts`, `server/auth.test.ts` |

Tests à ajouter (issus de ce rapport) : SSRF importeurs (C-01), e-mails console en production (C-02), limitation de débit des uploads (C-03), refus des `data:` en production (C-04), `img-src` sans `https:` (C-05), `safeImageUrl` sur chemins relatifs (C-06), HEIF refusé (C-07), CSP sur chemins à extension (C-08).

### Menaces 6.5 / 6.7 couvertes

| Menace | Statut |
|---|---|
| T-UPL-01 SVG/HTML → XSS | Traitée |
| T-UPL-02 Traversée | Traitée |
| T-UPL-03 Bombe de décompression | Traitée (seuil élevé, C-03) |
| T-UPL-04 Upload anonyme | Auth traitée ; **limitation de débit absente** (C-03) |
| T-UPL-05 URL d'images externes | Partielle (C-04, C-05, C-06) |
| T-UPL-06 Injection CSS | Traitée |
| T-UPL-07 XSS via textes | Traitée |
| T-PLT-03 En-têtes | Traitée (réserves C-05, C-08) |
| T-PLT-04 Secrets dans les logs | Partielle (C-02 ; corps distant renvoyé au client en C-01) |
| T-PLT-05 Chaîne d'approvisionnement | Partielle (C-10) |
