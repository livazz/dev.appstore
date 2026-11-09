import { describe, expect, it } from 'vitest';
import { decryptJson, decryptSecret, deriveKey, encryptJson, encryptSecret, rootSecret, SecretDecryptError } from './secrets';

const key = deriveKey('un-secret-de-test-suffisamment-long');

describe('secrets (AES-256-GCM + HKDF)', () => {
  it('chiffre puis déchiffre (aller-retour), avec IV aléatoire', () => {
    const a = encryptSecret('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', { key, aad: 'gam_1:app_store' });
    const b = encryptSecret('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', { key, aad: 'gam_1:app_store' });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(Buffer.from(a.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(a.tag, 'base64')).toHaveLength(16);
    expect(a.ciphertext).not.toContain('PRIVATE');
    expect(decryptSecret(a, { key, aad: 'gam_1:app_store' })).toContain('BEGIN PRIVATE KEY');
  });

  it('refuse un texte altéré, une autre clé ou un autre contexte (AAD)', () => {
    const enc = encryptJson({ issuerId: 'x', privateKey: 'y' }, { key, aad: 'gam_1:app_store' });
    expect(decryptJson(enc, { key, aad: 'gam_1:app_store' })).toEqual({ issuerId: 'x', privateKey: 'y' });

    const bytes = Buffer.from(enc.ciphertext, 'base64');
    bytes[0] = bytes[0]! ^ 1;
    expect(() => decryptSecret({ ...enc, ciphertext: bytes.toString('base64') }, { key, aad: 'gam_1:app_store' })).toThrow(SecretDecryptError);
    expect(() => decryptSecret(enc, { key: deriveKey('autre-secret'), aad: 'gam_1:app_store' })).toThrow(SecretDecryptError);
    expect(() => decryptSecret(enc, { key, aad: 'gam_2:app_store' })).toThrow(SecretDecryptError);
    expect(() => decryptSecret({ ...enc, tag: 'AAAA' }, { key, aad: 'gam_1:app_store' })).toThrow(SecretDecryptError);
  });

  it('dérive une clé de 32 octets, différente selon le secret et l’usage (info HKDF)', () => {
    expect(key).toHaveLength(32);
    expect(deriveKey('s', 'a').equals(deriveKey('s', 'a'))).toBe(true);
    expect(deriveKey('s', 'a').equals(deriveKey('s', 'b'))).toBe(false);
    expect(deriveKey('s1', 'a').equals(deriveKey('s2', 'a'))).toBe(false);
  });

  it('lit BETTER_AUTH_SECRET puis AUTH_SECRET, exige un secret en production', () => {
    expect(rootSecret({ BETTER_AUTH_SECRET: 'b', AUTH_SECRET: 'a' } as NodeJS.ProcessEnv)).toBe('b');
    expect(rootSecret({ AUTH_SECRET: 'a' } as NodeJS.ProcessEnv)).toBe('a');
    expect(rootSecret({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toMatch(/dev/);
    expect(() => rootSecret({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/requis/);
  });

  it('utilise la clé dérivée du secret de l’environnement par défaut', () => {
    const enc = encryptSecret('bonjour');
    expect(decryptSecret(enc)).toBe('bonjour');
    expect(decryptSecret(enc, { key: deriveKey(rootSecret()) })).toBe('bonjour');
  });
});
