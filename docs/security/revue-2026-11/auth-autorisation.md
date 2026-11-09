# Revue de sécurité — authentification, session, autorisation multi-tenant, back-office, configuration

Revue du 10 novembre 2026, faite sur `main` @ `9f336f1` (vagues 1 à 6 fusionnées), sans modifier le code de l'application.

Périmètre : sections 1, 2 et 3 de [`../review-checklist.md`](../review-checklist.md) et §§ 6.1, 6.6, 6.7 de
[`../threat-model.md`](../threat-model.md). Fichiers lus : `apps/web/src/server/{auth,auth-config,auth-flows,auth-rate-limit,session,user-suspension,admin,admin-logic,studio,studio-logic,import-actions,ai-style-action,payouts,linking,delivery,player-tokens,analytics}.ts`,
`apps/web/src/env.ts`, `instrumentation.ts`, `middleware.ts`, `lib/auth/next-url.ts`, toutes les Server Actions
(`rg -l "use server"`), toutes les pages et routes de `app/studio/**` et `app/admin/**`, `app/api/{auth,checkout,uploads}`,
`packages/db/src/{index,seed,guards}.ts`, et le code de Better Auth 1.7.18 (liaison de comptes sociaux, IP du limiteur).

Méthode : lecture ciblée, plus deux **tests d'exploitation jetables** (vitest + `createTestDb()`), exécutés puis supprimés ;
leur code est reproduit ci-dessous. Aucun serveur n'a été lancé : les vérifications « curl » de la checklist sont faites
par lecture du code et notées comme telles.

## Synthèse

Aucun IDOR entre studios n'a été trouvé : chaque Server Action et route du studio appelle `requireGameAccess(gameId, rôles)`
dans sa propre exécution, et les sous-ressources (articles, livraisons, jetons joueur) sont bornées par `game_id`.
Le back-office exige un rôle de plateforme pour chaque action (404 sinon). La configuration de production est validée au
démarrage. Les constats portent surtout sur la **modération** (contournement d'une suspension, réactivation d'un admin par le
support) et sur la **robustesse de l'authentification** (pas de vérification d'e-mail ni de récupération de compte, limiteur
contournable, énumération à l'inscription).

