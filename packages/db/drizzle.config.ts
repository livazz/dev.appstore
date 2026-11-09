import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;

export default url
  ? defineConfig({ dialect: 'postgresql', schema: './src/schema/index.ts', dbCredentials: { url } })
  : defineConfig({
      dialect: 'postgresql',
      driver: 'pglite',
      schema: './src/schema/index.ts',
      dbCredentials: { url: process.env.WOLLEEN_DATA_DIR ? `${process.env.WOLLEEN_DATA_DIR}/pglite` : '../../.data/pglite' },
    });
