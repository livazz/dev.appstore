import { AI_STYLE_CLIENT_TARGET_BYTES, AI_STYLE_MAX_SIDE_PX } from '@/lib/ai-style-types';

/** Dimensions réduites (côté long ≤ maxSide, sans agrandir, proportions conservées). */
export function fitInside(width: number, height: number, maxSide = AI_STYLE_MAX_SIDE_PX) {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Réduit la capture dans le navigateur avant l'envoi : les Server Actions refusent par défaut les corps
 * de plus de 1 Mo, et le serveur ne garde de toute façon que 1568 px de côté long. Une image déjà légère
 * est envoyée telle quelle (le serveur la redimensionne et la réencode avec sharp).
 */
export async function shrinkForUpload(file: File, targetBytes = AI_STYLE_CLIENT_TARGET_BYTES): Promise<Blob> {
  if (file.size <= targetBytes || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // format non décodable ici : le serveur tranchera
  }
  const { width, height } = fitInside(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let best: Blob = file;
  for (const quality of [0.92, 0.85, 0.75, 0.6]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    // Safari n'encode pas le WebP (il renvoie du PNG) : JPEG à la place.
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
    if (!blob) break;
    if (blob.size < best.size) best = blob;
    if (blob.size <= targetBytes) break;
  }
  return best;
}
