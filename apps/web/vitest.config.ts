import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    server: {
      deps: {
        // better-auth importe `next/headers` (plugin nextCookies) : on le fait passer par Vite pour que vi.mock s'applique.
        inline: ['better-auth'],
      },
    },
  },
});
