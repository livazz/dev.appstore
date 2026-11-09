import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Revue de sécurité (vague 2) — POST /api/uploads et GET /api/uploads/[...key] :
 * CHK-UPL-01 (studio requis), CHK-AUTH-07 (origine), CHK-UPL-02 (type réel, SVG/HTML/polyglotte refusés),
 * CHK-UPL-03 (taille du corps, dimensions), CHK-UPL-04 (clé serveur), CHK-UPL-05 (traversée), CHK-UPL-06 (en-têtes).
 */

const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; name: string },
  roles: [] as string[],
  root: '',
}));

vi.mock('@/server/session', () => ({
  getCurrentUser: async () => h.user,
  getUserStudios: async () => h.roles.map((role, i) => ({ studioId: `std_${i}`, userId: h.user?.id, role })),
}));

vi.mock('@/server/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/storage')>();
  let instance: InstanceType<typeof actual.LocalDiskStorage> | undefined;
  return { ...actual, getStorage: () => (instance ??= new actual.LocalDiskStorage(h.root)) };
});

h.root = mkdtempSync(join(tmpdir(), 'wl-upl-'));
const { MemoryRateLimitStore, setRateLimitStore } = await import('@/server/rate-limit');
const { POST } = await import('./route');
const { GET } = await import('./[...key]/route');

const png = (w = 40, h2 = 40) => sharp({ create: { width: w, height: h2, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } } }).png().toBuffer();

function multipart(bytes: Buffer | string, type: string, filename: string) {
  const fd = new FormData();
  fd.append('file', new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], { type }), filename);
  return fd;
}

function post(body: FormData | ReadableStream<Uint8Array>, headers: Record<string, string> = {}, kind = 'item') {
  return POST(
    new Request(`http://localhost:3013/api/uploads?kind=${kind}`, {
      method: 'POST',
      headers: { host: 'localhost:3013', ...headers },
      body,
      ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
    } as RequestInit),
  );
}

const get = (key: string) => GET(new Request(`http://localhost:3013/api/uploads/${key}`), { params: Promise.resolve({ key: key.split('/') }) });

/** CRC32 (PNG) — pour fabriquer un en-tête IHDR valide annonçant des dimensions énormes. */
function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

async function hugePng(width: number, height: number) {
  const buf = Buffer.from(await png(1, 1));
  // Signature (8 octets) puis bloc IHDR : longueur (4), type (4), données (13), CRC (4).
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf.writeUInt32BE(crc32(buf.subarray(12, 29)), 29);
  return buf;
}

beforeEach(() => {
  setRateLimitStore(new MemoryRateLimitStore());
  h.user = { id: 'usr_dev', email: 'dev@t.test', name: 'Dev' };
  h.roles = ['developer'];
});

