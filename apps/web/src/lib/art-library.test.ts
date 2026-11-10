import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ART_LIBRARY, isLibraryArt } from './art-library';
import { safeImageUrl } from '@/components/store/style-safety';

const PUBLIC = path.resolve(__dirname, '../../public');

describe('bibliothèque d’illustrations', () => {
  it('chaque entrée pointe vers un fichier WebP existant et est reconnue comme illustration de la bibliothèque', () => {
    const urls = ART_LIBRARY.flatMap((c) => c.items.map((i) => i.url));
    expect(urls.length).toBeGreaterThanOrEqual(50);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) {
      expect(isLibraryArt(u)).toBe(true);
      expect(existsSync(path.join(PUBLIC, u))).toBe(true);
    }
  });

  it('n’accepte que des fichiers statiques /art/… en .webp, sans remontée de dossier ni paramètre', () => {
    expect(isLibraryArt('/art/games/crystal-clash/icon.webp')).toBe(true);
    for (const bad of ['/art/items/../../api/x.webp', '/art/items/gems-1.webp?x=1', '/api/admin/x.webp', 'https://evil.test/art/items/a.webp', '/art/items/gems-1.png', '/art/items/Gems.webp', 42]) {
      expect(isLibraryArt(bad)).toBe(false);
    }
  });

  it('les illustrations de la bibliothèque passent safeImageUrl, même sans data URL autorisée', () => {
    expect(safeImageUrl('/art/items/gems-3.webp', null, false)).toBe('/art/items/gems-3.webp');
    expect(safeImageUrl('/art/items/../x.webp', null, false)).toBeNull();
  });
});
