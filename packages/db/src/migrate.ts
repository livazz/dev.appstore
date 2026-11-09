/*
 * Applique les migrations SQL versionnées (packages/db/drizzle/*.sql) : `npm run db:migrate`.
 *
 * - Production (Postgres, DATABASE_URL) : SEULE façon de faire évoluer le schéma. Chaque migration est appliquée une
 *   fois, dans une transaction, et tracée dans drizzle.__drizzle_migrations. N'utilise que drizzle-orm (pas drizzle-kit).
 * - Développement (PGlite) : possible aussi, mais `npm run db:push` reste le plus simple.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describeTarget } from './guards';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

async function main() {
  const url = process.env.DATABASE_URL;
  console.log(`Migrations → ${describeTarget()}`);
  if (url) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    // Une seule connexion ; notices Postgres (« relation already exists, skipping ») masquées.
    const client = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(client), { migrationsFolder });
    } finally {
      await client.end();
    }
  } else {
    const { mkdirSync, existsSync, readFileSync } = await import('node:fs');
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const dir = process.env.DEVAPPSTORE_DATA_DIR
      ? resolve(process.env.DEVAPPSTORE_DATA_DIR, 'pglite')
      : (() => {
          // Même règle que src/index.ts : .data à la racine du dépôt.
          let d = process.cwd();
          while (d !== dirname(d)) {
            const pkg = resolve(d, 'package.json');
            if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).name === 'devappstore') return resolve(d, '.data/pglite');
            d = dirname(d);
          }
          return resolve(process.cwd(), '.data/pglite');
        })();
    mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir);
    try {
      await migrate(drizzle(pg), { migrationsFolder });
    } finally {
      await pg.close();
    }
  }
  console.log('Migrations appliquées.');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('Échec des migrations :', e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
