import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { env } from '@/env';
import { s3StorageFromEnv } from './storage-s3';

/*
 * Stockage des fichiers téléversés (tâche « uploads »).
 * WOLLEEN_STORAGE=local (défaut) : disque local (.data/uploads), servi par GET /api/uploads/….
 * WOLLEEN_STORAGE=s3 : Cloudflare R2 / S3 (storage-s3.ts), put → URL publique S3_PUBLIC_URL/<clé> (docs/deploy-storage.md).
 */

export interface StoredFile {
  buffer: Buffer;
  contentType: string;
}

export interface StorageAdapter {
  /** Enregistre le fichier et renvoie son URL publique. */
  put(key: string, buffer: Buffer, contentType: string): Promise<string>;
  /** Lit le fichier, ou null s'il n'existe pas (ou clé invalide). */
  get(key: string): Promise<StoredFile | null>;
}

/**
 * Seules les clés produites par storeUpload sont valides : `<icon|banner|item>/<utilisateur>/<id>.webp`
 * (tout est ré-encodé en WebP). Pas de « .. », de « \ », de chemin absolu, de segment en plus ni d'autre extension.
 */
const KEY_RE = /^(icon|banner|item)\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9-]{1,64}\.webp$/;

/** Valide une clé : segments simples, pas de « .. », pas de chemin absolu. */
export function isSafeKey(key: string): boolean {
  return typeof key === 'string' && key.length <= 256 && KEY_RE.test(key);
}

const TYPES: Record<string, string> = { webp: 'image/webp' };

/** Octets magiques WebP (« RIFF » + taille + « WEBP ») : le fichier servi doit réellement être une image WebP. */
export function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP';
}

/**
 * En-têtes de service des fichiers téléversés (CHK-UPL-06) : type forcé, pas de détection par le navigateur,
 * aucune exécution possible même si le fichier est ouvert directement (CSP sandbox), pas d'intégration en cadre.
 */
export const UPLOAD_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'image/webp',
  'Content-Disposition': 'inline; filename="image.webp"',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-site',
  'Referrer-Policy': 'no-referrer',
};

export function contentTypeForKey(key: string): string {
  return TYPES[(key.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';
}

function dataDir(): string {
  if (env.WOLLEEN_DATA_DIR) return env.WOLLEEN_DATA_DIR;
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    const pkg = resolve(dir, 'package.json');
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).name === 'wolleen') return resolve(dir, '.data');
    dir = dirname(dir);
  }
  return resolve(process.cwd(), '.data');
}

export class LocalDiskStorage implements StorageAdapter {
  constructor(
    private readonly root: string = resolve(dataDir(), 'uploads'),
    private readonly publicPrefix = '/api/uploads/',
  ) {}

  private path(key: string): string | null {
    if (!isSafeKey(key)) return null;
    const root = resolve(this.root);
    const p = resolve(root, key);
    return p.startsWith(root + sep) ? p : null;
  }

  async put(key: string, buffer: Buffer, _contentType: string): Promise<string> {
    const p = this.path(key);
    if (!p) throw new Error('Clé de stockage invalide');
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, buffer);
    return this.publicPrefix + key;
  }

  async get(key: string): Promise<StoredFile | null> {
    const p = this.path(key);
    if (!p) return null;
    try {
      return { buffer: await readFile(p), contentType: contentTypeForKey(key) };
    } catch {
      return null;
    }
  }
}

let instance: StorageAdapter | undefined;

/** Adaptateur choisi par WOLLEEN_STORAGE (« local » par défaut, « s3 » pour Cloudflare R2 / S3). */
export function getStorage(): StorageAdapter {
  if (instance) return instance;
  const kind = env.WOLLEEN_STORAGE;
  if (kind === 'local') return (instance = new LocalDiskStorage());
  if (kind === 's3') {
    return (instance = s3StorageFromEnv({
      S3_ENDPOINT: env.S3_ENDPOINT,
      S3_REGION: env.S3_REGION,
      S3_BUCKET: env.S3_BUCKET,
      S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
      S3_PUBLIC_URL: env.S3_PUBLIC_URL,
    }));
  }
  throw new Error(`Adaptateur de stockage non pris en charge : ${String(kind)}`);
}

/** Réinitialise l'adaptateur mémorisé (tests). */
export function resetStorageForTests(): void {
  instance = undefined;
}
