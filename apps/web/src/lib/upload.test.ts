import { describe, expect, it, vi } from 'vitest';
import { UploadError, uploadImage } from './upload';

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'icon.png', { type: 'image/png' });

describe('uploadImage', () => {
  it('envoie le fichier en multipart (champ « file ») avec le kind et renvoie l’URL', async () => {
    const fetchMock = vi.fn(async () => Response.json({ url: '/api/uploads/icon/abc.webp' }));
    await expect(uploadImage(png(), 'icon', fetchMock as unknown as typeof fetch)).resolves.toBe('/api/uploads/icon/abc.webp');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/uploads?kind=icon');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('remonte le message d’erreur du serveur ou un message générique', async () => {
    const withMsg = vi.fn(async () => Response.json({ error: { code: 'too_large', message: 'Image trop grande.' } }, { status: 413 }));
    await expect(uploadImage(png(), 'banner', withMsg as unknown as typeof fetch)).rejects.toThrow('Image trop grande.');
    const notFound = vi.fn(async () => new Response('Not found', { status: 404 }));
    await expect(uploadImage(png(), 'item', notFound as unknown as typeof fetch)).rejects.toThrow('(404)');
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(uploadImage(png(), 'item', offline as unknown as typeof fetch)).rejects.toThrow(UploadError);
  });

  it('refuse un fichier qui n’est pas une image', async () => {
    const fetchMock = vi.fn();
    await expect(uploadImage(new File(['x'], 'a.txt', { type: 'text/plain' }), 'icon', fetchMock as unknown as typeof fetch)).rejects.toThrow('Format');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
