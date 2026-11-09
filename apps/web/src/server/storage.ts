import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/*
 * Stockage des fichiers téléversés (tâche « uploads »).
 * Phase 1 : disque local (.data/uploads). Phase 2 : S3/R2 derrière la même interface,
 * choisi par WOLLEEN_STORAGE=s3 (non implémenté).
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

const KEY_RE = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.(webp|png|jpg|jpeg|gif|avif)$/i;

/** Valide une clé : segments simples, pas de « .. », pas de chemin absolu. */
export function isSafeKey(key: string): boolean {
  return typeof key === 'string' && key.length <= 256 && KEY_RE.test(key);
}

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  avif: 'image/avif',
};

export function contentTypeForKey(key: string): string {
  return TYPES[(key.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';
}

function dataDir(): string {
  if (process.env.WOLLEEN_DATA_DIR) return process.env.WOLLEEN_DATA_DIR;
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

/** Adaptateur choisi par WOLLEEN_STORAGE (« local » par défaut ; « s3 » prévu en phase 2, compatible R2). */
export function getStorage(): StorageAdapter {
  if (instance) return instance;
  const kind = process.env.WOLLEEN_STORAGE ?? 'local';
  if (kind === 'local') return (instance = new LocalDiskStorage());
  // Phase 2 : instance = new S3Storage({ bucket, endpoint, publicBaseUrl }) ; put → URL publique CDN.
  throw new Error(`Adaptateur de stockage non pris en charge : ${kind}`);
}
