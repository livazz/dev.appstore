import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDiskStorage, getStorage, resetStorageForTests } from './storage';
import { S3Storage } from './storage-s3';

/* Choix de l'adaptateur de stockage par DEVAPPSTORE_STORAGE (lu dans env). */

const S3_VARS = {
  S3_ENDPOINT: 'https://acct.eu.r2.cloudflarestorage.com',
  S3_BUCKET: 'devappstore-uploads',
  S3_ACCESS_KEY_ID: 'AKIDEXAMPLE',
  S3_SECRET_ACCESS_KEY: 'secret-example',
  S3_PUBLIC_URL: 'https://cdn.devappstore.example',
};

afterEach(() => {
  vi.unstubAllEnvs();
  resetStorageForTests();
});

describe('getStorage', () => {
  it('local par défaut', () => {
    vi.stubEnv('DEVAPPSTORE_STORAGE', '');
    expect(getStorage()).toBeInstanceOf(LocalDiskStorage);
  });

  it('DEVAPPSTORE_STORAGE=s3 → adaptateur R2/S3 configuré par les variables S3_*', async () => {
    vi.stubEnv('DEVAPPSTORE_STORAGE', 's3');
    for (const [k, v] of Object.entries(S3_VARS)) vi.stubEnv(k, v);
    const s = getStorage();
    expect(s).toBeInstanceOf(S3Storage);
    expect(getStorage()).toBe(s); // mémorisé

    // put → URL publique du CDN (fetch simulé, aucun appel réseau).
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const url = await s.put('item/usr_1/abc-123.webp', Buffer.from('RIFF0000WEBP'), 'image/webp');
      expect(url).toBe('https://cdn.devappstore.example/item/usr_1/abc-123.webp');
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('DEVAPPSTORE_STORAGE=s3 sans configuration : erreur explicite listant les variables manquantes', () => {
    vi.stubEnv('DEVAPPSTORE_STORAGE', 's3');
    for (const k of Object.keys(S3_VARS)) vi.stubEnv(k, '');
    expect(() => getStorage()).toThrow(/S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL/);
  });
});
