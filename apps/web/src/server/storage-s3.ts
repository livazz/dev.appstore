import { createHash, createHmac } from 'node:crypto';
import { contentTypeForKey, isSafeKey, type StorageAdapter, type StoredFile } from './storage';

/*
 * Adaptateur de stockage S3 / Cloudflare R2 (phase 2, DEVAPPSTORE_STORAGE=s3).
 *
 * Signature AWS Signature Version 4 implémentée ici avec node:crypto (aucune dépendance) et vérifiée
 * contre les vecteurs officiels de la documentation S3 (voir storage-s3.test.ts).
 * Adressage « path-style » (`<endpoint>/<bucket>/<clé>`), pris en charge par R2, MinIO et AWS S3.
 * Les objets sont immuables (clés uniques générées à l'upload) : Cache-Control long + immutable.
 */

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SignInput {
  method: string;
  url: string;
  /** En-têtes à envoyer ET à signer (Host est ajouté automatiquement s'il manque). */
  headers?: Record<string, string>;
  /** SHA-256 hex du corps ; « UNSIGNED-PAYLOAD » accepté. Par défaut : hash du corps vide. */
  payloadHash?: string;
  region: string;
  service?: string;
  credentials: S3Credentials;
  date?: Date;
}

export interface SignedRequest {
  /** En-têtes signés, Authorization incluse (Host inclus : à retirer avant fetch, qui le pose lui-même). */
  headers: Record<string, string>;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** Encodage URI au sens SigV4 : tout sauf A-Z a-z 0-9 - _ . ~ (et « / » dans le chemin). */
export function uriEncode(s: string, keepSlash = false): string {
  const enc = encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return keepSlash ? enc.replace(/%2F/g, '/') : enc;
}

/** 20130524T000000Z */
export function amzDate(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/**
 * Signe une requête (AWS SigV4, en-tête Authorization). Le chemin de `url` doit déjà être encodé
 * une fois (comme l'enverrait fetch) : S3 ne ré-encode pas le chemin canonique.
 */
export function signV4(input: SignInput): SignedRequest {
  const { method, region, credentials } = input;
  const service = input.service ?? 's3';
  const url = new URL(input.url);
  const date = input.date ?? new Date();
  const datetime = amzDate(date);
  const day = datetime.slice(0, 8);
  const payloadHash = input.payloadHash ?? EMPTY_SHA256;

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v;
  headers.host ??= url.host;
  headers['x-amz-date'] = datetime;
  if (service === 's3') headers['x-amz-content-sha256'] ??= payloadHash;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    url.pathname || '/',
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac('AWS4' + credentials.secretAccessKey, day);
  const kSigning = hmac(hmac(hmac(kDate, region), service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers, canonicalRequest, stringToSign, signature };
}

export interface S3StorageConfig {
  /** Ex. R2 : https://<account_id>.eu.r2.cloudflarestorage.com ; AWS : https://s3.eu-west-3.amazonaws.com */
  endpoint: string;
  /** « auto » pour R2. */
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** URL publique du bucket ou du CDN (domaine personnalisé R2), sans « / » final requis. */
  publicUrl: string;
  /** Injection pour les tests. */
  fetch?: typeof fetch;
  now?: () => Date;
}

export class S3StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'S3StorageError';
  }
}

export class S3Storage implements StorageAdapter {
  private readonly endpoint: string;
  private readonly region: string;
  private readonly publicUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: S3StorageConfig) {
    for (const k of ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey', 'publicUrl'] as const) {
      if (!config[k]) throw new Error(`Configuration S3 incomplète : ${k} manquant`);
    }
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.region = config.region || 'auto';
    this.publicUrl = config.publicUrl.replace(/\/+$/, '');
    this.fetchImpl = config.fetch ?? ((...a) => fetch(...a));
    this.now = config.now ?? (() => new Date());
  }

  /** URL publique (CDN) d'une clé. */
  publicUrlFor(key: string): string {
    return `${this.publicUrl}/${uriEncode(key, true)}`;
  }

  private objectUrl(key: string): string {
    return `${this.endpoint}/${uriEncode(this.config.bucket)}/${uriEncode(key, true)}`;
  }

  private async send(method: string, key: string, body?: Uint8Array, headers: Record<string, string> = {}) {
    const url = this.objectUrl(key);
    const signed = signV4({
      method,
      url,
      headers,
      payloadHash: body ? sha256Hex(body) : EMPTY_SHA256,
      region: this.region,
      credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey },
      date: this.now(),
    });
    const sendHeaders = { ...signed.headers };
    delete sendHeaders.host; // fetch pose lui-même Host (en-tête interdit côté undici)
    return this.fetchImpl(url, { method, headers: sendHeaders, body: body as BodyInit | undefined, cache: 'no-store' });
  }

  private static async fail(op: string, key: string, res: Response): Promise<never> {
    const text = await res.text().catch(() => '');
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    throw new S3StorageError(`S3 ${op} ${key} : HTTP ${res.status}${code ? ` (${code})` : ''}`, res.status);
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!isSafeKey(key)) throw new Error('Clé de stockage invalide');
    const res = await this.send('PUT', key, new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), {
      'content-type': contentType || contentTypeForKey(key),
      'cache-control': IMMUTABLE_CACHE_CONTROL,
    });
    if (!res.ok) await S3Storage.fail('PUT', key, res);
    return this.publicUrlFor(key);
  }

  async get(key: string): Promise<StoredFile | null> {
    if (!isSafeKey(key)) return null;
    const res = await this.send('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) await S3Storage.fail('GET', key, res);
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') || contentTypeForKey(key),
    };
  }

  /** Supprime l'objet. Renvoie false si la clé est invalide ; idempotent (objet absent = succès). */
  async delete(key: string): Promise<boolean> {
    if (!isSafeKey(key)) return false;
    const res = await this.send('DELETE', key);
    if (!res.ok && res.status !== 404) await S3Storage.fail('DELETE', key, res);
    return true;
  }
}

/** Construit l'adaptateur à partir des variables S3_* (échec explicite si l'une manque). */
export function s3StorageFromEnv(env: Record<string, string | undefined> = process.env): S3Storage {
  const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'].filter(
    (k) => !env[k],
  );
  if (missing.length) throw new Error(`DEVAPPSTORE_STORAGE=s3 : variables manquantes : ${missing.join(', ')}`);
  return new S3Storage({
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION || 'auto',
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    publicUrl: env.S3_PUBLIC_URL!,
  });
}
