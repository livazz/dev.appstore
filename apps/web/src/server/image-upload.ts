import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { StorageAdapter } from './storage';

export type UploadKind = 'icon' | 'banner' | 'item';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Plafond du corps multipart lu par POST /api/uploads (fichier + enveloppe multipart). */
export const MAX_UPLOAD_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
/** Décompression maximale (anti « bombe » PNG) : vérifiée sur l'en-tête avant tout décodage. */
export const MAX_INPUT_PIXELS = 40_000_000;
/** Formats acceptés, déterminés par les octets (sharp) — jamais par l'extension ni le Content-Type du client. */
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

/**
 * Valide puis ré-encode en WebP aux dimensions du type (transparence conservée, métadonnées EXIF/ICC supprimées).
 * Le type est déterminé par les octets magiques (sharp) : `_declaredType` (Content-Type client) est ignoré.
 */
export async function processImage(input: Buffer, _declaredType: string, kind: UploadKind): Promise<Buffer> {
  if (input.length === 0) throw new UploadError(400, 'Fichier vide');
  if (input.length > MAX_UPLOAD_BYTES) throw new UploadError(413, 'Fichier trop volumineux (5 Mo max)');
  let meta: sharp.Metadata;
  try {
    // metadata() ne lit que l'en-tête : on contrôle nous-mêmes les dimensions juste après (pas de décodage ici).
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new UploadError(415, 'Image illisible');
  }
  // Vérifie le contenu réel (refuse SVG, HTML, texte… même déguisés en .png / image/png).
  if (!meta.format || !SHARP_FORMATS.has(meta.format)) throw new UploadError(415, 'Type de fichier non autorisé');
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw new UploadError(413, 'Image trop grande (40 mégapixels max)');
  }
  const img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  if (kind === 'icon') img.resize(300, 300, { fit: 'cover', position: 'attention' });
  else if (kind === 'banner') img.resize(1600, 500, { fit: 'inside', withoutEnlargement: true });
  else img.resize(600, 600, { fit: 'inside', withoutEnlargement: true });
  try {
    return await img.webp({ quality: 85, alphaQuality: 100 }).toBuffer();
  } catch {
    throw new UploadError(415, 'Image illisible');
  }
}

/** Préfixe de clé pour un utilisateur (les caractères hors [A-Za-z0-9_-] sont remplacés). */
export function uploaderSegment(userId: string): string {
  return userId.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
}

export async function storeUpload(
  storage: StorageAdapter,
  userId: string,
  input: Buffer,
  declaredType: string,
  kind: UploadKind,
): Promise<string> {
  const out = await processImage(input, declaredType, kind);
  // Clé générée côté serveur : le nom de fichier du client n'apparaît jamais dans le chemin.
  return storage.put(`${kind}/${uploaderSegment(userId)}/${randomUUID()}.webp`, out, 'image/webp');
}

/** URL publique d'un upload Wolleen (/api/uploads/<kind>/<utilisateur>/<id>.webp) → segment de l'uploadeur, ou null. */
export function uploaderOfUrl(url: string): string | null {
  const m = /^\/api\/uploads\/(?:icon|banner|item)\/([A-Za-z0-9_-]{1,64})\/[A-Za-z0-9-]{1,64}\.webp$/.exec(url);
  return m ? m[1]! : null;
}

/** Rôles autorisés à téléverser des visuels (édition de boutique, cf. matrice du modèle de menaces § 6.6). */
export const UPLOAD_ROLES: readonly string[] = ['owner', 'admin', 'developer'];

/**
 * Anti-CSRF des route handlers authentifiés par cookie (CHK-AUTH-07) : vrai si la requête vient d'un autre site.
 * Un navigateur envoie `Origin` sur un POST (et `Sec-Fetch-Site`) ; un client sans navigateur n'a pas de cookie
 * de victime à détourner.
 */
export function isCrossSiteRequest(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host') || new URL(req.url).host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** Lit le corps de la requête en s'arrêtant au-delà de `maxBytes` (Content-Length absent ou mensonger). */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<Buffer | null> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return null;
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
