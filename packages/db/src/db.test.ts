import { describe, expect, it } from 'vitest';
import { createTestDb } from './testing';
import { studios } from './schema/index';

describe('createTestDb', () => {
  it('applique le schéma en mémoire', async () => {
    const t = await createTestDb();
    await t.insert(studios).values({ id: 'std_t', name: 'T', slug: 't' });
    expect((await t.select().from(studios)).length).toBe(1);
  }, 30000);
});
