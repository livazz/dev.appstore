import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
      { find: /^server-only$/, replacement: fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    // Nécessaire pour que les mocks de next/headers s'appliquent à better-auth (tâche auth).
    server: { deps: { inline: ['better-auth'] } },
    // Importer @devappstore/db instancie la base globale. Sans DATABASE_URL, elle ouvrirait la base PGlite
    // de dev (.data/pglite), possiblement verrouillée par `next dev`. Les tests utilisent createTestDb() :
    // on pointe la base globale vers un Postgres fictif (postgres-js ne se connecte qu'à la 1re requête).
    env: { DATABASE_URL: 'postgres://vitest:unused@127.0.0.1:1/unused' },
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
