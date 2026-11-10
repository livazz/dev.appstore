import { createServer, type Server } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StoreApiError, StoreTransportError, requestJson } from './http';
import { AppStoreConnectClient } from './apple/client';
import { InvalidTokenUriError, parseServiceAccount, fetchGoogleAccessToken, GOOGLE_TOKEN_URI } from './google/auth';
import { importCatalog } from './index';
import { fakeFetch, json } from './test-utils';

/* Revue de sécurité 2026-11, C-01 : SSRF via les importeurs (token_uri, redirections, corps renvoyé au studio). */

let internal: Server;
let evil: Server;
let internalUrl = '';
let evilUrl = '';
let internalHits = 0;

beforeAll(async () => {
  internal = createServer((_req, res) => {
    internalHits++;
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('SECRET_INTERNE');
  });
  await new Promise<void>((r) => internal.listen(0, '127.0.0.1', () => r()));
  internalUrl = `http://127.0.0.1:${(internal.address() as { port: number }).port}/latest/meta-data/`;
  evil = createServer((_req, res) => {
    res.writeHead(302, { location: internalUrl });
    res.end();
  });
  await new Promise<void>((r) => evil.listen(0, '127.0.0.1', () => r()));
  evilUrl = `http://127.0.0.1:${(evil.address() as { port: number }).port}/token`;
});

afterAll(() => {
  internal.close();
  evil.close();
});

const rsaPem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const sa = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'service_account', client_email: 'x@y.iam.gserviceaccount.com', private_key: rsaPem, ...extra });

describe('C-01 : token_uri limité à l’URL officielle de Google', () => {
  it('refuse tout token_uri autre que https://oauth2.googleapis.com/token', () => {
    for (const u of [evilUrl, 'http://169.254.169.254/', 'https://oauth2.googleapis.com/token/../x', 'https://oauth2.googleapis.com.evil.tld/token', 'http://oauth2.googleapis.com/token']) {
      expect(() => parseServiceAccount(sa({ token_uri: u }))).toThrow(InvalidTokenUriError);
    }
    expect(parseServiceAccount(sa({ token_uri: GOOGLE_TOKEN_URI })).token_uri).toBe(GOOGLE_TOKEN_URI);
    expect(parseServiceAccount(sa()).client_email).toBe('x@y.iam.gserviceaccount.com');
  });

  it('le jeton est toujours demandé à oauth2.googleapis.com, même si token_uri a été altéré après validation', async () => {
    const fetch = fakeFetch({ 'POST /token': () => ({ access_token: 'ya29', expires_in: 3600 }) });
    await fetchGoogleAccessToken({ ...parseServiceAccount(sa()), token_uri: evilUrl }, { fetch });
    expect(fetch.calls.map((c) => c.url.origin)).toEqual(['https://oauth2.googleapis.com']);
  });

  it('un token_uri malveillant n’atteint aucun service interne et rien n’est renvoyé au studio', async () => {
    internalHits = 0;
    const r = await importCatalog({ googlePlay: { serviceAccount: sa({ token_uri: evilUrl }), packageName: 'com.a.b' } });
    expect(internalHits).toBe(0);
    expect(JSON.stringify(r.warnings)).not.toContain('SECRET');
    expect(r.warnings[0]?.message).toMatch(/token_uri/);
  });
});

describe('C-01 : requestJson durci', () => {
  it('ne suit pas les redirections (vrai fetch)', async () => {
    internalHits = 0;
    await expect(requestJson('google_oauth', evilUrl, { method: 'POST' }, { retries: 0 })).rejects.toBeInstanceOf(StoreTransportError);
    expect(internalHits).toBe(0);
  });

  it('le message d’erreur ne contient jamais le corps brut d’une réponse non JSON', async () => {
    const e = await requestJson<never>('google_play', internalUrl, {}, { retries: 0 }).catch((x: unknown) => x as Error);
    expect(e).toBeInstanceOf(StoreApiError);
    expect(e.message).toContain('HTTP 403');
    expect(e.message).not.toContain('SECRET');
  });

  it('réponse 2xx non JSON : message générique, sans extrait', async () => {
    const fetch = fakeFetch({ '/x': () => new Response('SECRET_INTERNE', { status: 200 }) });
    const e = await requestJson<never>('google_play', 'https://androidpublisher.googleapis.com/x', {}, { fetch }).catch((x: unknown) => x as Error);
    expect(e).toBeInstanceOf(StoreTransportError);
    expect(e.message).not.toContain('SECRET');
  });

  it('garde le libellé structuré des erreurs JSON des stores', async () => {
    const fetch = fakeFetch({ '/x': () => json({ errors: [{ title: 'Unauthorized', detail: 'Bad token' }] }, 401) });
    const e = await requestJson<never>('app_store_connect', 'https://api.appstoreconnect.apple.com/x', {}, { fetch }).catch((x: unknown) => x as Error);
    expect(e.message).toBe('app_store_connect : HTTP 401 sur https://api.appstoreconnect.apple.com/x — Unauthorized : Bad token');
  });

  it('refuse une réponse trop volumineuse', async () => {
    const fetch = fakeFetch({ '/x': () => new Response('x'.repeat(2048), { status: 200 }) });
    await expect(requestJson('google_play', 'https://androidpublisher.googleapis.com/x', {}, { fetch, maxResponseBytes: 1024 })).rejects.toThrow(/trop volumineuse/);
  });

  it('abandonne une requête qui ne répond pas (délai)', async () => {
    const hang: typeof globalThis.fetch = (_u, init) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
    await expect(requestJson('google_play', 'https://androidpublisher.googleapis.com/x', {}, { fetch: hang as never, timeoutMs: 20 })).rejects.toThrow(/délai dépassé/);
  });

  it('passe redirect: "error" à fetch', async () => {
    const fetch = fakeFetch({ '/x': () => ({ ok: true }) });
    await requestJson('google_play', 'https://androidpublisher.googleapis.com/x', {}, { fetch });
    expect(fetch.calls[0]!.init?.redirect).toBe('error');
  });
});

describe('C-01 : pagination App Store Connect', () => {
  it('refuse un links.next hors de l’origine de l’API (le jeton Apple ne part pas ailleurs)', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const client = new AppStoreConnectClient({ issuerId: 'i', keyId: 'k', privateKey: ec });
    expect(() => client.url('https://evil.tld/v1/apps')).toThrow(/refusée/);
    expect(client.url('https://api.appstoreconnect.apple.com/v1/apps?cursor=2')).toContain('cursor=2');
  });
});
