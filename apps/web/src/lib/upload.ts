/*
 * Helpers client d'envoi d'images vers POST /api/uploads (livré par la tâche « uploads »).
 * Requête multipart, champ « file », paramètre ?kind=icon|banner|item → réponse { url }.
 */

export type UploadKind = 'icon' | 'banner' | 'item';

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_BYTES = 8 * 1024 * 1024;

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

/** Envoie un fichier image et renvoie son URL publique. Lance une UploadError (message en français) en cas d'échec. */
export async function uploadImage(file: File, kind: UploadKind, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!file.type.startsWith('image/')) throw new UploadError('Format non supporté : choisissez une image (PNG, JPEG, WebP ou GIF).');
  if (file.size > MAX_BYTES) throw new UploadError('Image trop lourde (8 Mo maximum).');
  const body = new FormData();
  body.append('file', file);
  let res: Response;
  try {
    res = await fetchImpl(`/api/uploads?kind=${encodeURIComponent(kind)}`, { method: 'POST', body });
  } catch {
    throw new UploadError("Impossible d'envoyer l'image : vérifiez votre connexion.");
  }
  const json = (await res.json().catch(() => null)) as { url?: unknown; error?: { message?: unknown } } | null;
  if (!res.ok || typeof json?.url !== 'string') {
    const msg = typeof json?.error?.message === 'string' ? json.error.message : `Échec de l'envoi de l'image (${res.status}).`;
    throw new UploadError(msg);
  }
  return json.url;
}

/** Ouvre le sélecteur de fichier du navigateur. Renvoie null si l'utilisateur annule. */
export function pickFile(accept = IMAGE_ACCEPT): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Sélectionne puis envoie une image. null si annulé. */
export async function pickAndUploadImage(kind: UploadKind): Promise<string | null> {
  const file = await pickFile();
  return file ? uploadImage(file, kind) : null;
}
