/** Préparation de l'image envoyée à Claude (fonctions pures, sans dépendance). */
import { AiStyleError } from './errors';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export const SUPPORTED_MEDIA_TYPES: readonly ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Limite de l'API Claude pour une image en base64 : 5 Mo. Par prudence elle est appliquée à la chaîne
 * base64 encodée (soit ~3,75 Mo d'octets bruts). Une capture recadrée sur l'article pèse bien moins.
 */
export const MAX_IMAGE_BASE64_BYTES = 5 * 1024 * 1024;

/** Taille de la chaîne base64 (sans retour à la ligne) correspondant à `n` octets. */
export const base64Length = (n: number) => 4 * Math.ceil(n / 3);

/**
 * Image d'entrée :
 * - `data` : octets (`Uint8Array`/`Buffer`/`ArrayBuffer`), base64 brut ou data URL (`data:image/png;base64,…`) ;
 * - `url` : URL HTTPS publique (l'API la télécharge elle-même).
 */
export type ImageInput =
  | { data: Uint8Array | ArrayBuffer | string; mediaType?: ImageMediaType }
  | { url: string };

export type PreparedImage =
  | { type: 'base64'; media_type: ImageMediaType; data: string; bytes: number }
  | { type: 'url'; url: string };

/** Détecte le type d'image d'après ses premiers octets (signatures PNG, JPEG, GIF, WebP). */
export function detectImageMediaType(bytes: Uint8Array): ImageMediaType | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

const isSupported = (t: string): t is ImageMediaType => (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(t);

/** Valide l'image et la convertit en source d'image de l'API (base64 sans retour à la ligne, ou URL). */
export function prepareImage(input: ImageInput): PreparedImage {
  if ('url' in input) {
    let u: URL;
    try {
      u = new URL(input.url);
    } catch {
      throw new AiStyleError('invalid_image', "URL d'image invalide.");
    }
    if (u.protocol !== 'https:') throw new AiStyleError('invalid_image', "L'URL de l'image doit être en HTTPS.");
    return { type: 'url', url: u.toString() };
  }

  let bytes: Uint8Array;
  let declared = input.mediaType as string | undefined;
  if (typeof input.data === 'string') {
    let b64 = input.data.trim();
    const m = /^data:([^;,]+);base64,/i.exec(b64);
    if (m) {
      declared ??= m[1].toLowerCase();
      b64 = b64.slice(m[0].length);
    }
    b64 = b64.replace(/\s+/g, '');
    if (!b64 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) throw new AiStyleError('invalid_image', 'Image base64 invalide.');
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  } else {
    bytes = input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data);
  }

  if (bytes.length === 0) throw new AiStyleError('invalid_image', 'Image vide.');
  if (base64Length(bytes.length) > MAX_IMAGE_BASE64_BYTES) {
    throw new AiStyleError('image_too_large', `Image trop lourde (${(bytes.length / 1048576).toFixed(1)} Mo, maximum ~3,7 Mo) : recadrez ou compressez la capture.`, {
      bytes: bytes.length,
    });
  }

  const detected = detectImageMediaType(bytes);
  const mediaType = detected ?? declared;
  if (!mediaType || !isSupported(mediaType)) {
    throw new AiStyleError('unsupported_media_type', 'Format non supporté : utilisez PNG, JPEG, WebP ou GIF.', { mediaType });
  }
  return { type: 'base64', media_type: mediaType, data: Buffer.from(bytes).toString('base64'), bytes: bytes.length };
}
