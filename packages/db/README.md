# @devappstore/db

Schéma et accès base de données de Dev AppStore (Drizzle ORM 0.45).

- **Production** : Postgres via `DATABASE_URL` (Neon, Supabase, RDS…), client `postgres` (5 connexions par instance).
- **Développement** : **PGlite** embarqué (Postgres compilé en WebAssembly) dans `.data/pglite` à la racine du dépôt
  (`DEVAPPSTORE_DATA_DIR` pour changer de dossier). Aucune installation de Postgres nécessaire.
- **Tests** : `createTestDb()` (`@devappstore/db/testing`) — PGlite en mémoire, schéma appliqué, une base par fichier de test.

```ts
import { db, orders, eq } from '@devappstore/db';
const rows = await db.select().from(orders).where(eq(orders.userId, userId));
```

`db` est ouvert **paresseusement** : au premier accès, jamais à l'import (une instance par processus, conservée sur
`globalThis` pour survivre au rechargement à chaud). Raison : pendant `next build`, l'étape « Collecting page data »
importe tous les modules de route dans plusieurs processus en parallèle ; PGlite étant mono-processus, l'ouvrir à l'import
provoquait des `RuntimeError: Aborted()`. Conséquence pour les pages : **une page qui lit la base doit être dynamique**
(c'est le cas dès qu'elle lit la session ou des paramètres ; sinon `export const dynamic = 'force-dynamic'`) — une page
statique qui interrogerait la base au build ouvrirait PGlite depuis plusieurs workers.

## Schéma et migrations

Sources : `src/schema/*.ts`. Migrations SQL versionnées : `drizzle/NNNN_nom.sql` (+ `drizzle/meta/`, à commiter).

| Commande | Où | Ce qu'elle fait |
|---|---|---|
| `npm run db:push` | **dev uniquement** | Compare le schéma TypeScript à la base et l'aligne directement (`drizzle-kit push`), sans fichier de migration. Idempotent : relancé, il répond « No changes detected ». Peut supprimer des colonnes : jamais sur la production. |
| `npm run db:generate -w @devappstore/db` | dev, à chaque changement de schéma | Écrit la migration suivante (`drizzle/0002_….sql`) à partir de la différence avec le dernier instantané. À relire (renommages, `NOT NULL` sur des lignes existantes…) et à commiter avec le changement de schéma. |
| `npm run db:migrate` | **production** (et CI) | Applique, dans l'ordre, les migrations pas encore appliquées, chacune dans une transaction, tracées dans `drizzle.__drizzle_migrations`. N'utilise que `drizzle-orm` (pas `drizzle-kit`). Sans `DATABASE_URL`, s'applique à PGlite. |
| `npm run db:seed` | dev, préproduction | Données de démo (comptes `dev@` / `joueur@devappstore.test`, clés API publiques dans le dépôt, ventes fictives). **Refusé** si `NODE_ENV` ou `VERCEL_ENV` vaut `production`. |
| `npx tsx packages/db/src/seed-admin.ts <email> <rôle>` | toute base | Donne un rôle du back-office (`superadmin`, `support`, `finance`) à un compte existant. Seul script autorisé en production. |

### Mettre en production

```bash
DATABASE_URL='postgres://…' npm run db:migrate
```

À lancer **avant** de démarrer la nouvelle version (étape de release : `releaseCommand` Docker/Render, job CI avant le
déploiement Vercel…). Jamais `db:push` ni `db:seed` sur la base de production. Les migrations sont écrites pour être
compatibles avec la version précédente du code le temps du déploiement (ajouts d'abord, suppressions dans une version
ultérieure). Le script n'affiche que l'hôte et la base visés, jamais les identifiants.

### Changer le schéma

1. Modifier `src/schema/*.ts` (nouveau fichier de schéma → l'exporter dans `src/schema/index.ts`).
2. `npm run db:generate -w @devappstore/db` puis relire le SQL généré.
3. `npm run db:push` en local et `npm test` : `src/migrations.test.ts` échoue si le schéma TypeScript et la dernière
   migration divergent (migration oubliée) et vérifie que `db:push` reste idempotent sur une base peuplée.

### Conventions

- **Unicité sur plusieurs colonnes : `uniqueIndex('…_uq').on(a, b)`, pas `unique()`.** drizzle-kit relit les colonnes
  d'une contrainte `UNIQUE` dans un ordre non garanti et croit à une différence à chaque `push` (avec confirmation
  interactive dès que la table contient des lignes, ce qui faisait échouer `db:push` hors terminal). Les index uniques
  sont relus correctement ; `ON CONFLICT (a, b)` fonctionne de la même façon. `.unique()` sur une seule colonne ne pose
  pas de problème.
- Index nommés `<table>_<colonnes>_idx`, ordre des colonnes = filtre d'égalité d'abord, tri/intervalle ensuite
  (`orders_user_created_idx` sur `(user_id, created_at)`).
- Montants en centimes (`integer`), dates en `timestamp` sans fuseau (UTC).
