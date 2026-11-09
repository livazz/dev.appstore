import { getStorage, isSafeKey } from '@/server/storage';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  if (!isSafeKey(key)) return new Response('Introuvable', { status: 404 });
  const f = await getStorage().get(key);
  if (!f) return new Response('Introuvable', { status: 404 });
  return new Response(new Uint8Array(f.buffer), {
    headers: {
      'Content-Type': f.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
