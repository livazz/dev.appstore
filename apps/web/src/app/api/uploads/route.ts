import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/session';
import { getStorage } from '@/server/storage';
import { MAX_UPLOAD_BYTES, UploadError, parseKind, storeUpload } from '@/server/image-upload';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise' }, { status: 401 });
  const kind = parseKind(new URL(req.url).searchParams.get('kind'));
  if (!kind) return NextResponse.json({ error: 'Paramètre kind invalide (icon, banner, item)' }, { status: 400 });
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'Fichier trop volumineux (5 Mo max)' }, { status: 413 });
  }
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get('file');
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
