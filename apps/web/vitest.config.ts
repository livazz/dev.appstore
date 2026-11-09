import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
      // `server-only` lève une erreur hors du bundler Next : module vide en test.
      { find: /^server-only$/, replacement: fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
