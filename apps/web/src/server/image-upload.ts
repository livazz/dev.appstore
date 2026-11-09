import { randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import type { StorageAdapter } from './storage';
import { getRateLimitStore, type RateLimitStore, type RateRule } from './rate-limit';

export type UploadKind = 'icon' | 'banner' | 'item';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Plafond du corps multipart lu par POST /api/uploads (fichier + enveloppe multipart). */
export const MAX_UPLOAD_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
/**
 * Décompression maximale (anti « bombe » PNG) : vérifiée sur l'en-tête avant tout décodage.
 * 24 Mpx (≈ 96 Mo de pixels RGBA) suffisent largement pour une icône de 300 px ou une bannière de 1 600 px
 * (revue 2026-11, C-03 : 40 Mpx auparavant).
 */
export const MAX_INPUT_PIXELS = 24_000_000;
/**
 * Formats acceptés, déterminés par les octets (sharp) — jamais par l'extension ni le Content-Type du client.
 * Liste blanche CHK-UPL-02 : PNG, JPEG, WebP, GIF (HEIF/AVIF retirés : surface de décodage libheif inutile, C-07).
 */
const SHARP_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);

/** Limites de débit des uploads par utilisateur (revue 2026-11, C-03, T-UPL-04). */
export const UPLOAD_RATE_RULES: readonly (RateRule & { id: string })[] = [
  { id: '10m', max: 30, windowMs: 10 * 60_000 },
  { id: '24h', max: 200, windowMs: 24 * 60 * 60_000 },
];

/** Compte un upload : null si autorisé, sinon le délai d'attente (s) avant de réessayer. */
export async function checkUploadRate(userId: string, store: RateLimitStore = getRateLimitStore()): Promise<number | null> {
  for (const rule of UPLOAD_RATE_RULES) {
    const d = await store.hit(`upload:${rule.id}:${userId}`, rule);
    if (!d.allowed) return d.retryAfterS;
  }
  return null;
}

/**
 * Décodages sharp simultanés par instance (C-03) : au-delà, les requêtes attendent ; si la file est pleine,
 * 503 immédiat plutôt qu'une saturation mémoire.
 */
export const MAX_CONCURRENT_DECODES = 2;
export const MAX_QUEUED_DECODES = 16;
let activeDecodes = 0;
const decodeQueue: (() => void)[] = [];

export async function withDecodeSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeDecodes >= MAX_CONCURRENT_DECODES) {
    if (decodeQueue.length >= MAX_QUEUED_DECODES) throw new UploadError(503, 'Serveur occupé : réessayez dans un instant.');
    await new Promise<void>((resolve) => decodeQueue.push(resolve));
  } else {
    activeDecodes++;
  }
  try {
    return await fn();
  } finally {
    const next = decodeQueue.shift();
    if (next) next(); // le créneau passe directement à la requête suivante
    else activeDecodes--;
  }
}

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
  let meta: Metadata;
  try {
    // metadata() ne lit que l'en-tête : on contrôle nous-mêmes les dimensions juste après (pas de décodage ici).
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new UploadError(415, 'Image illisible');
  }
  // Vérifie le contenu réel (refuse SVG, HTML, texte… même déguisés en .png / image/png).
  if (!meta.format || !SHARP_FORMATS.has(meta.format)) throw new UploadError(415, 'Type de fichier non autorisé');
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw new UploadError(413, 'Image trop grande (24 mégapixels max)');
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
  const out = await withDecodeSlot(() => processImage(input, declaredType, kind));
  // Clé générée côté serveur : le nom de fichier du client n'apparaît jamais dans le chemin.
  return storage.put(`${kind}/${uploaderSegment(userId)}/${randomUUID()}.webp`, out, 'image/webp');
}

const UPLOAD_KEY_RE = /^(?:icon|banner|item)\/([A-Za-z0-9_-]{1,64})\/[A-Za-z0-9-]{1,64}\.webp$/;

/**
 * Base publique du stockage S3/R2 (`S3_PUBLIC_URL`, sans « / » final), ou null si absente / invalide.
 * Seules les bases http(s) sans identifiants, requête ni fragment sont retenues.
 */
export function s3PublicBase(raw: string | undefined = process.env.S3_PUBLIC_URL): string | null {
  const v = raw?.trim().replace(/\/+$/, '');
  if (!v) return null;
  try {
    const u = new URL(v);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.search || u.hash) return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * URL publique d'un upload produit par NOTRE stockage → segment de l'uploadeur, ou null (CHK-UPL-07) :
 * - disque local : `/api/uploads/<kind>/<utilisateur>/<id>.webp` ;
 * - S3/R2 : `<S3_PUBLIC_URL>/<kind>/<utilisateur>/<id>.webp` (même forme de clé, cf. storeUpload / S3Storage.publicUrlFor).
 * Toute autre URL (https tierce, autre chemin du site, autre préfixe sur le même hôte) est refusée.
 */
export function uploaderOfUrl(url: string, publicBase: string | null = s3PublicBase()): string | null {
  if (typeof url !== 'string' || url.length > 1024) return null;
  let key: string | null = null;
  if (url.startsWith('/api/uploads/')) key = url.slice('/api/uploads/'.length);
  else if (publicBase && url.startsWith(`${publicBase}/`)) key = url.slice(publicBase.length + 1);
  const m = key ? UPLOAD_KEY_RE.exec(key) : null;
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
