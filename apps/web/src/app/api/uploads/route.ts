import { NextResponse } from 'next/server';
import { getCurrentUser, getUserStudios } from '@/server/session';
import { getStorage } from '@/server/storage';
import {
  MAX_UPLOAD_BODY_BYTES,
  UPLOAD_ROLES,
  UploadError,
  isCrossSiteRequest,
  parseKind,
  readBodyCapped,
  storeUpload,
} from '@/server/image-upload';

export const runtime = 'nodejs';

const TOO_LARGE = 'Fichier trop volumineux (5 Mo max)';

/**
 * POST /api/uploads?kind=icon|banner|item (multipart, champ « file ») → { url }.
 * Réservé aux membres d'un studio pouvant éditer une boutique (CHK-UPL-01) ; requêtes d'un autre site refusées
 * (CHK-AUTH-07) ; corps lu avec un plafond strict ; type réel vérifié et ré-encodage WebP (image-upload.ts).
 */
export async function POST(req: Request) {
  if (isCrossSiteRequest(req)) return NextResponse.json({ error: 'Origine refusée' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise' }, { status: 401 });
  const memberships = await getUserStudios(user.id);
  if (!memberships.some((m) => UPLOAD_ROLES.includes(m.role))) {
    return NextResponse.json({ error: 'Réservé aux membres d’un studio' }, { status: 403 });
  }
  const kind = parseKind(new URL(req.url).searchParams.get('kind'));
  if (!kind) return NextResponse.json({ error: 'Paramètre kind invalide (icon, banner, item)' }, { status: 400 });

  const body = await readBodyCapped(req, MAX_UPLOAD_BODY_BYTES);
  if (!body) return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  let file: FormDataEntryValue | null;
  try {
    const contentType = req.headers.get('content-type') ?? '';
    file = (await new Response(new Uint8Array(body), { headers: { 'content-type': contentType } }).formData()).get('file');
  } catch {
    return NextResponse.json({ error: 'Requête multipart invalide' }, { status: 400 });
  }
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Champ « file » manquant' }, { status: 400 });
  try {
    const url = await storeUpload(getStorage(), user.id, Buffer.from(await file.arrayBuffer()), file.type, kind);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