describe('POST /api/uploads — accès', () => {
  it('CHK-UPL-01 : 401 sans session, 403 pour un joueur sans studio ou un membre finance', async () => {
    h.user = null;
    expect((await post(multipart(await png(), 'image/png', 'a.png'))).status).toBe(401);
    h.user = { id: 'usr_player', email: 'p@t.test', name: 'P' };
    h.roles = [];
    expect((await post(multipart(await png(), 'image/png', 'a.png'))).status).toBe(403);
    h.roles = ['finance'];
    expect((await post(multipart(await png(), 'image/png', 'a.png'))).status).toBe(403);
  });

  it('CHK-AUTH-07 : requête émise par un autre site refusée (Origin / Sec-Fetch-Site)', async () => {
    expect((await post(multipart(await png(), 'image/png', 'a.png'), { origin: 'https://evil.tld' })).status).toBe(403);
    expect((await post(multipart(await png(), 'image/png', 'a.png'), { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post(multipart(await png(), 'image/png', 'a.png'), { origin: 'http://localhost:3013', 'sec-fetch-site': 'same-origin' })).status).toBe(200);
  });
});

describe('POST /api/uploads — contenu', () => {
  it('CHK-UPL-02 : SVG (même déclaré PNG), HTML renommé et polyglotte GIF/JS refusés', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"><script>alert(1)</script></svg>';
    for (const [bytes, type, name] of [
      [svg, 'image/svg+xml', 'x.svg'],
      [svg, 'image/png', 'x.png'],
      ['<!doctype html><script>alert(document.cookie)</script>', 'image/png', 'x.png'],
      ['GIF89a/*\x00\x00*/=alert(1)//', 'image/gif', 'x.gif'],
    ] as const) {
      const res = await post(multipart(bytes, type, name));
      expect(res.status, name).toBe(415);
    }
  });

  it('CHK-UPL-02/04 : type client et nom de fichier ignorés — clé générée par le serveur, contenu ré-encodé en WebP', async () => {
    const res = await post(multipart(await png(), 'application/octet-stream', '../../../etc/evil.svg'));
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^\/api\/uploads\/item\/usr_dev\/[0-9a-f-]{36}\.webp$/);
    expect(url).not.toContain('evil');
    const served = await get(url.replace('/api/uploads/', ''));
    expect(served.status).toBe(200);
    expect((await sharp(Buffer.from(await served.arrayBuffer())).metadata()).format).toBe('webp');
  });

  it('CHK-UPL-03 : corps trop gros refusé même sans Content-Length (flux), avant lecture complète', async () => {
    let sent = 0;
    const chunk = new Uint8Array(256 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        if (sent > 64 * 1024 * 1024) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const res = await post(stream, { 'content-type': 'multipart/form-data; boundary=x' });
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(8 * 1024 * 1024); // lecture interrompue peu après le plafond
    expect((await post(multipart(await png(), 'image/png', 'a.png'), { 'content-length': String(50 * 1024 * 1024) })).status).toBe(413);
  });

  it('CHK-UPL-03 : image annonçant des dimensions énormes refusée sans décodage (bombe de décompression)', async () => {
    for (const [w, hh] of [[20_000, 20_000], [10_000, 10_000], [70_000, 1_000]]) {
      const res = await post(multipart(await hugePng(w, hh), 'image/png', 'bomb.png'));
      expect(res.status, `${w}x${hh}`).toBe(413);
    }
  });
});

describe('POST /api/uploads — revue 2026-11', () => {
  it('C-03 : limitation de débit par utilisateur → 429 avec Retry-After, sans lire le corps', async () => {
    const body = await png(4, 4);
    for (let i = 0; i < 30; i++) expect((await post(multipart(body, 'image/png', 'a.png'))).status, `upload ${i}`).toBe(200);
    const res = await post(multipart(body, 'image/png', 'a.png'));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    // Un autre utilisateur n'est pas affecté.
    h.user = { id: 'usr_autre', email: 'b@t.test', name: 'B' };
    expect((await post(multipart(body, 'image/png', 'a.png'))).status).toBe(200);
  });

  it('C-03 : plafond abaissé à 24 mégapixels (5 000 × 5 000 refusé)', async () => {
    expect((await post(multipart(await hugePng(5_000, 5_000), 'image/png', 'big.png'))).status).toBe(413);
  });

  it('C-07 : AVIF / HEIF refusés (liste blanche PNG, JPEG, WebP, GIF)', async () => {
    const avif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#08f' } }).avif().toBuffer();
    expect((await post(multipart(avif, 'image/avif', 'a.avif'))).status).toBe(415);
    expect((await post(multipart(avif, 'image/png', 'a.png'))).status).toBe(415);
  });
});

describe('GET /api/uploads/[...key]', () => {
  it('CHK-UPL-05 : clés traversantes ou hors format refusées (404), jamais le contenu', async () => {
    writeFileSync(join(h.root, '..', 'secret.webp'), 'RIFF0000WEBPsecret');
    for (const key of [
      '../secret.webp',
      '..%2F..%2F.env',
      '%2e%2e/%2e%2e/package.json',
      '..\\..\\.env',
      'a/../../.env',
      'item/usr_dev/../../../secret.webp',
      'item/usr_dev/x.webp\u0000.png',
      'item/usr_dev/x.png',
      'item/usr_dev/sub/x.webp',
      'other/usr_dev/x.webp',
      '/etc/passwd',
    ]) {
      const res = await get(key);
      expect(res.status, key).toBe(404);
      expect(await res.text()).not.toContain('secret');
    }
  });

  it('CHK-UPL-06 : en-têtes de service durcis (type forcé, nosniff, CSP sandbox)', async () => {
    const res = await post(multipart(await png(), 'image/png', 'a.png'), {}, 'icon');
    const { url } = (await res.json()) as { url: string };
    const served = await get(url.replace('/api/uploads/', ''));
    expect(served.headers.get('content-type')).toBe('image/webp');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    const csp = served.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('sandbox');
    expect(served.headers.get('content-disposition')).toMatch(/^inline/);
  });

  it('un fichier non WebP déposé sous une clé valide n’est pas servi', async () => {
    mkdirSync(join(h.root, 'item', 'usr_x'), { recursive: true });
    writeFileSync(join(h.root, 'item', 'usr_x', 'planted.webp'), '<html><script>alert(1)</script></html>');
    expect((await get('item/usr_x/planted.webp')).status).toBe(404);
  });
});
