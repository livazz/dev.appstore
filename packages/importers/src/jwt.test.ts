import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeJwt, normalizePem, signJwt } from './jwt';
import { createAppStoreConnectToken } from './apple/client';
import { createServiceAccountAssertion } from './google/auth';

const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const ecPem = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rsaPem = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function verifyJwt(token: string, publicKey: Parameters<typeof verify>[2], alg: 'ES256' | 'RS256') {
  const [h, p, s] = token.split('.');
  const sig = Buffer.from(s!, 'base64url');
  if (alg === 'ES256') expect(sig.length).toBe(64); // r‖s, pas DER
  return verify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    alg === 'ES256' ? { key: publicKey as never, dsaEncoding: 'ieee-p1363' } : (publicKey as never),
    sig,
  );
}

describe('JWT', () => {
  it('jeton App Store Connect ES256 conforme à la documentation Apple', () => {
    const now = Date.UTC(2026, 10, 9, 12, 0, 0);
    const token = createAppStoreConnectToken({ issuerId: '57246542-96fe-1a63-e053-0824d011072a', keyId: '2X9R4HXF34', privateKey: ecPem }, { now });
    const { header, payload } = decodeJwt(token);
    expect(header).toEqual({ alg: 'ES256', kid: '2X9R4HXF34', typ: 'JWT' });
    expect(payload).toEqual({ iss: '57246542-96fe-1a63-e053-0824d011072a', iat: now / 1000, exp: now / 1000 + 1200, aud: 'appstoreconnect-v1' });
    expect(verifyJwt(token, ec.publicKey, 'ES256')).toBe(true);
  });

  it('plafonne la durée de vie à 20 minutes', () => {
    const token = createAppStoreConnectToken({ issuerId: 'i', keyId: 'k', privateKey: ecPem }, { now: 0, ttlSeconds: 3600 });
    const { payload } = decodeJwt(token);
    expect((payload.exp as number) - (payload.iat as number)).toBe(1200);
  });

  it('accepte une clé .p8 avec des \\n littéraux ou sans en-têtes', () => {
    const escaped = ecPem.replace(/\n/g, '\\n');
    const bare = ecPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    for (const k of [escaped, bare]) {
      const token = signJwt('ES256', { typ: 'JWT' }, { a: 1 }, k);
      expect(verifyJwt(token, ec.publicKey, 'ES256')).toBe(true);
    }
    expect(normalizePem(bare)).toContain('-----BEGIN PRIVATE KEY-----');
  });

  it('assertion de compte de service Google RS256', () => {
    const now = 1_700_000_000_000;
    const token = createServiceAccountAssertion(
      { client_email: 'wolleen-import@nova-games.iam.gserviceaccount.com', private_key: rsaPem, private_key_id: 'abc123' },
      { now },
    );
    const { header, payload } = decodeJwt(token);
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'abc123' });
    expect(payload).toEqual({
      iss: 'wolleen-import@nova-games.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    expect(verifyJwt(token, rsa.publicKey, 'RS256')).toBe(true);
  });
});
