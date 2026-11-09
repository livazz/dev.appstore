import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { StorageAdapter } from './storage';

export type UploadKind = 'icon' | 'banner' | 'item';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const SHARP_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif', 'heif']);

export class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseKind(v: string | null): UploadKind | null {
  return v === 'icon' || v === 'banner' || v === 'item' ? v : null;
}

/** Valide puis convertit en WebP aux dimensions du type (transparence conservée). */
export async function processImage(input: Buffer, declaredType: string, kind: UploadKind): Promise<Buffer> {
  if (input.length === 0) throw new UploadError(400, 'Fichier vide');
  if (input.length > MAX_UPLOAD_BYTES) throw new UploadError(413, 'Fichier trop volumineux (5 Mo max)');
  if (!ALLOWED.has(declaredType)) throw new UploadError(415, 'Type de fichier non autorisé');
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new UploadError(415, 'Image illisible');
  }
  // Vérifie le contenu réel (refuse SVG même déguisé).
  if (!format || !SHARP_FORMATS.has(format)) throw new UploadError(415, 'Type de fichier non autorisé');
  const img = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  if (kind === 'icon') img.resize(300, 300, { fit: 'cover', position: 'attention' });
  else if (kind === 'banner') img.resize(1600, 500, { fit: 'inside', withoutEnlargement: true });
  else img.resize(600, 600, { fit: 'inside', withoutEnlargement: true });
  try {
    return await img.webp({ quality: 85, alphaQuality: 100 }).toBuffer();
  } catch {
    throw new UploadError(415, 'Image illisible');
  }
}

export async function storeUpload(
  storage: StorageAdapter,
  userId: string,
  input: Buffer,
  declaredType: string,
  kind: UploadKind,
): Promise<string> {
  const out = await processImage(input, declaredType, kind);
  const safeUser = userId.replace(/[^a-z0-9_-]/gi, '_');
  return storage.put(`${kind}/${safeUser}/${randomUUID()}.webp`, out, 'image/webp');
}
