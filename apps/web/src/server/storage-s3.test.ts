import { describe, expect, it } from 'vitest';
import { IMMUTABLE_CACHE_CONTROL, S3Storage, S3StorageError, s3StorageFromEnv, sha256Hex, signV4, uriEncode } from './storage-s3';

/*
 * Vecteurs officiels : documentation AWS S3, « Signature Calculations for the Authorization Header:
 * Transferring Payload in a Single Chunk (AWS Signature Version 4) » — exemples GET Object, PUT Object,
 * GET Bucket Lifecycle et GET Bucket (List Objects).
 */
const AWS = {
  credentials: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
  region: 'us-east-1',
  date: new Date('2013-05-24T00:00:00Z'),
};
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('signature SigV4 — vecteurs de test AWS', () => {
  it('GET Object (en-tête Range)', () => {
    const s = signV4({ ...AWS, method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { Range: 'bytes=0-9' } });
    expect(s.canonicalRequest).toBe(
      [
        'GET',
        '/test.txt',
        '',
        'host:examplebucket.s3.amazonaws.com',
        'range:bytes=0-9',
        `x-amz-content-sha256:${EMPTY}`,
        'x-amz-date:20130524T000000Z',
        '',
        'host;range;x-amz-content-sha256;x-amz-date',
        EMPTY,
      ].join('\n'),
    );
    expect(s.stringToSign).toBe(
      'AWS4-HMAC-SHA256\n20130524T000000Z\n20130524/us-east-1/s3/aws4_request\n' +
        '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972',
    );
    expect(s.signature).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
    expect(s.headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('PUT Object (clé avec « $ », corps signé)', () => {
    const body = 'Welcome to Amazon S3.';
    expect(sha256Hex(body)).toBe('44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
    const s = signV4({
      ...AWS,
      method: 'PUT',
      url: `https://examplebucket.s3.amazonaws.com/${uriEncode('test$file.text', true)}`,
      headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      payloadHash: sha256Hex(body),
    });
    expect(s.canonicalRequest.split('\n')[1]).toBe('/test%24file.text');
    expect(s.signature).toBe('98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  });

  it('GET Bucket Lifecycle (sous-ressource sans valeur)', () => {
    const s = signV4({ ...AWS, method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/?lifecycle' });
    expect(s.canonicalRequest.split('\n')[2]).toBe('lifecycle=');
    expect(s.signature).toBe('fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543');
  });

  it('GET Bucket / List Objects (paramètres triés)', () => {
    const s = signV4({ ...AWS, method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/?prefix=J&max-keys=2' });
    expect(s.canonicalRequest.split('\n')[2]).toBe('max-keys=2&prefix=J');
    expect(s.signature).toBe('34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
  });
});

interface Call {
  url: string;
  init: RequestInit;
}

function fakeS3(respond: (c: Call) => Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const c = { url: String(url), init: init ?? {} };
    calls.push(c);
    return respond(c);
  }) as typeof fetch;
  const storage = new S3Storage({
    endpoint: 'https://acc123.eu.r2.cloudflarestorage.com/',
    bucket: 'wolleen-uploads',
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
    publicUrl: 'https://cdn.wolleen.test/',
    fetch: fetchImpl,
    now: () => new Date('2026-11-09T12:34:56Z'),
  });
  return { storage, calls };
}

const hdr = (c: Call) => c.init.headers as Record<string, string>;

describe('S3Storage (fetch simulé)', () => {
  it('put : PUT signé path-style, Content-Type, Cache-Control immuable, renvoie l’URL publique', async () => {
    const { storage, calls } = fakeS3(() => new Response(null, { status: 200 }));
    const body = Buffer.from('image-bytes');
    const url = await storage.put('icon/usr_1/abc.webp', body, 'image/webp');
    expect(url).toBe('https://cdn.wolleen.test/icon/usr_1/abc.webp');
    expect(calls).toHaveLength(1);
    const [c] = calls;
    expect(c.url).toBe('https://acc123.eu.r2.cloudflarestorage.com/wolleen-uploads/icon/usr_1/abc.webp');
    expect(c.init.method).toBe('PUT');
    const h = hdr(c);
    expect(h['content-type']).toBe('image/webp');
    expect(h['cache-control']).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(h['x-amz-date']).toBe('20261109T123456Z');
    expect(h['x-amz-content-sha256']).toBe(sha256Hex(body));
    expect(h.host).toBeUndefined();
    expect(h.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/20261109\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(Buffer.from(c.init.body as Uint8Array).toString()).toBe('image-bytes');

    // La signature est reproductible et couvre l'hôte que fetch posera.
    const again = signV4({
      method: 'PUT',
      url: c.url,
      headers: { 'content-type': 'image/webp', 'cache-control': IMMUTABLE_CACHE_CONTROL },
      payloadHash: sha256Hex(body),
      region: 'auto',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      date: new Date('2026-11-09T12:34:56Z'),
    });
    expect(h.authorization).toBe(again.headers.authorization);
  });

  it('put : refuse une clé invalide sans appeler le réseau', async () => {
    const { storage, calls } = fakeS3(() => new Response(null));
    await expect(storage.put('../etc/passwd.png', Buffer.from('x'), 'image/png')).rejects.toThrow('Clé de stockage invalide');
    expect(calls).toHaveLength(0);
  });

  it('put : erreur S3 explicite (code XML remonté)', async () => {
    const { storage } = fakeS3(
      () => new Response('<?xml version="1.0"?><Error><Code>SignatureDoesNotMatch</Code></Error>', { status: 403 }),
    );
    const err = await storage.put('item/usr_1/b.webp', Buffer.from('x'), 'image/png').catch((e) => e);
    expect(err).toBeInstanceOf(S3StorageError);
    expect(err.status).toBe(403);
    expect(err.message).toContain('SignatureDoesNotMatch');
  });

  it('get : renvoie le contenu et son type ; null si 404 ou clé invalide', async () => {
    const { storage, calls } = fakeS3((c) =>
      c.url.endsWith('/missing.webp')
        ? new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
        : new Response('PNGDATA', { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const f = await storage.get('item/usr_1/b.webp');
    expect(f?.buffer.toString()).toBe('PNGDATA');
    expect(f?.contentType).toBe('image/png');
    expect(calls[0].init.method).toBe('GET');
    expect(hdr(calls[0])['x-amz-content-sha256']).toBe(EMPTY);
    expect(await storage.get('item/usr_1/missing.webp')).toBeNull();
    expect(await storage.get('../x.png')).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('get : type déduit de l’extension si S3 n’en renvoie pas', async () => {
    const { storage } = fakeS3(() => new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': '' } }));
    expect((await storage.get('item/usr_1/y.webp'))?.contentType).toBe('image/webp');
  });

  it('get : erreur serveur levée (pas masquée en « absent »)', async () => {
    const { storage } = fakeS3(() => new Response('', { status: 500 }));
    await expect(storage.get('item/usr_1/b.webp')).rejects.toBeInstanceOf(S3StorageError);
  });

  it('delete : DELETE signé, idempotent', async () => {
    let status = 204;
    const { storage, calls } = fakeS3(() => new Response(null, { status }));
    expect(await storage.delete('item/usr_1/b.webp')).toBe(true);
    expect(calls[0].init.method).toBe('DELETE');
    status = 404;
    expect(await storage.delete('item/usr_1/b.webp')).toBe(true);
    expect(await storage.delete('nope')).toBe(false);
    expect(calls).toHaveLength(2);
    status = 403;
    await expect(storage.delete('item/usr_1/b.webp')).rejects.toBeInstanceOf(S3StorageError);
  });
});

describe('s3StorageFromEnv', () => {
  const env = {
    S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    S3_BUCKET: 'b',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    S3_PUBLIC_URL: 'https://cdn.example',
  };
  it('construit l’adaptateur (région « auto » par défaut)', () => {
    const s = s3StorageFromEnv(env);
    expect(s).toBeInstanceOf(S3Storage);
    expect(s.publicUrlFor('item/usr_1/b.webp')).toBe('https://cdn.example/item/usr_1/b.webp');
  });
  it('liste les variables manquantes', () => {
    expect(() => s3StorageFromEnv({ ...env, S3_BUCKET: '', S3_PUBLIC_URL: undefined })).toThrow(
      'variables manquantes : S3_BUCKET, S3_PUBLIC_URL',
    );
  });
});
