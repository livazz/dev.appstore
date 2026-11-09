import { describe, expect, it } from 'vitest';
import { fitInside, shrinkForUpload } from './shrink-image';

describe('fitInside', () => {
  it('ramène le côté long à 1568 px en gardant les proportions', () => {
    expect(fitInside(1170, 2532)).toEqual({ width: 725, height: 1568 });
    expect(fitInside(3000, 2000)).toEqual({ width: 1568, height: 1045 });
  });
  it("n'agrandit jamais", () => {
    expect(fitInside(400, 520)).toEqual({ width: 400, height: 520 });
  });
});

describe('shrinkForUpload', () => {
  it('renvoie tel quel un fichier déjà léger', async () => {
    const f = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' });
    expect(await shrinkForUpload(f)).toBe(f);
  });
});
