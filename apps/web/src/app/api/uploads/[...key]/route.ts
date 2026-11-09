import { UPLOAD_RESPONSE_HEADERS, getStorage, isSafeKey, isWebp } from '@/server/storage';

export const runtime = 'nodejs';

const notFound = () =>
  new Response('Introuvable', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });

/** GET /api/uploads/<kind>/<utilisateur>/<id>.webp — clé stricte, contenu WebP vérifié, en-têtes durcis (CHK-UPL-05/06). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  if (!isSafeKey(key)) return notFound();
  const f = await getStorage().get(key);
  // Le contenu doit réellement être du WebP (défense en profondeur si un fichier était déposé hors storeUpload).
  if (!f || !isWebp(f.buffer)) return notFound();
  return new Response(new Uint8Array(f.buffer), { headers: UPLOAD_RESPONSE_HEADERS });
}
