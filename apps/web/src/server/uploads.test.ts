import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LocalDiskStorage, isSafeKey } from './storage';
import { processImage, storeUpload } from './image-upload';

const png = (w: number, h: number, alpha = 0.5) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 0, b: 0, alpha } } })
    .png()
    .toBuffer();

describe('redimensionnement', () => {
  it('icon : carré 300x300 recadré, WebP avec transparence', async () => {
    const m = await sharp(await processImage(await png(800, 400), 'image/png', 'icon')).metadata();
    expect([m.format, m.width, m.height, m.hasAlpha]).toEqual(['webp', 300, 300, true]);
  });
  it('banner : max 1600x500, ratio conservé', async () => {
    const m = await sharp(await processImage(await png(3200, 800), 'image/png', 'banner')).metadata();
    expect([m.width, m.height]).toEqual([1600, 400]);
  });
  it('item : max 600x600 sans agrandissement', async () => {
    const big = await sharp(await processImage(await png(1200, 900), 'image/png', 'item')).metadata();
    expect([big.width, big.height]).toEqual([600, 450]);
    const small = await sharp(await processImage(await png(200, 100), 'image/png', 'item')).metadata();
    expect([small.width, small.height]).toEqual([200, 100]);
  });
});

describe('types refusés', () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
  );
  it('refuse SVG déclaré', async () => {
    await expect(processImage(svg, 'image/svg+xml', 'icon')).rejects.toMatchObject({ status: 415 });
  });
  it('refuse SVG déguisé en PNG', async () => {
    await expect(processImage(svg, 'image/png', 'icon')).rejects.toMatchObject({ status: 415 });
  });
  it('refuse le texte et les fichiers > 5 Mo', async () => {
    await expect(processImage(Buffer.from('hello'), 'text/plain', 'item')).rejects.toMatchObject({ status: 415 });
    await expect(processImage(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 'item')).rejects.toMatchObject({
      status: 413,
    });
  });
});

describe('stockage et traversée', () => {
  it('clés dangereuses refusées', () => {
    for (const k of ['../secret.webp', 'a/../../x.webp', '/etc/passwd', 'a\\..\\b.webp', 'a/./b.webp', '..', 'x.svg'])
      expect(isSafeKey(k)).toBe(false);
    expect(isSafeKey('icon/usr_1/abc-def.webp')).toBe(true);
  });
  it('get/put ne sortent pas de la racine', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-'));
    writeFileSync(join(dir, 'secret.webp'), 'x');
    const s = new LocalDiskStorage(join(dir, 'uploads'));
    expect(await s.get('../secret.webp')).toBeNull();
    await expect(s.put('../evil.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow();
  });
  it('aller-retour put/get', async () => {
    const s = new LocalDiskStorage(mkdtempSync(join(tmpdir(), 'wl-')));
    const url = await storeUpload(s, 'usr_demo', await png(50, 50), 'image/png', 'item');
    expect(url).toMatch(/^\/api\/uploads\/item\/usr_demo\/[0-9a-f-]+\.webp$/);
    expect((await s.get(url.replace('/api/uploads/', '')))?.contentType).toBe('image/webp');
  });
});

describe('withDecodeSlot (revue 2026-11, C-03)', () => {
  it('au plus MAX_CONCURRENT_DECODES décodages simultanés, file bornée puis 503', async () => {
    const { withDecodeSlot, MAX_CONCURRENT_DECODES, MAX_QUEUED_DECODES } = await import('./image-upload');
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const job = () =>
      withDecodeSlot(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((r) => releases.push(r));
        active--;
      });
    const jobs = Array.from({ length: MAX_CONCURRENT_DECODES + MAX_QUEUED_DECODES }, job);
    await expect(job()).rejects.toMatchObject({ status: 503 });
    while (releases.length || active) {
      await new Promise((r) => setTimeout(r, 0));
      releases.shift()?.();
    }
    await Promise.all(jobs);
    expect(peak).toBe(MAX_CONCURRENT_DECODES);
  });
});

