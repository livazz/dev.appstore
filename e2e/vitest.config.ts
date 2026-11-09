import { defineConfig } from 'vitest/config';

// Tests unitaires des utilitaires du harnais (rapides, sans navigateur ni serveur) — lancés par `npm test`.
// Les specs Playwright (tests/*.spec.ts) sont exclues : elles passent par `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['support/**/*.test.ts'],
  },
});
