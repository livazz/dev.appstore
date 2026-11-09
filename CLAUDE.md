# Dev AppStore — consignes pour Claude

Ce projet reprend une session précédente. **Avant toute chose, lis `HANDOFF.md` (état, commandes, reste à faire,
décisions en attente), puis `ARCHITECTURE.md`.** Ne refais pas le travail déjà fait : tout ce qui est décrit
comme fait dans HANDOFF.md est fusionné et testé.

## Première action dans une nouvelle discussion

0. **Créer le dépôt GitHub `dev.appstore`** (privé) et y pousser tout l'historique, si ce n'est pas déjà fait
   (`git remote -v` vide) : `gh repo create dev.appstore --private --source . --remote origin --push`
   (si `gh` n'est pas connecté : `gh auth login`, ou demander à l'utilisateur de créer le dépôt puis
   `git remote add origin … && git push -u origin main`). Ensuite, pousser régulièrement.
1. Si `node_modules` est absent : `npm install`, puis `npm run db:push && npm run db:seed`.
2. Vérifie que tout est vert : `npm run typecheck && npm test`.
3. Fais un point court à l'utilisateur (état, prochaines étapes) puis enchaîne sur « Ce qui reste à faire »
   de HANDOFF.md : d'abord la vague 6 (`docs/handoff/vague-6-taches.js`, 5 tâches sur des fichiers disjoints,
   à lancer en parallèle), puis une revue de sécurité complète.

## Façon de travailler attendue par l'utilisateur

- Tout en **français** : réponses, interface, commits, commentaires.
- L'utilisateur veut **aller vite** et **paralléliser au maximum** les tâches indépendantes (agents en parallèle,
  périmètres de fichiers disjoints, un worktree/branche par agent, fusion et vérification ensuite).
- Après chaque fusion : `npm run typecheck`, `npm test`, `npm run build`, et les e2e
  (`cd e2e && npx playwright test --trace off`).
- Ne jamais demander de secrets (clés Stripe…) dans le chat : ils vont dans `.env.local`, jamais dans git.

## Conventions du code

- Monorepo npm workspaces : `apps/web` (Next.js 15 App Router), `apps/demo-game`, `packages/*`, `sdks/*`, `e2e`.
- Montants toujours en **centimes**.
- Composants client : importer `@devappstore/core/client` (jamais `@devappstore/core`, qui contient du code serveur).
- Base : Drizzle ; PGlite embarqué en local (`.data/pglite`), Postgres via `DATABASE_URL` en production.
  Changement de schéma → `npm run db:generate -w @devappstore/db` (migration) + `npm run db:push` en local.
- Ne pas changer `CHARGE_MODEL` ni la TVA sans décision de l'utilisateur.
