import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema/index';

export * from './schema/index';
export * from './notify';
export { schema };
export { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql, count, sum, ilike } from 'drizzle-orm';

export type DB = PgliteDatabase<typeof schema>;

/** Dossier .data à la racine du dépôt (trouvée en remontant depuis le cwd). Surchargable via DEVAPPSTORE_DATA_DIR. */
function dataDir() {
  if (process.env.DEVAPPSTORE_DATA_DIR) return process.env.DEVAPPSTORE_DATA_DIR;
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    const pkg = resolve(dir, 'package.json');
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).name === 'devappstore') return resolve(dir, '.data');
    dir = dirname(dir);
  }
  return resolve(process.cwd(), '.data');
}

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Postgres réel (Neon, Supabase, RDS…). Les API Drizzle sont identiques.
    return drizzlePg(postgres(url, { max: 5 }), { schema }) as unknown as DB;
  }
  const dir = resolve(dataDir(), 'pglite');
  mkdirSync(dir, { recursive: true });
  return drizzlePglite(new PGlite(dir), { schema });
}

const g = globalThis as unknown as { __devAppStoreDb?: DB };
/** Instance unique (survit au rechargement à chaud de Next.js). */
export const db: DB = g.__devAppStoreDb ?? (g.__devAppStoreDb = create());