| # | Gravité | Constat | Vérifié |
|---|---|---|---|
| A-01 | **Haute** | Le support peut réactiver un administrateur (y compris superadmin) désactivé par un superadmin | Test d'exploitation |
| A-02 | **Haute** | Une publication du studio concurrente d'une suspension admin écrase la suspension (`suspended` → `live`) | Test d'exploitation |
| A-03 | Moyenne | Le studio publie directement en ligne, sans revue (le statut `review` et l'approbation admin sont inaccessibles) | Lecture |
| A-04 | Moyenne | Aucune vérification d'e-mail ni réinitialisation de mot de passe : squat d'adresse, compte irrécupérable, pas de 2FA | Lecture + code Better Auth |
| A-05 | Moyenne | Limiteur des formulaires de connexion en mémoire par instance, IP lue dans la valeur la plus à gauche de `X-Forwarded-For`, et route HTTP Better Auth sans limite par e-mail | Lecture |
| A-06 | Moyenne | Le seed (superadmin `dev@devappstore.test` / `demo1234`) n'est refusé que si `NODE_ENV`/`VERCEL_ENV` = production, et rien ne refuse les comptes ou clés de démo à l'exécution | Lecture |
| A-07 | Basse | Énumération de comptes par l'inscription (message « Un compte existe déjà… », formulaire et `/api/auth/sign-up/email`) | Lecture |
| A-08 | Basse | Matrice des rôles : `developer` peut faire tourner le secret webhook et la clé secrète (la matrice dit « sauf rotation ») | Lecture |
| A-09 | Basse | Blocage d'un compte par un tiers : 8 échecs sur un e-mail bloquent sa connexion 15 min, quelle que soit l'IP | Lecture |
| A-10 | Basse | `SKIP_ENV_VALIDATION=1` désactive toute la validation de configuration en production (seul le secret de session reste contrôlé) | Lecture |
| A-11 | Basse | Pas de ré-authentification ni de durée de session réduite pour les actions sensibles (rotation de clé, versements, back-office) | Lecture |
| A-12 | Basse | Trous dans les tests d'accès croisé : actions d'intégration, d'import, de versements et d'IA de style | Lecture |
| A-13 | Basse (plausible) | `/api/auth/update-user` accepte un `name` sans la limite de 80 caractères du formulaire | Plausible |

---

## Constats détaillés

### A-01 — Haute — Le support réactive un administrateur désactivé (escalade vers superadmin)

- **Où** : `apps/web/src/server/admin.ts:369-385` (`enableUser`). Comparer avec `disableUser`, `admin.ts:348`, qui refuse
  d'agir sur un administrateur si l'auteur n'est pas superadmin.
- **Scénario** : un superadmin désactive un collègue (départ, compte compromis, superadmin malveillant). Un membre du rôle
  `support` (droit `users.disable`), complice ou lui-même compromis, appelle `userStatusAction` avec `intent=enable` et
  `userId=<admin désactivé>` (une Server Action est un endpoint public : il suffit de rejouer la requête avec son cookie).
  La suspension est supprimée et `getPlatformAdmin()` (`admin.ts:87-98`) rend aussitôt le rôle **superadmin** au compte.
  La page `/admin/users/[id]` masque le bouton (`protectedAdmin`, `app/admin/users/[id]/page.tsx:20`), mais le serveur ne vérifie rien.
- **Preuve** (test jetable, passé) :

  ```ts
  // en-tête et beforeAll repris de src/server/admin.test.ts (U.disabledAdmin = superadmin désactivé par U.super)
  it('le support réactive un superadmin désactivé par un superadmin', async () => {
    login(U.support);
    await admin.enableUser(U.disabledAdmin.id, 'réactivation par le support');
    expect(await h.db.select().from(userSuspensions).where(eq(userSuspensions.userId, U.disabledAdmin.id))).toHaveLength(0);
    login(U.disabledAdmin);
    await expect(admin.requirePlatformAdmin()).resolves.toMatchObject({ role: 'superadmin' }); // ✔ passe
  });
  ```
- **Correctif** : dans `enableUser`, charger la cible avec `leftJoin(platformAdmins)` comme dans `disableUser` et lever
  `AdminError('Seul un superadmin peut réactiver un administrateur de la plateforme.')` si `target.adminRole && admin.role !== 'superadmin'`.
  Interdire aussi de réactiver son propre compte (cas d'école, aujourd'hui impossible car un compte désactivé n'a pas de session).
- **Test de non-régression** (`admin.test.ts`) : `support` → `enableUser(U.disabledAdmin.id)` lève l'erreur, la suspension
  reste et rien n'est journalisé ; `super` → la réactivation réussit et est journalisée.

### A-02 — Haute — Une publication du studio peut écraser une suspension admin

- **Où** : `apps/web/src/server/studio-logic.ts:256-268` (`setGameStatus`). Le statut est lu (ligne 257), vérifié
  (`suspended` → refus, ligne 258), puis réécrit **sans condition sur le statut lu** (ligne 266 :
  `.where(eq(games.id, gameId))`). Côté admin, `moderateGame` (`admin.ts:175-179`) fait bien une mise à jour conditionnelle,
  mais cela ne protège que l'admin.
- **Scénario** : un studio frauduleux sait que sa boutique va être suspendue (signalements, litiges). Il envoie en boucle
  `publishGame(gameId)` (owner/admin du studio). Une requête lancée juste avant la suspension lit `live`/`draft`, l'admin
  suspend, puis cette requête écrit `status = 'live'`. Le jeu redevient public et achetable alors que la notification de
  suspension a été envoyée et que le back-office affiche une suspension dans l'historique. Même chose avec
  `unpublishGame` (`suspended` → `draft`, qu'il suffit ensuite de republier).
- **Preuve** (test jetable, passé ; l'entrelacement est obtenu en lançant les deux écritures ensemble sur PGlite) :

  ```ts
  await Promise.all([
    setGameStatus(db, 'gam_x', 'live'),                                              // studio
    db.update(games).set({ status: 'suspended' }).where(eq(games.id, 'gam_x')),      // admin
  ]);
  const [g] = await db.select({ status: games.status }).from(games).where(eq(games.id, 'gam_x'));
  expect(g!.status).toBe('live'); // ✔ passe : la suspension est écrasée
  ```
- **Correctif** : mise à jour conditionnelle et vérification du résultat :
  `.where(and(eq(games.id, gameId), inArray(games.status, ['draft', 'live'])))` (ou `eq(games.status, g.status)`), puis
  `if (!row) throw new StudioError('Le statut du jeu vient de changer : rechargez la page.')`. Appliquer le même principe à
  toute écriture de `games.status` hors back-office.
- **Test de non-régression** (`studio-logic.test.ts`) : le test ci-dessus doit finir à `suspended` et `setGameStatus` doit
  lever `StudioError` ; un second test vérifie que `unpublishGame` sur un jeu suspendu entre lecture et écriture ne le passe pas en `draft`.

### A-03 — Moyenne — Publication directe sans revue (le circuit de revue est mort)

- **Où** : `apps/web/src/server/studio.ts:89-96` (`publishGame` → `setGameStatus(db, gameId, 'live')`, commentaire
  « Phase 1 ») ; `studio-logic.ts:255`. Le back-office prévoit `review → live` (`admin-logic.ts:61-62`, `approveGame`), mais
  aucun chemin du studio ne produit `review`. Un jeu en `review` (posé par exemple à la main) peut aussi être dépublié puis republié par le studio.
- **Scénario** : n'importe quel visiteur crée un compte et un studio (`/studio/signup`, sans vérification d'e-mail, cf. A-04),
  crée un jeu, choisit librement `publisherName` (« Supercell », « Riot Games »…), ajoute un article et publie : la boutique
  est en ligne, indexée (sitemap) et liée depuis la recherche, sans contrôle humain. Hameçonnage ou usurpation de marque
  jusqu'à une suspension a posteriori, contournable par A-02. L'encaissement réel dépend de l'onboarding Stripe Connect du studio
  (non revérifié ici : périmètre « paiement »).
- **Correctif** (décision produit à faire valider par le fondateur) : `publishGame` → `draft → review` ; seul `approveGame`
  met en ligne ; republier après `unpublishGame` d'un jeu déjà approuvé peut rester direct (marquer `approvedAt`). À défaut,
  au minimum : revue obligatoire pour le **premier** passage en ligne d'un studio et pour tout changement de `name`/`publisherName` d'un jeu en ligne.
- **Test de non-régression** : `publishGame` sur un brouillon → statut `review` ; le jeu n'apparaît ni dans le catalogue ni
  dans `sitemap.xml` ; `approveGame` → `live`.

### A-04 — Moyenne — Ni vérification d'e-mail, ni réinitialisation de mot de passe, ni 2FA

- **Où** : `apps/web/src/server/auth.ts:77-84` : `emailAndPassword` sans `requireEmailVerification` ni `sendResetPassword`,
  pas de `emailVerification`, pas de plugin `twoFactor` ; `account.accountLinking` actif avec Google et Apple de confiance.
- **Ce qui est sain** : Better Auth 1.7.18 refuse la liaison implicite d'un compte social à un utilisateur dont l'e-mail local
  n'est pas vérifié (`requireLocalEmailVerified` vaut `true` par défaut, `better-auth/dist/oauth2/link-account.mjs`,
  `handleOAuthUserInfo`). Il n'y a donc **pas** de pré-détournement de compte (inscription avec l'e-mail de la victime puis
  connexion Google de la victime dans le compte de l'attaquant).
- **Scénario (squat)** : l'attaquant inscrit `victime@gmail.com` avec un mot de passe à lui. La vraie titulaire ne peut ni
  s'inscrire (« Un compte existe déjà »), ni se connecter avec Google (liaison refusée, `account not linked`), ni réinitialiser
  le mot de passe (aucun flux) : l'adresse est confisquée et seule une intervention manuelle en base la libère. Même chose pour
  l'adresse professionnelle d'un studio. Par ailleurs un compte studio (accès aux clés, URL de webhook, versements) est protégé
  par un seul mot de passe : T-AUTH-04 (phishing → prise de contrôle des clés et des payouts) n'a aucune défense.
- **Correctif** : brancher l'envoi d'e-mails existant (`packages/emails`) sur Better Auth : `emailVerification.sendVerificationEmail`,
  `sendOnSignUp: true`, `emailAndPassword.requireEmailVerification: true` au moins pour les comptes studio (ou accès au studio
  conditionné à `emailVerified`) ; `sendResetPassword` + page `/reset-password` (avec `revokeSessionsOnPasswordReset: true`) ;
  plugin `twoFactor` (TOTP) obligatoire pour les rôles studio `owner`/`admin` et pour tous les administrateurs de la plateforme avant l'ouverture publique.
  Purger les comptes non vérifiés au bout de 7 jours pour libérer les adresses squattées.
- **Tests de non-régression** : inscription → e-mail de vérification envoyé, `emailVerified=false` ; `requireGameAccess`/création de studio
  refusés tant que l'e-mail n'est pas vérifié ; flux de réinitialisation (jeton à usage unique, expiré refusé, sessions révoquées) ;
  `requirePlatformAdmin` refusé sans 2FA activée.

### A-05 — Moyenne — Limitation de débit de la connexion contournable

- **Où** :
  - `apps/web/src/server/auth-rate-limit.ts:70` : `authLimiter` en mémoire du processus. Sur Vercel (déploiement de
    référence, `docs/deploy.md`), chaque instance de fonction a son compteur, perdu à chaque démarrage à froid : les plafonds
    (8 échecs par e-mail, 40 par IP sur 15 min) deviennent « par instance et par durée de vie d'instance ».
  - `auth-rate-limit.ts:76-80` (`clientIp`) : prend la valeur **la plus à gauche** de `X-Forwarded-For`, qui est fournie par le
    client dès qu'un proxy ajoute au lieu de remplacer (nginx `$proxy_add_x_forwarded_for`, Cloudflare devant Vercel, autre
    hébergeur). Better Auth fait mieux (`@better-auth/core/dist/utils/ip.mjs` : une seule valeur acceptée, ou chaîne
    `trustedProxies`). La même fonction sert au limiteur de l'API v1 (`api-rate-limit.ts:77`).
  - `auth.ts:103-113` : la limite intégrée de Better Auth pour `/api/auth/sign-in/email` (5/min) est par IP seulement et elle
    aussi en mémoire (`storage` par défaut). La route HTTP n'applique **pas** le plafond par e-mail des Server Actions.
- **Scénario** : bourrage d'identifiants sur `POST /api/auth/sign-in/email` depuis un réseau d'IP (ou une seule IP derrière un
  proxy qui ajoute à `X-Forwarded-For`) : aucune limite par compte, et chaque nouvelle instance remet les compteurs à zéro.
  Même chose pour l'inscription en masse (10/h/IP contournable) et pour l'énumération A-07.
- **Correctif** : réutiliser le limiteur partagé (`rate-limit.ts`, `RATE_LIMIT_STORE=postgres`) pour les formulaires
  d'authentification (vérification et enregistrement en une requête atomique) ; `rateLimit.storage: 'database'` (ou
  `secondary-storage`) dans Better Auth, plus une règle par e-mail sur `/sign-in/email` via un hook `before` ; dériver l'IP
  comme Better Auth (`advanced.ipAddress.trustedProxies`, ou en-tête propre à l'hébergeur `x-vercel-forwarded-for`) et
  utiliser la même fonction partout.
- **Tests de non-régression** : `clientIp` renvoie la dernière IP non fiable de `1.2.3.4, 10.0.0.1` avec `10.0.0.0/8` en proxy
  de confiance, et ignore une valeur multiple sans configuration ; 9 échecs sur un même e-mail répartis sur deux instances du
  limiteur (même base) → le 9e est refusé ; 6 `POST /api/auth/sign-in/email` sur un même e-mail avec des IP différentes → 429.

### A-06 — Moyenne — Données de démo (dont un superadmin connu) non bloquées hors `NODE_ENV`

- **Où** : `packages/db/src/guards.ts:16-23` (`assertSeedAllowed` : seul `NODE_ENV`/`VERCEL_ENV` = production bloque) ;
  `packages/db/src/seed.ts:22,119` : `dev@devappstore.test` (mot de passe `demo1234`, publié dans HANDOFF.md) devient
  **superadmin** ; clés `das_secret_demo_*` / `whsec_demo_*` connues. Aucun contrôle d'exécution ne refuse ces comptes ou ces
  clés en production (`rg "_demo" apps/web/src/server` → rien hors `import-demo.ts`).
- **Scénario** : un développeur lance `DATABASE_URL=<production> npm run db:seed` depuis son poste (par exemple pour
  « réparer » une base de préproduction mal nommée) : `NODE_ENV` vaut `development`, le seed passe et un superadmin au mot de
  passe public est créé en production, ainsi qu'un jeu `gam_crystal` aux clés publiques.
- **Correctif** : dans `assertSeedAllowed`, refuser aussi toute `DATABASE_URL` dont l'hôte n'est pas local (`localhost`,
  `127.0.0.1`, `::1`, `*.local`) sauf `DEVAPPSTORE_ALLOW_SEED=1` explicite (exigence de T-PLT-02) ; à l'exécution, en production,
  refuser la connexion des e-mails `@devappstore.test` (hook `session.create.before`) et les clés dont le préfixe contient `_demo_`
  dans `authenticateGame`.
- **Tests de non-régression** : `assertSeedAllowed({ DATABASE_URL: 'postgres://u:p@db.neon.tech/x' })` lève ; avec
  `postgres://localhost/x` passe ; en `NODE_ENV=production`, connexion de `dev@devappstore.test` refusée et `das_secret_demo_crystal_clash` → 401.

### A-07 — Basse — Énumération de comptes par l'inscription

- **Où** : `apps/web/src/server/auth-flows.ts:75-77` et `:161` (message et erreur de champ « Un compte existe déjà avec cette
  adresse e-mail ») ; même information via `POST /api/auth/sign-up/email` (code `USER_ALREADY_EXISTS`). La connexion, elle, a un message unique (OK).
- **Scénario** : vérifier si `ceo@studio-concurrent.com` ou une personne donnée a un compte (ciblage d'hameçonnage), à raison
  de 10 essais/h/IP (contournable, A-05).
- **Correctif** : avec la vérification d'e-mail (A-04), répondre toujours « Vérifiez votre boîte mail » et envoyer à l'adresse
  existante un e-mail « quelqu'un a tenté de créer un compte » (Better Auth : `emailAndPassword.requireEmailVerification` +
  `onExistingUserSignUp`). Sans A-04, c'est un compromis UX accepté à documenter.
- **Test** : réponses identiques (statut, corps, temps approximatif) pour un e-mail existant et inexistant.

### A-08 — Basse — `developer` peut faire tourner le secret webhook et la clé secrète

- **Où** : `apps/web/src/app/studio/games/[id]/integration/actions.ts:14` (`EDITORS = owner, admin, developer`) appliqué à
  `regenerateWebhookSecret` (`:61`), `regenerateApiKey` (`:34`) et `regeneratePublishableKey` (`:44`). La matrice du modèle de
  menaces (§ 6.6) prévoit « ✓ (sauf rotation) » pour `developer` sur le secret webhook et « création » seulement pour les clés.
- **Scénario** : un développeur prestataire, en fin de mission, fait tourner la clé secrète et le secret webhook : le serveur
  du studio cesse d'authentifier ses appels et de vérifier les livraisons (déni de service des achats) jusqu'à intervention d'un owner.
- **Correctif** : soit restreindre ces trois actions à `owner`/`admin` (et journaliser la rotation), soit mettre à jour la matrice
  si le fondateur accepte l'écart. Ajouter une notification e-mail aux owners lors d'une rotation (T-AUTH-04).
- **Test** : membre `developer` → `regenerateWebhookSecret`/`regenerateApiKey` refusés, empreinte et secret inchangés en base.

### A-09 — Basse — Blocage ciblé de la connexion d'un tiers

- **Où** : `auth-flows.ts:122-129` : le plafond par e-mail (8 échecs / 15 min, `auth-rate-limit.ts:23`) s'applique à toutes
  les IP, y compris celle de la titulaire.
- **Scénario** : bloquer en continu la connexion par formulaire d'un administrateur ou d'un studio (8 essais toutes les 15 min).
  Atténué : la route HTTP Better Auth et Google restent utilisables, et le blocage est par instance (A-05).
- **Correctif** : clé composite e-mail + IP pour le blocage dur, plafond par e-mail plus haut (ex. 50) réservé au ralentissement ;
  à terme, défi supplémentaire plutôt que refus.
- **Test** : 8 échecs depuis l'IP A sur un e-mail → l'IP B se connecte encore avec le bon mot de passe.

### A-10 — Basse — `SKIP_ENV_VALIDATION=1` neutralise la validation en production

- **Où** : `apps/web/src/env.ts:251-253` ; `instrumentation.ts` passe alors par `readEnv` (tolérant). Seul le secret de session
  reste contrôlé (`auth.ts:73` → `resolveAuthSecret`). Une variable oubliée dans l'environnement de production (ex. copiée d'un
  script d'outillage) relance PGlite sans `DATABASE_URL`, laisse `/api/cron/*` ouvert sans `CRON_SECRET` et autorise le mode simulation.
- **Correctif** : ignorer `SKIP_ENV_VALIDATION` quand `NODE_ENV=production` et `NEXT_PHASE !== 'phase-production-build'`
  (ou au moins journaliser un avertissement bruyant) ; doubler le refus PGlite dans `packages/db/src/index.ts` (`create()`).
- **Test** : `validateEnv({ NODE_ENV: 'production', SKIP_ENV_VALIDATION: '1' })` lève `EnvValidationError`.

### A-11 — Basse — Pas de ré-authentification pour les actions sensibles

- **Où** : `auth.ts:85-88` (session de 30 jours, glissante) ; `session.ts:50-59` (`requireGameAccess`) et `admin.ts:104-108`
  ne regardent pas l'âge de la session. Rotation de clé, révélation du secret webhook (`integration/actions.ts:53`), onboarding
  Stripe (`payouts/actions.ts:22`), désactivation de comptes et modération acceptent une session ouverte il y a un mois.
- **Scénario** : cookie volé (poste partagé, extension malveillante) → révélation du secret webhook (fabrication de livraisons
  signées vers le serveur du studio) ou changement de compte de versement, sans redemander le mot de passe.
- **Correctif** : sessions plus courtes pour les administrateurs de la plateforme (ex. 12 h) ; exiger une session récente
  (`session.createdAt` < 15 min, sinon re-saisie du mot de passe ou TOTP, cf. `freshAge` de Better Auth) pour les actions listées.
- **Test** : session créée il y a 2 h → `revealWebhookSecret` renvoie « Confirmez votre mot de passe » ; session fraîche → OK.

### A-12 — Basse — Couverture incomplète des tests d'accès croisé (CHK-MT-03)

- **Constat** : `studio-tenancy.test.ts` couvre l'éditeur, les réglages de liaison, l'export CSV et les rôles `finance`/`developer`.
  Aucun test d'accès croisé (`rg -l "regenerateApiKey|revealWebhookSecret|importSelectionAction|startOnboardingAction" -g '*.test.ts'` → vide)
  pour `integration/actions.ts` (rotation de clés, révélation du secret, URL webhook, relance de livraison, révocation de jetons),
  `import-actions.ts`, `payouts/actions.ts` et `ai-style-action.ts`. Le code lu est correct aujourd'hui, mais rien n'empêche une régression.
- **Correctif / test** : étendre `studio-tenancy.test.ts` : l'utilisateur du studio B appelle chacune de ces actions avec `gam_a`
  (et `retryDeliveryAction(gam_b, <livraison de gam_a>)`) → refus ou `not_found`, base inchangée (empreinte de clé, secret, URL, jetons) ;
  `startOnboardingAction` avec `studio=<studio A>` → redirection `error=forbidden`.

### A-13 — Basse (plausible) — Nom d'utilisateur non borné via l'API Better Auth

- **Où** : `auth-flows.ts:38-42` borne `name` à 80 caractères, mais `POST /api/auth/update-user` (exposé par
  `app/api/auth/[...all]/route.ts`) accepte `name` sans cette limite. Non testé en HTTP.
- **Risque** : affichage cassé dans le back-office et les e-mails (nom de l'acheteur), volume en base. React échappe le texte : pas de XSS identifié.
- **Correctif** : `user.additionalFields` n'aidant pas pour `name`, ajouter un hook `databaseHooks.user.update.before` qui
  tronque ou refuse `name` > 80 caractères (et `image` non `https:`), ou désactiver `update-user` s'il n'est pas utilisé.
- **Test** : `auth.api.updateUser({ body: { name: 'x'.repeat(500) } })` → refus ou nom tronqué.

---

## Statut des points de la checklist

Légende : OK / KO / partiel / non vérifiable. « Lecture » : vérifié dans le code, sans serveur lancé.

### 1. Configuration et démarrage

| ID | Statut | Justification |
|---|---|---|
| CHK-CFG-01 | OK (réserve A-10) | `env.ts:152` exige `DATABASE_URL` en production ; `instrumentation.ts` quitte le processus. Contournable par `SKIP_ENV_VALIDATION=1`. |
| CHK-CFG-02 | OK | `env.ts:139-195` + `auth-config.ts:40-49` : secret ≥ 32 et différent des valeurs d'exemple, `STRIPE_WEBHOOK_SECRET` si clé Stripe, `CRON_SECRET` ≥ 16, `PLATFORM_FEE_BPS` 0–3000, `APP_URL` https ; tests dans `env.test.ts`. |
| CHK-CFG-03 | KO (P2, mineur) | Absentes de `.env.example` : `ANTHROPIC_API_KEY`, `AI_STYLE_DAILY_LIMIT`, `MAIL_COMPANY_NAME`/`MAIL_COMPANY_ADDRESS`, `MAIL_MEDIATOR_NAME`/`MAIL_MEDIATOR_URL`, `BETTER_AUTH_SECRET` (cité en commentaire seulement). Aucune valeur exploitable présente (`AUTH_SECRET=change-me` est refusé en production). |
| CHK-CFG-04 | Partiel / KO | Seed bloqué si `NODE_ENV`/`VERCEL_ENV` = production seulement ; pas de refus des comptes ni des clés de démo à l'exécution → A-06. |
| CHK-CFG-05 | OK | `git log -p --all` : seule occurrence `sk_live_51Fake000…` dans un test (factice). |
| CHK-CFG-06 | OK | Aucune occurrence de `devappstore_demo_user` / `usr_demo_player` hors tests ; session Better Auth seule (`session.ts:25-31`). |

### 2. Authentification et session

| ID | Statut | Justification |
|---|---|---|
| CHK-AUTH-01 | OK (lecture) | `readSession` renvoie `null` sans session Better Auth valide ou si le compte est désactivé ; `requireUser` → `/login?next=…`. |
| CHK-AUTH-02 | OK (lecture) | Jeton de session signé (secret validé), cookie stub supprimé ; un jeton aléatoire n'existe pas en table `session`. |
| CHK-AUTH-03 | OK (lecture) | `auth-config.ts:64-70` : `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` + préfixe `__Secure-` en production. `Set-Cookie` réel non observé (pas de serveur). |
| CHK-AUTH-04 | Partiel | Limites présentes (Server Actions et Better Auth) mais en mémoire par instance, IP falsifiable, pas de limite par e-mail sur la route HTTP → A-05. Réinitialisation : sans objet (flux absent, A-04). |
| CHK-AUTH-05 | KO | Connexion : message unique (OK). Inscription : « Un compte existe déjà » → A-07. |
| CHK-AUTH-06 | OK | `lib/auth/next-url.ts` (`safeNext`) refuse `//`, `/\`, schémas, variantes encodées ; testé par `next-url.test.ts`. |
| CHK-AUTH-07 | OK (lecture) | `/api/checkout` (`isSameOrigin`) et `/api/uploads` (`isCrossSiteRequest`) contrôlent l'origine ; Server Actions : contrôle d'origine natif de Next.js ; `/api/auth/*` : `trustedOrigins` de Better Auth ; cookies `SameSite=Lax`. `/studio/.../sales/export` est un `GET` sans effet de bord. |
| CHK-AUTH-08 | KO | Ni vérification d'e-mail, ni 2FA → A-04. |

### 3. Autorisation et isolation multi-tenant

| ID | Statut | Justification |
|---|---|---|
| CHK-MT-01 | OK | Les 13 fichiers `use server` relus : chaque action studio appelle `requireGameAccess(gameId, rôles)` (`studio.ts:54-60`, `integration/actions.ts:20-28`, `import-actions.ts:36-47`, `ai-style-action.ts:22`, `link-settings-actions.ts:26`) ou `getPayoutStudio(user.id, studioId)` (`payouts/actions.ts:10-19`) ; back-office : `requireAdminPermission` dans chaque fonction de `server/admin.ts` ; actions joueur bornées par `user.id`. |
| CHK-MT-02 | OK | Articles : `and(items.id, items.gameId)` (`studio-logic.ts:292, 369, 386, 423`) ; livraisons : `and(t.id, t.gameId)` (`delivery.ts:611`) ; jetons joueur : `gameId` (`player-tokens.ts:87`) ; images : `assertUploadsBelongToGameStudio`. |
| CHK-MT-03 | Partiel | `studio-tenancy.test.ts` couvre éditeur, liaison, export, rôles ; manquent intégration, import, versements, IA de style → A-12. |
| CHK-MT-04 | OK | Requêtes de `analytics.ts` toutes filtrées par `orders.gameId` après `requireGameAccess` ; tous les `sql\`` sont paramétrés (aucun `sql.raw`, recherches admin avec `escapeLike`). |
| CHK-MT-05 | OK | Schémas zod en liste blanche (mode par défaut : clés inconnues supprimées) ; `status`, `studioId`, `apiKeyHash`, `webhookSecret` jamais issus d'une entrée ; test « champs sensibles ignorés » (`studio-tenancy.test.ts:195`). `.strict()` n'est pas utilisé : écart de forme accepté. |
| CHK-MT-06 | Partiel / KO | Boutique, publication, ventes, versements conformes ; `developer` fait tourner secret webhook et clés → A-08. Gestion des membres : sans objet (aucune fonctionnalité). |
| CHK-MT-07 | OK (lecture) | Pages : `notFound()` (même réponse pour un jeu inexistant ou d'un autre studio, T-MT-07) ; actions : message générique ; export : 403 texte ; back-office : 404. |
| CHK-MT-08 | OK (lecture) | Projections explicites (`toEditorGame`, page intégration, `getPayoutStudios` côté serveur uniquement) ; secret webhook seulement via `revealWebhookSecret` (rôles d'édition). HTML public non vérifié par curl. |
| CHK-MT-09 | Partiel | Visibilité publique hors périmètre de cette revue (catalogue/paiement). Le processus de mise en ligne est KO : publication sans revue (A-03) et suspension contournable (A-02). |

## Statut des menaces du modèle (§§ 6.1, 6.6, 6.7)

| ID | Statut | Commentaire |
|---|---|---|
| T-AUTH-01 | Traitée | Stub supprimé, Better Auth. |
| T-AUTH-02 | Traitée | Secret validé au démarrage et à la création de l'instance (réserve A-10). |
| T-AUTH-03 | Partielle | Limiteurs contournables (A-05), énumération à l'inscription (A-07), pas de vérification d'e-mail (A-04). |
| T-AUTH-04 | Ouverte | Pas de 2FA, pas de ré-authentification, pas de notification sur rotation (A-04, A-08, A-11). |
| T-AUTH-05 | Traitée | Origine contrôlée, `SameSite=Lax`, `trustedOrigins`. |
| T-AUTH-06 | Traitée | `safeNext` + tests. |
| T-AUTH-07 | Traitée | `frame-ancestors 'none'` et `X-Frame-Options: DENY` (`lib/security-headers.ts:63, 80`). |
| T-AUTH-08 | Partielle | Journal d'audit du back-office (`admin_audit_log`) ; pas de journal des actions studio sensibles (rotation, URL webhook, versements). |
| T-MT-01 / T-MT-02 / T-MT-04 / T-MT-05 / T-MT-06 / T-MT-07 | Traitées | Voir CHK-MT-01, 02, 04, 05, 07, 08. Tests à compléter (A-12). |
| T-MT-03 | Partielle | Écart `developer` (A-08). |
| T-PLT-01 | Traitée | Réserve A-10. |
| T-PLT-02 | Partielle | A-06. |
| T-PLT-03 | Traitée | CSP à nonce (`middleware.ts`), en-têtes dans `next.config.ts` (détail hors périmètre). |
| T-PLT-04 | Non vérifiée en détail | Hors périmètre principal ; `retryOrderDelivery` renvoie le message d'exception brut, mais à un administrateur seulement (`admin.ts:323`). |
| T-PLT-05 | Non vérifiable ici | Dépôt GitHub et CI hors de cette revue. |
| T-PLT-06 | Partielle | API v1 : limiteur partagé possible (`RATE_LIMIT_STORE=postgres`) ; connexion : par instance (A-05). |
| T-PLT-07 | Hors périmètre | — |

## Points vérifiés sans constat (pour mémoire)

- Fixation de session : Better Auth crée un nouveau jeton à chaque connexion ; la déconnexion supprime la session ; la
  désactivation d'un compte supprime toutes ses sessions (`admin.ts:356`) et bloque les nouvelles (`auth.ts:90-99`, `session.ts:29`).
- Escalade vers superadmin par l'application : aucune Server Action ni route n'écrit dans `platform_admins` ; les rôles ne
  s'attribuent qu'en base. Seul le chemin A-01 (réactivation) rend un rôle existant.
- Pré-détournement par liaison Google/Apple : impossible avec Better Auth 1.7.18 et sa configuration par défaut (voir A-04).
- Mass assignment sur `games`/`items` : impossible (listes blanches zod, champs sensibles posés côté serveur).
- Back-office : un administrateur désactivé perd immédiatement l'accès (`getPlatformAdmin` vérifie `user_suspensions`) ;
  `disableUser` protège les administrateurs et empêche l'auto-désactivation ; transitions de modération conditionnelles.

## Ordre de correction proposé

1. A-01 et A-02 (correctifs de quelques lignes, tests prêts ci-dessus).
2. A-06 (garde du seed par hôte) et A-10.
3. A-05 (limiteur partagé + IP fiable), puis A-04 (vérification d'e-mail, réinitialisation, 2FA admin/owner) avant l'ouverture publique.
4. A-03 : décision du fondateur sur la revue avant mise en ligne.
5. A-07, A-08, A-09, A-11, A-12, A-13.
