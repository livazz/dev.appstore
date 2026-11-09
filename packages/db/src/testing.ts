import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema/index';
import type { DB } from './index';

/** Base Postgres en mémoire avec le schéma appliqué — pour les tests (vitest). */
export async function createTestDb(): Promise<DB> {
  const { pushSchema } = await import('drizzle-kit/api');
  const tdb = drizzle(new PGlite(), { schema });
  const { apply } = await pushSchema(schema, tdb as never);
  await apply();
  return tdb;
}
